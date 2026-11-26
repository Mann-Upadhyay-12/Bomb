"""spec_io.py — the model ⇄ SPEC (the JSON the app runs) in both directions, with weight quantisation.

    model_to_spec(model, cfg, thresh, scheme)   trained Keras model → SPEC dict (what heistCore loads)
    spec_to_model(spec)                         SPEC → a Keras model that computes exactly what the app
                                                computes (BatchNorm folded, weights decoded from the
                                                stored bytes), so accuracy is measured on what ships.

Weight schemes (`scheme` is one name, or a function layer-name → name for per-layer experiments):
    fp16          2 bytes/weight, the format used so far
    int8_tensor   1 byte/weight, ONE scale for the whole weight matrix
    int8_channel  1 byte/weight, one scale per output channel (per neuron)
    int4_g<G>     ½ byte/weight, one scale per output channel per group of G inputs
    int4_tensor   ½ byte/weight, one scale for the whole matrix (only for sensitivity tests)
Biases and LayerNorm parameters always stay float16 (they are <1 % of the bytes).

Every weight matrix is stored with the OUTPUT channel as the last axis (Keras layout: conv k×k×cin×cout,
dense nin×nout), so "per channel" = per last-axis index.
"""
import base64, json
import numpy as np


# ------------------------------------------------------------------ quantisation maths
def f16(a):
    return np.asarray(a, np.float32).astype(np.float16).astype(np.float32)


def as_matrix(w):
    """any weight → (nin, nout) with nout = last axis."""
    return w.reshape(-1, w.shape[-1])


