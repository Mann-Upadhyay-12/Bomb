"""Train the CTC captcha model (model_ctc.py).

  python producer.py &                                   # fake captchas -> chunks/ (keep running)

  1) pretrain on fake captchas (warm-start the conv stem from the old slot model so CTC escapes its
     usual 'predict only blanks' plateau):
  python train_ctc.py pretrain --minutes 90 --steps 12000 --stem bb_synth.weights.h5

  2) honest held-out accuracy on your real images (writes cvstats_ctc_fold*.json for calibrate.py):
  python train_ctc.py cv --steps 800 --folds 5
  python calibrate.py cvstats_ctc_fold

  3) final model on ALL real images -> ctc_final.weights.h5:
  python train_ctc.py final --steps 800

Real images: folder from $CAPTCHA_DIR (see train2.py), named answer.png / answer-DIFF.png.
Architecture flags (--arch transformer|crnn --d --layers --heads --ff) are saved to ctc_cfg.json at pretrain
and re-used by cv/final, so only set them on `pretrain`.
"""
import os, sys, time, glob, json, math, random, argparse, numpy as np, tensorflow as tf
from gen import CHARSET
from model_ctc import build, load_stem, ctc_loss, fixed_len, greedy, log_softmax, CFG
from train2 import load_real
from finetune import aug


def enc(ts): return np.array([[CHARSET.index(c) for c in t] for t in ts], np.int32)


class WarmCos(tf.keras.optimizers.schedules.LearningRateSchedule):
    def __init__(self, peak, warm, total, floor=0.03):
        self.peak, self.warm, self.total, self.floor = peak, warm, total, floor
    def __call__(self, step):
        s = tf.cast(step, tf.float32)
        w = self.peak * s / max(self.warm, 1)
        pr = tf.clip_by_value((s - self.warm) / max(self.total - self.warm, 1), 0., 1.)
        c = self.peak * (self.floor + (1 - self.floor) * 0.5 * (1 + tf.cos(math.pi * pr)))
        return tf.where(s < self.warm, w, c)
    def get_config(self): return dict(peak=self.peak, warm=self.warm, total=self.total, floor=self.floor)


def get_cfg(args):
    if args.cmd == 'pretrain':
        cfg = dict(CFG)
        for k in ('arch', 'd', 'layers', 'heads', 'ff', 'drop'):
            if getattr(args, k) is not None: cfg[k] = getattr(args, k)
        json.dump(cfg, open('ctc_cfg.json', 'w'))
        return cfg
    return json.load(open('ctc_cfg.json')) if os.path.exists('ctc_cfg.json') else dict(CFG)


def make_opt(model, peak, warm, total):
    opt = tf.keras.optimizers.AdamW(WarmCos(peak, warm, total), weight_decay=1e-4, clipnorm=1.0)
    opt.build(model.trainable_variables)
    return opt


def make_step(model, opt, train_vars):
    @tf.function
    def step(x, y):
        with tf.GradientTape() as tape:
            loss = tf.reduce_mean(ctc_loss(model(x, training=True), y))
        opt.apply_gradients(zip(tape.gradient(loss, train_vars), train_vars))
        return loss
    return step


def evaluate(model, data, want_stats=False):
    ok_fix = ok_greedy = cc = tot = 0; by = {4: [0, 0], 6: [0, 0], 8: [0, 0]}; stats = []
    for im, t in data:
        N = len(t)
        lp = log_softmax(model(im[None].astype(np.float32) / 255., training=False).numpy()[0])
        s, conf = fixed_len(lp, N); g = greedy(lp)
        ok_fix += (s == t); ok_greedy += (g == t); by[N][0] += (s == t); by[N][1] += 1
        cc += sum(a == b for a, b in zip(s, t)); tot += N
        stats.append(dict(truth=t, pred=s, minp=min(conf) if conf else 0., prod=float(np.prod(conf)) if conf else 0., n=N))
    res = dict(exact=ok_fix, of=len(data), exact_greedy=ok_greedy, perchar=round(cc / max(tot, 1), 3), by_len=by)
    return (res, stats) if want_stats else res


def next_chunk():
    k = 0
    while True:
        cs = [c for c in sorted(glob.glob('chunks/c*.npz')) if not c.endswith('_tmp.npz')]
        if cs:
            d = np.load(cs[0]); X, T = d['X'], d['T']; os.remove(cs[0]); return X, T, len(T[0])
        try:
            from producer import generate_chunk
            generate_chunk(k, random.Random(k))
            k += 1
            cs = [c for c in sorted(glob.glob('chunks/c*.npz')) if not c.endswith('_tmp.npz')]
            if cs:
                d = np.load(cs[0]); X, T = d['X'], d['T']; os.remove(cs[0]); return X, T, len(T[0])
        except Exception:
            pass
        time.sleep(1)


