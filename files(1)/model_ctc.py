"""CTC captcha reader: CNN stem -> Transformer encoder (or BiGRU, arch='crnn') -> CTC head.

Input : (105, W/2, 3) float RGB 0..1   (the game's 360/434/542 x 210 image, 2x2 box-averaged)
Output: (T, 28) logits per time step, T = ceil(ceil(W/2 / 2) / 2); last class (index 27) is the CTC blank.

Why a Transformer *encoder* and not a decoder: CTC predicts every time step in parallel, so it needs no
autoregressive decoder. Self-attention lets each column look at the whole captcha (which helps with curves
and overlapping letters). The character count is known from the image width, so decoding uses
fixed_len() = best path that emits exactly N characters.
"""
import numpy as np, tensorflow as tf
from gen import CHARSET

K = tf.keras.layers
C = len(CHARSET)          # 27 answer characters
BLANK = C                 # CTC blank = last class
CFG = dict(arch='transformer', d=192, layers=4, heads=4, ff=768, drop=0.1)
STEM = (24, 48, 96, 128)  # conv stem channels; a smaller student can use narrower ones (same strides, same T)
STRIDES = [(2, 2), (2, 2), (2, 1), (2, 1)]
KERNELS = [5, 3, 3, 3]


def make_stem(chans=STEM):
    """Same conv stack as train2.backbone() up to the Reshape, so its weights can warm-start this one."""
    inp = K.Input((105, None, 3)); x = inp
    for f, k, s in zip(chans, KERNELS, STRIDES):
        x = K.Conv2D(f, k, strides=s, padding='same', use_bias=False)(x)
        x = K.BatchNormalization()(x); x = K.ReLU()(x)
    x = K.Permute((2, 1, 3))(x)              # B, T, 7, C
    x = K.Reshape((-1, 7 * chans[-1]))(x)    # B, T, 7*C (896 for the default stem)
    return tf.keras.Model(inp, x, name='stem')


def load_stem(stem, bb_path):
    """Copy the conv/BN weights of a trained train2.py slot-model backbone (bb_synth.weights.h5) into the stem.
    The backbone does not depend on the character set, so this works even though CHARSET changed."""
    from train2 import backbone
    bb = backbone(); bb.load_weights(bb_path)
    n = 0
    for a, b in zip(stem.layers, bb.layers):
        if a.weights:
            a.set_weights(b.get_weights()); n += 1
    return n


class PosEnc(K.Layer):
    """Sinusoidal position encoding (works for any width)."""
    def call(self, x):
        D = x.shape[-1]; T = tf.shape(x)[1]
        pos = tf.cast(tf.range(T)[:, None], tf.float32)
        i = tf.cast(tf.range(D // 2)[None, :], tf.float32)
        ang = pos / tf.pow(10000., 2. * i / D)
        return x + tf.concat([tf.sin(ang), tf.cos(ang)], -1)[None]


def tblock(x, d, heads, ff, drop):
    h = K.LayerNormalization(epsilon=1e-5)(x)
    h = K.MultiHeadAttention(num_heads=heads, key_dim=d // heads, dropout=drop)(h, h)
    x = x + K.Dropout(drop)(h)
    h = K.LayerNormalization(epsilon=1e-5)(x)
    h = K.Dense(ff, activation='gelu')(h); h = K.Dense(d)(h)
    return x + K.Dropout(drop)(h)


def build(arch='transformer', d=192, layers=4, heads=4, ff=768, drop=0.1, stem=STEM):
    inp = K.Input((105, None, 3))
    x = make_stem(tuple(stem))(inp)
    x = K.Dense(d)(x); x = K.LayerNormalization(epsilon=1e-5)(x)
    if arch == 'transformer':
        x = PosEnc()(x)
        for _ in range(layers):
            x = tblock(x, d, heads, ff, drop)
        x = K.LayerNormalization(epsilon=1e-5)(x)
    else:   # classic CRNN
        for _ in range(2):
            x = K.Bidirectional(K.GRU(d // 2, return_sequences=True, dropout=drop))(x)
    return tf.keras.Model(inp, K.Dense(C + 1)(x), name='ctc_' + arch)


def ctc_loss(logits, labels):
    """logits (B,T,C+1), labels (B,N) int32, all labels the same length N."""
    B = tf.shape(logits)[0]; T = tf.shape(logits)[1]
    return tf.nn.ctc_loss(labels, logits, tf.fill([B], tf.shape(labels)[1]), tf.fill([B], T),
                          logits_time_major=False, blank_index=BLANK)


def log_softmax(lg):
    m = lg.max(-1, keepdims=True)
    return lg - m - np.log(np.exp(lg - m).sum(-1, keepdims=True))


def greedy(lp):
    out = []; prev = -1
    for i in lp.argmax(-1):
        if i != prev and i != BLANK: out.append(CHARSET[i])
        prev = i
    return ''.join(out)


def fixed_len(lp, N):
    """Best CTC path that emits exactly N characters. lp = (T, C+1) log-probs.
    Returns (text, per-character confidences). Falls back to greedy if no such path exists."""
    T, Kc = lp.shape; B = Kc - 1; NEG = -1e18
    cur = np.full((N + 1, Kc), NEG); cur[0, B] = 0.0
    back = np.zeros((T, N + 1, Kc, 2), np.int16)
    for t in range(T):
        nxt = np.full((N + 1, Kc), NEG)
        for k in range(N + 1):
            row = cur[k]; order = np.argsort(row)[::-1]; i1, i2 = order[0], order[1]
            if row[i1] <= NEG / 2: continue
            v = row[i1] + lp[t, B]                                   # blank
            if v > nxt[k, B]: nxt[k, B] = v; back[t, k, B] = (k, i1)
            for c in range(B):
                if row[c] > NEG / 2:                                 # keep emitting the same char
                    v = row[c] + lp[t, c]
                    if v > nxt[k, c]: nxt[k, c] = v; back[t, k, c] = (k, c)
                if k < N:                                            # start a new char
                    s = i1 if i1 != c else i2
                    if row[s] > NEG / 2:
                        v = row[s] + lp[t, c]
                        if v > nxt[k + 1, c]: nxt[k + 1, c] = v; back[t, k + 1, c] = (k, s)
        cur = nxt
    c_end = int(cur[N].argmax())
    if cur[N, c_end] <= NEG / 2:
        g = greedy(lp); return g, [0.0] * len(g)
    syms = [0] * T; k, c = N, c_end
    for t in range(T - 1, -1, -1):
        syms[t] = c; k, c = back[t, k, c]; k, c = int(k), int(c)
    p = np.exp(lp); text = ''; conf = []; prev = -1
    for t, c in enumerate(syms):
        if c != B:
            if c == prev: conf[-1] = max(conf[-1], float(p[t, c]))
            else: text += CHARSET[c]; conf.append(float(p[t, c]))
        prev = c
    return text, conf
