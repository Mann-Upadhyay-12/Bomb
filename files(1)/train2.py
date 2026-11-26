import os, sys, time, glob, random, numpy as np, cv2, tensorflow as tf
from gen import CHARSET
from gen2 import SIZES
DATA_DIR = os.environ.get('CAPTCHA_DIR')
if not DATA_DIR:
    for cand in ['captcja', '../captcja', '../../captcja', os.path.join(os.path.dirname(__file__), '..', 'captcja')]:
        if os.path.isdir(cand):
            DATA_DIR = os.path.abspath(cand)
            break
if not DATA_DIR:
    DATA_DIR = '/home/claude/data/captcja'
C = len(CHARSET); K = tf.keras.layers; R = 7; WIN = 2 * R + 1; FD = 128
def backbone():
    inp = tf.keras.Input((105, None, 3))
    def cbr(x, f, k, s):
        x = K.Conv2D(f, k, strides=s, padding='same', use_bias=False)(x)
        x = K.BatchNormalization()(x); return K.ReLU()(x)
    x = cbr(inp, 24, 5, 2); x = cbr(x, 48, 3, 2); x = cbr(x, 96, 3, (2, 1)); x = cbr(x, 128, 3, (2, 1))
    x = K.Permute((2, 1, 3))(x); x = K.Reshape((-1, 7 * 128))(x)
    x = K.Dense(FD, activation='relu')(x)
    x = K.Conv1D(FD, 5, padding='same', activation='relu')(x)
    x = K.Conv1D(FD, 5, padding='same', activation='relu')(x)
    return tf.keras.Model(inp, x)
def head():
    return tf.keras.Sequential([tf.keras.Input((WIN * FD,)), K.Dense(256, activation='relu'), K.Dropout(0.25), K.Dense(C)])
def slot_idx(N):
    Wq, sw = SIZES[N]; x0 = (Wq - N * sw) / 2.0
    idx = []
    for i in range(N):
        c = int(round((x0 + sw * (i + .5) - 1.5) / 4.0))
        idx.append([c + j + R for j in range(-R, R + 1)])
    return np.clip(np.array(idx, np.int32), 0, 10 ** 6)
def logits(bb, hd, x, N, training):
    f = bb(x, training=training); f = tf.pad(f, [[0, 0], [R, R], [0, 0]])
    g = tf.gather(f, slot_idx(N).reshape(-1), axis=1)          # B, N*WIN, FD
    B = tf.shape(g)[0]
    g = tf.reshape(g, [B * N, WIN * FD])
    return tf.reshape(hd(g, training=training), [B, N, C])
def load_real(d=None):
    d = d or DATA_DIR
    out = []
    for f in sorted(os.listdir(d)):
        if not f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')): continue
        t = os.path.splitext(f)[0].split('-')[0]
        bad = [c for c in t if c not in CHARSET]
        if bad: print('SKIPPED (not a possible answer character %s):' % ''.join(bad), f); continue
        im = cv2.cvtColor(cv2.imread(os.path.join(d, f)), cv2.COLOR_BGR2RGB)
        if {360: 4, 434: 6, 542: 8}.get(im.shape[1]) != len(t) or im.shape[0] != 210:
            print('SKIPPED (size %dx%d does not match %d characters):' % (im.shape[1], im.shape[0], len(t)), f); continue
        out.append((cv2.resize(im, (im.shape[1] // 2, 105), interpolation=cv2.INTER_AREA), t))
    return out
def enc(ts): return np.array([[CHARSET.index(c) for c in t] for t in ts], np.int32)
def evaluate(bb, hd, real):
    ok = cc = tot = 0; by = {4: [0, 0], 6: [0, 0], 8: [0, 0]}
    for im, t in real:
        N = len(t)
        p = logits(bb, hd, im[None].astype(np.float32) / 255., N, False).numpy()[0].argmax(-1)
        s = ''.join(CHARSET[i] for i in p)
        ok += (s == t); cc += sum(a == b for a, b in zip(s, t)); tot += N
        by[N][0] += (s == t); by[N][1] += 1
    return ok, len(real), round(cc / tot, 3), by
def save(bb, hd, tag):
    bb.save_weights(f'bb_{tag}.weights.h5'); hd.save_weights(f'hd_{tag}.weights.h5')
if __name__ == '__main__':
    budget = float(sys.argv[1]) * 60; total_steps = int(sys.argv[2])
    bb, hd = backbone(), head()
    if len(sys.argv) > 3 and sys.argv[3] == 'resume':
        bb.load_weights('bb_synth.weights.h5'); hd.load_weights('hd_synth.weights.h5')
    opt = tf.keras.optimizers.Adam(tf.keras.optimizers.schedules.CosineDecay(1.2e-3 if len(sys.argv) > 3 else 1.5e-3, total_steps, alpha=0.03))
    @tf.function
    def step(x, y, N: int):
        with tf.GradientTape() as tape:
            lg = logits(bb, hd, x, N, True)
            loss = tf.reduce_mean(tf.keras.losses.sparse_categorical_crossentropy(y, lg, from_logits=True))
        vs = bb.trainable_variables + hd.trainable_variables
        opt.apply_gradients(zip(tape.gradient(loss, vs), vs))
        return loss
    real = load_real(); t0 = time.time(); it = 0; last = 0; run = []
    while time.time() - t0 < budget and it < total_steps:
        cs = [c for c in sorted(glob.glob('chunks/c*.npz')) if not c.endswith('_tmp.npz')]
        if not cs:
            try:
                from producer import generate_chunk
                generate_chunk(it // 10, random.Random(it))
                cs = [c for c in sorted(glob.glob('chunks/c*.npz')) if not c.endswith('_tmp.npz')]
            except Exception:
                pass
        if not cs: time.sleep(1); continue
        d = np.load(cs[0]); X = d['X']; T = d['T']; os.remove(cs[0]); N = len(T[0])
        idx = np.random.permutation(len(X))
        for b in range(0, len(X) - 31, 32):
            sel = idx[b:b + 32]
            loss = float(step(X[sel].astype(np.float32) / 255., enc(T[sel]), N)); it += 1; run.append(loss)
            if it % 50 == 0:
                print(f'it {it} loss {np.mean(run[-50:]):.3f} t {time.time()-t0:.0f}s', flush=True)
            if it - last >= 250:
                last = it; print('  REAL', evaluate(bb, hd, real), flush=True); save(bb, hd, 'synth')
    save(bb, hd, 'synth'); print('done', evaluate(bb, hd, real), flush=True)