def pretrain(args):
    cfg = get_cfg(args); model = build(**cfg)
    if args.stem:
        print('stem warm-start from', args.stem, '->', load_stem(model.get_layer('stem'), args.stem), 'layers copied')
    real = load_real(); print(len(real), 'real images for monitoring')
    stem_ids = {id(v) for v in model.get_layer('stem').trainable_variables}
    all_vars = model.trainable_variables; head_vars = [v for v in all_vars if id(v) not in stem_ids]
    opt = make_opt(model, args.lr, args.warmup, args.steps)
    step_frozen = make_step(model, opt, head_vars); step_all = make_step(model, opt, all_vars)
    t0 = time.time(); it = 0; run = []
    while time.time() - t0 < args.minutes * 60 and it < args.steps:
        X, T, N = next_chunk(); idx = np.random.permutation(len(X))
        for b in range(0, len(X) - args.batch + 1, args.batch):
            sel = idx[b:b + args.batch]
            step = step_frozen if (args.stem and it < args.freeze) else step_all   # stem frozen for the first steps
            run.append(float(step(X[sel].astype(np.float32) / 255., enc(T[sel])))); it += 1
            if it % 50 == 0: print(f'it {it} loss {np.mean(run[-50:]):.3f} t {time.time()-t0:.0f}s', flush=True)
            if it % 250 == 0:
                print('  REAL', evaluate(model, real), flush=True); model.save_weights('ctc_synth.weights.h5')
            if it >= args.steps: break
    model.save_weights('ctc_synth.weights.h5'); print('done', evaluate(model, real), flush=True)


def finetune(train_set, test_set, steps, tag, args):
    cfg = get_cfg(args); model = build(**cfg); model.load_weights('ctc_synth.weights.h5')
    opt = make_opt(model, args.ft_lr, 40, steps); step = make_step(model, opt, model.trainable_variables)
    rng = random.Random(7); byN = {n: [s for s in train_set if len(s[1]) == n] for n in (4, 6, 8)}
    hard_byN = {n: [s for s in byN[n] if any(c in s[1] for c in ('4', 'A', 'r', 'a', '5'))] for n in (4, 6, 8)}
    it = 0; t0 = time.time(); n_syn = args.synth_per_batch; n_real = args.real_per_batch
    while it < steps:
        X, T, N = next_chunk()
        if not byN[N]: continue
        for b in range(0, len(X) - n_syn + 1, n_syn):
            if it >= steps: break
            xs = [X[b + j].astype(np.float32) / 255. for j in range(n_syn)]; ys = list(T[b:b + n_syn])
            for _ in range(n_real):
                if hard_byN[N] and rng.random() < 0.6:
                    im, t = rng.choice(hard_byN[N])
                else:
                    im, t = rng.choice(byN[N])
                xs.append(aug(im, rng)); ys.append(t)
            loss = float(step(np.stack(xs), enc(ys))); it += 1
            if it % 100 == 0: print(f'  [{tag}] it {it} loss {loss:.3f} t {time.time()-t0:.0f}s', flush=True)
    return model


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('cmd', choices=['pretrain', 'cv', 'final'])
    ap.add_argument('--minutes', type=float, default=60); ap.add_argument('--steps', type=int, default=None)
    ap.add_argument('--batch', type=int, default=32); ap.add_argument('--lr', type=float, default=5e-4)
    ap.add_argument('--warmup', type=int, default=300); ap.add_argument('--freeze', type=int, default=300,
                    help='keep the warm-started conv stem frozen for this many steps')
    ap.add_argument('--stem', default=None, help='bb_synth.weights.h5 from train2.py (recommended)')
    ap.add_argument('--arch', default=None); ap.add_argument('--d', type=int, default=None)
    ap.add_argument('--layers', type=int, default=None); ap.add_argument('--heads', type=int, default=None)
    ap.add_argument('--ff', type=int, default=None); ap.add_argument('--drop', type=float, default=None)
    ap.add_argument('--folds', type=int, default=5); ap.add_argument('--ft_lr', type=float, default=3e-4)
    ap.add_argument('--synth_per_batch', type=int, default=20); ap.add_argument('--real_per_batch', type=int, default=12)
    args = ap.parse_args()
    if args.steps is None: args.steps = 12000 if args.cmd == 'pretrain' else 800
    if args.cmd == 'pretrain': return pretrain(args)
    real = load_real(); print(len(real), 'real images')
    if args.cmd == 'cv':
        tot_ok = tot_n = 0; pc = []
        for k in range(args.folds):
            te = [r for i, r in enumerate(real) if i % args.folds == k]; tr = [r for i, r in enumerate(real) if i % args.folds != k]
            model = finetune(tr, te, args.steps, f'fold{k}', args)
            res, stats = evaluate(model, te, True); json.dump(stats, open(f'cvstats_ctc_fold{k}.json', 'w'))
            print('FOLD', k, res, flush=True); tot_ok += res['exact']; tot_n += res['of']; pc.append(res['perchar'])
        print(f'CV exact {tot_ok}/{tot_n} = {tot_ok / tot_n:.3f}   perchar {np.mean(pc):.3f}', flush=True)
    else:
        model = finetune(real, None, args.steps, 'final', args)
        model.save_weights('ctc_final.weights.h5'); print('saved ctc_final.weights.h5 (train-set check, not a real accuracy):', evaluate(model, real), flush=True)


if __name__ == '__main__':
    main()