def quantize(w, scheme):
    """→ (encoded dict or f16 string, dequantised float32 array of the same shape)."""
    w = np.asarray(w, np.float32)
    if scheme == 'fp16':
        return b64(np.float16, w), f16(w)
    m = as_matrix(w); nin, nout = m.shape
    if scheme.startswith('int8'):
        qmax = 127
        amax = np.abs(m).max() * np.ones(nout) if scheme == 'int8_tensor' else np.abs(m).max(0)
        s = f16(np.maximum(amax, 1e-12) / qmax)                     # scale stored as float16
        s[s == 0] = np.float32(6e-8)
        q = np.clip(np.round(m / s), -qmax, qmax).astype(np.int8)
        enc = {'q8': b64(np.int8, q), 's': b64(np.float16, s)}
        return enc, (q * s).reshape(w.shape).astype(np.float32)
    if scheme.startswith('int4'):
        qmax = 7
        G = nin if scheme == 'int4_tensor' else int(scheme.split('_g')[1]) if '_g' in scheme else nin
        ng = -(-nin // G)
        s = np.zeros((ng, nout), np.float32)
        for g in range(ng):
            blk = np.abs(m[g * G:(g + 1) * G])
            s[g] = blk.max() if scheme == 'int4_tensor' else blk.max(0)
        if scheme == 'int4_tensor': s[:] = np.abs(m).max()
        s = f16(np.maximum(s, 1e-12) / qmax); s[s == 0] = np.float32(6e-8)
        sx = np.repeat(s, G, 0)[:nin]
        q = np.clip(np.round(m / sx), -qmax, qmax).astype(np.int8)
        flat = (q.reshape(-1) & 15).astype(np.uint8)
        if flat.size % 2: flat = np.append(flat, 0)
        packed = (flat[0::2] | (flat[1::2] << 4)).astype(np.uint8)   # low nibble first
        enc = {'q4': b64(np.uint8, packed), 's': b64(np.float16, s), 'g': G, 'n': int(q.size)}
        return enc, (q * sx).reshape(w.shape).astype(np.float32)
    raise ValueError(scheme)


def b64(dtype, a):
    return base64.b64encode(np.ascontiguousarray(a, dtype).tobytes()).decode()


def decode(field, shape):
    """SPEC weight field (f16 base64 string, or {'q8'|'q4', 's', ...}) → float32 array of `shape`."""
    if isinstance(field, str):
        return np.frombuffer(base64.b64decode(field), np.float16).astype(np.float32).reshape(shape)
    nout = shape[-1]; n = int(np.prod(shape)); nin = n // nout
    s = np.frombuffer(base64.b64decode(field['s']), np.float16).astype(np.float32)
    if 'q8' in field:
        q = np.frombuffer(base64.b64decode(field['q8']), np.int8).astype(np.float32).reshape(nin, nout)
        return (q * s[None, :]).reshape(shape)
    p = np.frombuffer(base64.b64decode(field['q4']), np.uint8)
    nib = np.empty(p.size * 2, np.int8); nib[0::2] = p & 15; nib[1::2] = p >> 4
    q = np.where(nib > 7, nib - 16, nib)[:n].astype(np.float32).reshape(nin, nout)
    G = field['g']; sx = np.repeat(s.reshape(-1, nout), G, 0)[:nin]
    return (q * sx).reshape(shape)


def sqnr_db(w, wq):
    """signal-to-quantisation-noise ratio: 10·log10(Σw² / Σ(w−wq)²). +6 dB ≈ one more bit."""
    e = np.sum((w - wq) ** 2)
    return float('inf') if e == 0 else float(10 * np.log10(np.sum(w ** 2) / e))


# ------------------------------------------------------------------ model → SPEC
def weight_tensors(model, cfg):
    """[(name, float32 weight with out-channel last, bias)] in the order the app uses them, with each
    conv's BatchNorm folded in, plus the LayerNorms. Also used for per-layer statistics."""
    import tensorflow as tf
    stem = model.get_layer('stem')
    convs = [l for l in stem.layers if isinstance(l, tf.keras.layers.Conv2D)]
    bns = [l for l in stem.layers if isinstance(l, tf.keras.layers.BatchNormalization)]
    out = []
    for i, (c, bn) in enumerate(zip(convs, bns)):
        w = c.get_weights()[0]; g, be, mu, var = bn.get_weights()
        sc = g / np.sqrt(var + bn.epsilon)          # BN(y) = sc·y + (β − μ·sc) → fold into the conv
        out.append((f'stem{i}', w * sc[None, None, None, :], be - mu * sc))
    mhas = [l for l in model.layers if isinstance(l, tf.keras.layers.MultiHeadAttention)]
    lns = [l for l in model.layers if isinstance(l, tf.keras.layers.LayerNormalization)]
    dens = [l for l in model.layers if isinstance(l, tf.keras.layers.Dense)]
    d = cfg['d']
    w, b = dens[0].get_weights(); out.append(('dense0', w, b))
    out.append(('ln0', *lns[0].get_weights()))
    for i in range(cfg['layers']):
        mw = mhas[i].get_weights()
        out.append((f'b{i}.ln_att', *lns[1 + 2 * i].get_weights()))
        for j, nm in enumerate('qkv'):
            out.append((f'b{i}.{nm}', mw[2 * j].reshape(d, d), mw[2 * j + 1].reshape(d)))
        out.append((f'b{i}.o', mw[6].reshape(d, d), mw[7].reshape(d)))
        out.append((f'b{i}.ln_ff', *lns[2 + 2 * i].get_weights()))
        for nm, L in (('up', dens[1 + 2 * i]), ('down', dens[2 + 2 * i])):
            out.append((f'b{i}.{nm}', *L.get_weights()))
    out.append(('ln_final', *lns[-1].get_weights()))
    out.append(('head', *dens[-1].get_weights()))
    return out


def model_to_spec(model, cfg, thresh=0.85, scheme='fp16', charset=None):
    from common import CHARSET
    from model_ctc import STRIDES, KERNELS
    pick = scheme if callable(scheme) else (lambda name: scheme)
    T = {n: (w, b) for n, w, b in weight_tensors(model, cfg)}

    def W(name):
        return quantize(T[name][0], pick(name))[0]

    def B(name):
        return b64(np.float16, T[name][1])

    def LN(name):
        g, be = T[name]; return {'gamma': b64(np.float16, g), 'beta': b64(np.float16, be)}

    stem_c = [T[f'stem{i}'][0].shape for i in range(4)]
    spec = dict(arch='ctc_transformer', charset=charset or CHARSET, blank=len(charset or CHARSET),
                d=cfg['d'], layers=cfg['layers'], heads=cfg['heads'], ff=cfg['ff'], thresh=thresh,
                stem_conv=[dict(k=int(s[0]), cin=int(s[2]), cout=int(s[3]), sy=st[0], sx=st[1],
                                w=W(f'stem{i}'), b=B(f'stem{i}'))
                           for i, (s, st) in enumerate(zip(stem_c, STRIDES))])
    w0 = T['dense0'][0]
    spec['dense0'] = dict(nin=int(w0.shape[0]), nout=int(w0.shape[1]), w=W('dense0'), b=B('dense0'))
    spec['ln0'] = LN('ln0')
    spec['blocks'] = []
    for i in range(cfg['layers']):
        blk = {'ln_att': LN(f'b{i}.ln_att'), 'ln_ff': LN(f'b{i}.ln_ff')}
        for nm in ('q', 'k', 'v', 'o', 'up', 'down'):
            blk[f'{nm}_w'] = W(f'b{i}.{nm}'); blk[f'{nm}_b'] = B(f'b{i}.{nm}')
        spec['blocks'].append(blk)
    spec['ln_final'] = LN('ln_final')
    wh = T['head'][0]
    spec['head'] = dict(nin=int(wh.shape[0]), nout=int(wh.shape[1]), w=W('head'), b=B('head'))
    schemes = sorted({pick(n) for n in T if not n.startswith('ln') and '.ln' not in n})
    spec['weights'] = schemes[0] if len(schemes) == 1 else 'mixed'
    return spec


# ------------------------------------------------------------------ SPEC → Keras (what the app computes)
def spec_to_model(spec):
    import tensorflow as tf
    from model_ctc import PosEnc
    K = tf.keras.layers
    d, H, ff = spec['d'], spec['heads'], spec['ff']
    f32 = lambda s: np.frombuffer(base64.b64decode(s), np.float16).astype(np.float32)
    inp = K.Input((105, None, 3)); x = inp; todo = []
    for l in spec['stem_conv']:
        c = K.Conv2D(l['cout'], l['k'], strides=(l['sy'], l['sx']), padding='same', activation='relu')
        x = c(x); todo.append((c, [decode(l['w'], (l['k'], l['k'], l['cin'], l['cout'])), f32(l['b'])]))
    cl = spec['stem_conv'][-1]['cout']
    x = K.Permute((2, 1, 3))(x); x = K.Reshape((-1, 7 * cl))(x)

    def dense(x, n, field_w, field_b, nin, act=None):
        L = K.Dense(n, activation=act); y = L(x)
        todo.append((L, [decode(field_w, (nin, n)), f32(field_b)])); return y

    def ln(x, p):
        L = K.LayerNormalization(epsilon=1e-5); y = L(x); todo.append((L, [f32(p['gamma']), f32(p['beta'])])); return y

    x = dense(x, d, spec['dense0']['w'], spec['dense0']['b'], spec['dense0']['nin'])
    x = ln(x, spec['ln0']); x = PosEnc()(x)
    dk = d // H
    for b in spec['blocks']:
        h = ln(x, b['ln_att'])
        M = K.MultiHeadAttention(num_heads=H, key_dim=dk); h = M(h, h)
        mw = []
        for nm in 'qkv':
            mw += [decode(b[f'{nm}_w'], (d, d)).reshape(d, H, dk), f32(b[f'{nm}_b']).reshape(H, dk)]
        mw += [decode(b['o_w'], (d, d)).reshape(H, dk, d), f32(b['o_b'])]
        todo.append((M, mw))
        x = x + h
        h = ln(x, b['ln_ff'])
        h = dense(h, ff, b['up_w'], b['up_b'], d, 'gelu'); h = dense(h, d, b['down_w'], b['down_b'], ff)
        x = x + h
    x = ln(x, spec['ln_final'])
    x = dense(x, spec['head']['nout'], spec['head']['w'], spec['head']['b'], d)
    model = tf.keras.Model(inp, x)
    for L, ws in todo: L.set_weights(ws)
    return model


def spec_bytes(spec):
    """size of the SPEC as the app embeds it (JSON text)."""
    return len(json.dumps(spec))
