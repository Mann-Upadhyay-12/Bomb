import os, sys, time, glob, random, numpy as np, cv2, tensorflow as tf
from gen import CHARSET
from train2 import backbone, head, logits, load_real, enc, evaluate, save, C

def aug(im, rng):
    """small shift / scale / colour jitter on a half-res image (H=105)."""
    h, w = im.shape[:2]
    s = rng.uniform(0.96, 1.04); tx = rng.uniform(-3, 3); ty = rng.uniform(-3, 3)
    M = np.array([[s, 0, tx + (1 - s) * w / 2], [0, s, ty + (1 - s) * h / 2]], np.float32)
    out = cv2.warpAffine(im, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
    out = out.astype(np.float32) / 255.
    out = out * rng.uniform(0.9, 1.08) + rng.uniform(-0.04, 0.04)
    if rng.random() < 0.25:
        from gen import bezier, pale_color, dark_color
        p0 = np.array([rng.uniform(-10, 20), rng.uniform(20, h - 20)])
        p3 = np.array([rng.uniform(w - 20, w + 10), rng.uniform(20, h - 20)])
        p1 = np.array([rng.uniform(0.15 * w, 0.5 * w), rng.uniform(8, h - 8)])
        p2 = np.array([rng.uniform(0.5 * w, 0.85 * w), rng.uniform(8, h - 8)])
        pts = (bezier(p0, p1, p2, p3) * 8).astype(np.int32).reshape(-1, 1, 2)
        col = tuple(float(c) / 255. for c in (dark_color(rng) if rng.random() < 0.7 else pale_color(rng)))
        cv2.polylines(out, [pts], False, col, 1, cv2.LINE_AA, shift=3)
    return np.clip(out, 0, 1)

def run(train_set, test_set, steps, tag, lr=4e-4):
    rng = random.Random(7)
    bb, hd = backbone(), head()
    if os.path.exists('bb_synth.weights.h5'):
        bb.load_weights('bb_synth.weights.h5')
    if os.path.exists('hd_synth.weights.h5'):
        hd.load_weights('hd_synth.weights.h5')
    else:
        print(f'[{tag}] hd_synth.weights.h5 not found, initializing head from scratch', flush=True)
    opt = tf.keras.optimizers.Adam(tf.keras.optimizers.schedules.CosineDecay(lr, steps, alpha=0.1))
    @tf.function
    def step(x, y, N: int):
        with tf.GradientTape() as tape:
            lg = logits(bb, hd, x, N, True)
            loss = tf.reduce_mean(tf.keras.losses.sparse_categorical_crossentropy(y, lg, from_logits=True))
        vs = bb.trainable_variables + hd.trainable_variables
        opt.apply_gradients(zip(tape.gradient(loss, vs), vs)); return loss
    byN = {n: [(im, t) for im, t in train_set if len(t) == n] for n in (4, 6, 8)}
    it = 0; t0 = time.time()
    while it < steps:
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
        if not byN[N]: continue
        for b in range(0, 320, 20):
            if it >= steps: break
            xs = [X[b + j].astype(np.float32) / 255. for j in range(20)]; ys = list(T[b:b + 20])
            for _ in range(12):
                im, t = rng.choice(byN[N]); xs.append(aug(im, rng)); ys.append(t)
            loss = float(step(np.stack(xs), enc(ys), N)); it += 1
            if it % 100 == 0: print(f'  [{tag}] it {it} loss {loss:.3f} t {time.time()-t0:.0f}s', flush=True)
    if test_set:
        res = evaluate(bb, hd, test_set)
        import json
        stats = []
        for im, t in test_set:
            pr = tf.nn.softmax(logits(bb, hd, im[None].astype(np.float32) / 255., len(t), False)).numpy()[0]
            s_ = ''.join(CHARSET[i] for i in pr.argmax(-1)); mp = pr.max(-1)
            stats.append({'truth': t, 'pred': s_, 'minp': float(mp.min()), 'prod': float(np.prod(mp)), 'n': len(t)})
        json.dump(stats, open(f'cvstats_{tag}.json', 'w'))
    else: res = None
    return bb, hd, res

if __name__ == '__main__':
    mode = sys.argv[1]; steps = int(sys.argv[2])
    real = load_real(); idx = list(range(len(real)))
    if mode == 'cv':
        K = 3; tot_n0 = 0; tot_ok = 0; tot_n = 0; pc = []
        for k in range(K):
            te = [real[i] for i in idx if i % K == k]; tr = [real[i] for i in idx if i % K != k]
            _, _, res = run(tr, te, steps, f'fold{k}')
            print('FOLD', k, res, flush=True); tot_ok += res[0]; tot_n += res[1]; pc.append(res[2])
        print('CV exact', tot_ok, '/', tot_n, 'perchar', np.mean(pc), flush=True)
    else:
        bb, hd, _ = run(real, None, steps, 'final')
        save(bb, hd, 'final'); print('final saved', evaluate(bb, hd, real), flush=True)
