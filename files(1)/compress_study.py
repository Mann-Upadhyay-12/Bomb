#!/usr/bin/env python3
"""
compress_study.py — make the captcha reader smaller/faster and measure what each change costs, honestly.

Every number comes from 5-fold cross-validation: each captcha is scored by a model that never trained
on it (same folds as train_captcha.py: image i is in fold i % 5).

Stages (each caches its results in study/, re-running skips finished work):
  teachers   fine-tune the current architecture once per fold (the baseline = what ships today)
  quant      the fold teachers exported as fp16 / int8 per-tensor / int8 per-channel / int4 groups,
             re-read from the exported bytes, scored on their held-out fold
  sens       per-layer sensitivity: one layer at a time in crude int4, everything else fp16
  students   smaller models: synthetic pretraining, then per-fold fine-tuning, with and without
             distillation from the fold teacher's 5-read (TTA) average
  final      the chosen student trained on all images, exported → study/spec_final.json
  report     tables + adaptive-TTA calibration → study/report.md

    .venv/bin/python compress_study.py all
"""
import os, sys, json, time, math, random, pickle, argparse, multiprocessing as mp
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]   # files(1) modules + train_captcha.py
OUT = os.path.join(HERE, 'study')
FOLDS = 5
SHIFTS = [(0, 0), (0, -2), (0, 2), (-4, 0), (4, 0)]
COL = 4
TARGET = 0.98

STUDENTS = {
    # same conv stem as the teacher (copied from its synthetic pretraining), small transformer
    'S128x2': dict(cfg=dict(arch='transformer', d=128, layers=2, heads=4, ff=256, drop=0.1),
                   pre_steps=4000, kd=True, copy_stem=True),
    # the same student trained the usual way (CTC only, no teacher) — does distillation matter?
    'S128x2_ctc': dict(cfg=dict(arch='transformer', d=128, layers=2, heads=4, ff=256, drop=0.1),
                       pre_steps=4000, kd=False, copy_stem=True),
    # gentler cut: keep the width, halve the depth and the feed-forward (−60 % transformer weights)
    'S192x2': dict(cfg=dict(arch='transformer', d=192, layers=2, heads=4, ff=384, drop=0.1),
                   pre_steps=6000, kd=True, copy_stem=True),
    # narrower conv stem too (the stem is ~half of the compute); trained from scratch by the teacher
    'S96stem': dict(cfg=dict(arch='transformer', d=128, layers=2, heads=4, ff=256, drop=0.1,
                             stem=[16, 32, 64, 96]),
                    pre_steps=8000, kd=True, copy_stem=False),
}
FT_STEPS_STUDENT = 1200
ALPHA, TAU = 0.5, 2.0          # loss = α·CTC + (1−α)·τ²·KL(teacher_τ ‖ student_τ)


def log(*a):
    msg = ' '.join(str(x) for x in a)
    print(msg, flush=True)
    with open(os.path.join(OUT, 'log.txt'), 'a') as f: f.write(msg + '\n')


# ------------------------------------------------------------------ decoding (vectorised fixed_len)
def fixed_len_fast(lp, N):
    """Same result as model_ctc.fixed_len (best CTC path with exactly N characters), vectorised over
    characters and positions — ~50× faster, so dozens of variants can be scored."""
    import numpy as np
    from model_ctc import greedy
    from common import CHARSET
    T, Kc = lp.shape; B = Kc - 1; NEG = -1e18
    cur = np.full((N + 1, Kc), NEG); cur[0, B] = 0.0
    back_k = np.zeros((T, N + 1, Kc), np.int16); back_c = np.zeros((T, N + 1, Kc), np.int16)
    ks = np.arange(N + 1)[:, None]; cs = np.arange(B)[None, :]
    for t in range(T):
        order = np.argsort(-cur, axis=1, kind='stable')
        i1, i2 = order[:, 0], order[:, 1]
        alive = cur[ks[:, 0], i1] > NEG / 2
        nxt = np.full((N + 1, Kc), NEG); bk = np.zeros((N + 1, Kc), np.int16); bc = np.zeros((N + 1, Kc), np.int16)
        # blank: from the best entry of the same row
        v = np.where(alive, cur[ks[:, 0], i1] + lp[t, B], NEG)
        nxt[:, B] = v; bk[:, B] = ks[:, 0]; bc[:, B] = i1
        # new character c at row k+1, from row k's best entry that isn't c
        s = np.where(i1[:, None] != cs, i1[:, None], i2[:, None])            # (N+1, B)
        rs = cur[ks, s]
        newv = np.where(alive[:, None] & (rs > NEG / 2), rs + lp[t, None, :B], NEG)[:N]   # rows 0..N-1 → 1..N
        # keep emitting c in row k
        stay = np.where(alive[:, None] & (cur[:, :B] > NEG / 2), cur[:, :B] + lp[t, None, :B], NEG)
        # original loop order: row k's "new" candidates (into k+1) are written before row k+1's "stay",
        # and a later candidate wins only if strictly greater
        cand_new = np.full((N + 1, B), NEG); cand_new[1:] = newv
        use_new = cand_new >= stay
        nxt[:, :B] = np.where(use_new, cand_new, stay)
        src_k_new = np.broadcast_to(ks - 1, (N + 1, B)); src_c_new = np.zeros((N + 1, B), np.int64); src_c_new[1:] = s[:N]
        bk[:, :B] = np.where(use_new, src_k_new, np.broadcast_to(ks, (N + 1, B)))
        bc[:, :B] = np.where(use_new, src_c_new, np.broadcast_to(cs, (N + 1, B)))
        nxt[:, :B][(cand_new <= NEG / 2) & (stay <= NEG / 2)] = NEG
        back_k[t], back_c[t] = bk, bc
        cur = nxt
    c_end = int(cur[N].argmax())
    if cur[N, c_end] <= NEG / 2:
        g = greedy(lp); return g, [0.0] * len(g)
    syms = [0] * T; k, c = N, c_end
    for t in range(T - 1, -1, -1):
        syms[t] = c; k, c = int(back_k[t, k, c]), int(back_c[t, k, c])
    p = np.exp(lp); text = ''; conf = []; prev = -1
    for t, c in enumerate(syms):
        if c != B:
            if c == prev: conf[-1] = max(conf[-1], float(p[t, c]))
            else: text += CHARSET[c]; conf.append(float(p[t, c]))
        prev = c
    return text, conf


# ------------------------------------------------------------------ reading + scoring
def shift_batch(x, dx, dy):
    import numpy as np
    H, W = x.shape[1:3]
    ys = np.clip(np.arange(H) - dy, 0, H - 1); xs = np.clip(np.arange(W) - dx, 0, W - 1)
    return x[:, ys][:, :, xs]


def tta_average(lps):
    """lps (S, T, C) per-shift log-probs → (T, C) log of the aligned average probability."""
    import numpy as np
    T = lps.shape[1]
    al = [lps[k][np.clip(np.arange(T) + dx // COL, 0, T - 1)] for k, (dx, dy) in enumerate(SHIFTS)]
    return np.log(np.maximum(np.mean([np.exp(a) for a in al], 0), 1e-30))


def read_all(model, data):
    """→ list of (S, T, C) log-prob arrays, one per captcha, one row per TTA shift."""
    import numpy as np
    from model_ctc import log_softmax
    out = []
    for im, t in data:
        x = im[None].astype(np.float32) / 255.
        batch = np.concatenate([shift_batch(x, dx, dy) for dx, dy in SHIFTS])
        out.append(np.stack([log_softmax(z) for z in model(batch, training=False).numpy()]).astype(np.float32))
    return out


def _score_one(a):
    import numpy as np
    lps, truth = a; N = len(truth)
    singles = [fixed_len_fast(l, N) for l in lps]
    s1, c1 = singles[0]
    s, c = fixed_len_fast(tta_average(lps), N)
    agree = sum(x[0] == s for x in singles) / len(singles)
    prod = lambda cc: float(np.prod(cc)) if cc else 0.
    return dict(truth=truth, n=N, pred=s1, prod=prod(c1), tta_pred=s, tta_prod=prod(c), agree=agree,
                tta_conf=prod(c) * agree)


def score(lps_list, truths, pool=None):
    args = list(zip(lps_list, truths))
    return pool.map(_score_one, args, chunksize=8) if pool else [_score_one(a) for a in args]


def calib(rows, target=TARGET):
    """rows: (confidence, right) → best threshold whose trusted answers are ≥target right."""
    rows = sorted(rows, key=lambda r: -r[0]); ok = 0; best = None
    for i, (sc, right) in enumerate(rows):
        ok += right
        if ok / (i + 1) >= target and (i + 1 == len(rows) or rows[i + 1][0] < sc):
            best = dict(thresh=sc, coverage=(i + 1) / len(rows), precision=ok / (i + 1))
    return best


def adaptive(st, stop):
    """read once; if that read's confidence ≥ stop, answer it; else all 5 reads averaged."""
    res = []
    for s in st:
        early = s['prod'] >= stop
        res.append(dict(pred=s['pred'] if early else s['tta_pred'], conf=s['prod'] if early else s['tta_conf'],
                        reads=1 if early else len(SHIFTS), truth=s['truth']))
    return res


def mcnemar(a, b):
    """paired test on the same captchas: a, b = lists of right/wrong. → (only a right, only b right, p)."""
    x = sum(1 for p, q in zip(a, b) if p and not q); y = sum(1 for p, q in zip(a, b) if q and not p)
    n = x + y
    if n == 0: return x, y, 1.0
    k = min(x, y); p = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return x, y, min(1.0, 2 * p)


def summary(st, name):
    right1 = [s['pred'] == s['truth'] for s in st]; right5 = [s['tta_pred'] == s['truth'] for s in st]
    c1 = calib([(s['prod'], r) for s, r in zip(st, right1)]); c5 = calib([(s['tta_conf'], r) for s, r in zip(st, right5)])
    chars = sum(s['n'] for s in st)
    return dict(name=name, n=len(st), acc1=sum(right1) / len(st), acc5=sum(right5) / len(st),
                char1=sum(sum(a == b for a, b in zip(s['pred'], s['truth'])) for s in st) / chars,
                cov1=c1['coverage'] if c1 else 0, cov5=c5['coverage'] if c5 else 0,
                thr1=c1['thresh'] if c1 else None, thr5=c5['thresh'] if c5 else None,
                right1=right1, right5=right5)


# ------------------------------------------------------------------ training
def setup_producers(n):
    import train_captcha as tc
    os.makedirs('chunks', exist_ok=True)
    procs = [mp.Process(target=tc.producer_worker, args=(HERE, w, n, 4 * n), daemon=True) for w in range(n)]
    for p in procs: p.start()
    return procs


def folds(real):
    for k in range(FOLDS):
        yield k, [r for i, r in enumerate(real) if i % FOLDS != k], [r for i, r in enumerate(real) if i % FOLDS == k]


def teacher_args():
    return argparse.Namespace(ft_lr=3e-4, synth_per_batch=20, real_per_batch=12, hard_frac=0.6)


def train_student(cfg, init, steps, real_tr, teacher, kd, hard, lr, tag, synth_only=False, copy_stem_from=None):
    """KD (or plain CTC) training of a student. teacher: Keras model whose 5-read average is the target."""
    import numpy as np, tensorflow as tf
    from model_ctc import build, ctc_loss
    from train_ctc import make_opt, next_chunk, enc
    from finetune import aug
    model = build(**cfg)
    if init: model.load_weights(init)
    if copy_stem_from is not None:
        model.get_layer('stem').set_weights(copy_stem_from.get_layer('stem').get_weights())
    opt = make_opt(model, lr, 40 if not synth_only else 300, steps)
    V = model.trainable_variables

    @tf.function(reduce_retracing=True)
    def t_logp(x):
        return tf.nn.log_softmax(teacher(x, training=False))

    @tf.function(reduce_retracing=True)
    def step_kd(x, y, tgt):
        with tf.GradientTape() as tape:
            z = model(x, training=True)
            l_ctc = tf.reduce_mean(ctc_loss(z, y))
            ls = tf.nn.log_softmax(z / TAU)
            kl = tf.reduce_mean(tf.reduce_sum(tf.exp(tgt) * (tgt - ls), [1, 2])) * TAU ** 2
            loss = ALPHA * l_ctc + (1 - ALPHA) * kl
        opt.apply_gradients(zip(tape.gradient(loss, V), V))
        return l_ctc, kl

    @tf.function(reduce_retracing=True)
    def step_ctc(x, y):
        with tf.GradientTape() as tape:
            l_ctc = tf.reduce_mean(ctc_loss(model(x, training=True), y))
        opt.apply_gradients(zip(tape.gradient(l_ctc, V), V))
        return l_ctc, tf.constant(0.)

    def targets(x):
        B = len(x)
        big = np.concatenate([shift_batch(x, dx, dy) for dx, dy in SHIFTS])
        lp = t_logp(big).numpy().reshape(len(SHIFTS), B, -1, 28)
        T = lp.shape[2]
        al = [lp[k][:, np.clip(np.arange(T) + dx // COL, 0, T - 1)] for k, (dx, dy) in enumerate(SHIFTS)]
        p = np.mean([np.exp(a) for a in al], 0)
        tl = np.log(np.maximum(p, 1e-30)) / TAU
        tl = tl - np.log(np.exp(tl - tl.max(-1, keepdims=True)).sum(-1, keepdims=True)) - tl.max(-1, keepdims=True)
        return tl.astype(np.float32)

    rng = random.Random(11)
    byN = {n: [s for s in real_tr if len(s[1]) == n] for n in (4, 6, 8)} if real_tr else {}
    hard_byN = {n: [s for s in byN[n] if any(c in hard for c in s[1])] for n in byN}
    n_syn, n_real = (32, 0) if synth_only else (20, 12)
    it = 0; t0 = time.time(); hist = []
    while it < steps:
        X, Tx, N = next_chunk()
        if not synth_only and not byN.get(N): continue
        for b in range(0, len(X) - n_syn + 1, n_syn):
            if it >= steps: break
            xs = [X[b + j].astype(np.float32) / 255. for j in range(n_syn)]; ys = list(Tx[b:b + n_syn])
            for _ in range(n_real):
                pool = hard_byN[N] if hard_byN[N] and rng.random() < 0.6 else byN[N]
                im, t = rng.choice(pool); xs.append(aug(im, rng)); ys.append(t)
            x = np.stack(xs)
            l = step_kd(x, enc(ys), targets(x)) if kd else step_ctc(x, enc(ys))
            hist.append([float(v) for v in l]); it += 1
            if it % 200 == 0:
                h = np.mean(hist[-200:], 0)
                log(f'    [{tag}] step {it}/{steps}  ctc {h[0]:.3f}  kd {h[1]:.3f}  ({time.time() - t0:.0f}s)')
    return model


# ------------------------------------------------------------------ stages
def stage_teachers(real, hard, cfg):
    import tensorflow as tf
    import train_captcha as tc
    res = {}
    for k, tr, te in folds(real):
        w = os.path.join(OUT, f'teacher_f{k}.weights.h5')
        if not os.path.exists(w):
            log(f'  teacher fold {k}: train {len(tr)}, test {len(te)}')
            m = tc.finetune(tr, 800, hard, cfg, teacher_args(), f'teacher f{k}')
            m.save_weights(w); del m; tf.keras.backend.clear_session()


def get_teacher(k, cfg):
    from model_ctc import build
    m = build(**cfg); m.load_weights(os.path.join(OUT, f'teacher_f{k}.weights.h5')); return m


def eval_variant(name, make_model, real, pool, force=False):
    """make_model(k) → Keras model for fold k. Caches per-shift log-probs and scores."""
    import tensorflow as tf
    path = os.path.join(OUT, f'eval_{name}.pkl')
    if os.path.exists(path) and not force:
        return pickle.load(open(path, 'rb'))
    lps, truths, idx = [], [], []
    for k, tr, te in folds(real):
        m = make_model(k)
        lps += read_all(m, te); truths += [t for _, t in te]
        idx += [i for i in range(len(real)) if i % FOLDS == k]
        del m; tf.keras.backend.clear_session()
    order = sorted(range(len(idx)), key=lambda j: idx[j])      # back to image order
    st = score([lps[j] for j in order], [truths[j] for j in order], pool)
    extra = {}
    pickle.dump(dict(st=st, extra=extra), open(path, 'wb'))
    return dict(st=st, extra=extra)


def stage_quant(real, cfg, pool):
    from spec_io import model_to_spec, spec_to_model, spec_bytes, weight_tensors, quantize, sqnr_db
    out = {}
    out['fp32'] = eval_variant('teacher_fp32', lambda k: get_teacher(k, cfg), real, pool)
    sizes = {}
    for sch in ('fp16', 'int8_tensor', 'int8_channel', 'int4_g64', 'int4_g32'):
        def mk(k, sch=sch):
            sp = model_to_spec(get_teacher(k, cfg), cfg, 0.85, sch); sizes[sch] = spec_bytes(sp)
            return spec_to_model(sp)
        out[sch] = eval_variant(f'teacher_{sch}', mk, real, pool)
        if sch not in sizes:
            sizes[sch] = spec_bytes(model_to_spec(get_teacher(0, cfg), cfg, 0.85, sch))
    # per-layer quantisation error (fold-0 teacher): per-tensor vs per-channel
    rows = []
    for name, w, b in weight_tensors(get_teacher(0, cfg), cfg):
        if name.startswith('ln') or '.ln' in name: continue
        r = dict(name=name, n=int(w.size))
        for sch in ('int8_tensor', 'int8_channel', 'int4_g32'):
            r[sch] = sqnr_db(w, quantize(w, sch)[1])
        import numpy as np
        m = w.reshape(-1, w.shape[-1]); amax = np.abs(m).max(0)
        r['ch_range_ratio'] = float(amax.max() / max(np.median(amax), 1e-12))
        rows.append(r)
    json.dump(dict(sizes=sizes, sqnr=rows), open(os.path.join(OUT, 'quant_meta.json'), 'w'), indent=1)
    return out


SENS_GROUPS = ['stem0', 'stem1', 'stem2', 'stem3', 'dense0'] + \
              [f'b{i}.{g}' for i in range(4) for g in ('attn', 'ff')] + ['head']


def stage_sens(real, cfg, pool):
    from spec_io import model_to_spec, spec_to_model
    import tensorflow as tf
    res = {}
    for g in SENS_GROUPS:
        def pick(name, g=g):
            if g.endswith('.attn'): hit = name.startswith(g[:-5]) and name.split('.')[1] in 'qkvo'
            elif g.endswith('.ff'): hit = name.startswith(g[:-3]) and name.split('.')[1] in ('up', 'down')
            else: hit = name == g
            return 'int4_tensor' if hit else 'fp16'
        res[g] = eval_variant(f'sens_{g}', lambda k, pick=pick: spec_to_model(model_to_spec(get_teacher(k, cfg), cfg, 0.85, pick)),
                              real, pool)
    return res


def stage_students(real, hard, cfg, pool, which):
    import tensorflow as tf
    from model_ctc import build
    res = {}
    for name in which:
        S = STUDENTS[name]
        pre = os.path.join(OUT, f'{name}_pre.weights.h5')
        if not os.path.exists(pre):
            log(f'  {name}: synthetic pretraining {S["pre_steps"]} steps ({"distilled" if S["kd"] else "CTC only"})')
            synth_teacher = build(**cfg); synth_teacher.load_weights('ctc_synth.weights.h5')
            m = train_student(S['cfg'], None, S['pre_steps'], None, synth_teacher, S['kd'], hard, 5e-4,
                              f'{name} pre', synth_only=True, copy_stem_from=synth_teacher if S['copy_stem'] else None)
            m.save_weights(pre); del m, synth_teacher; tf.keras.backend.clear_session()
        for k, tr, te in folds(real):
            w = os.path.join(OUT, f'{name}_f{k}.weights.h5')
            if os.path.exists(w): continue
            log(f'  {name} fold {k}: fine-tune {FT_STEPS_STUDENT} steps')
            t = get_teacher(k, cfg)
            m = train_student(S['cfg'], pre, FT_STEPS_STUDENT, tr, t, S['kd'], hard, 3e-4, f'{name} f{k}')
            m.save_weights(w); del m, t; tf.keras.backend.clear_session()

        def mk(k, name=name):
            m = build(**S['cfg']); m.load_weights(os.path.join(OUT, f'{name}_f{k}.weights.h5')); return m
        res[name] = eval_variant(f'student_{name}', mk, real, pool)
        # what ships: int8 per-channel weights
        from spec_io import model_to_spec, spec_to_model
        res[name + '_int8'] = eval_variant(f'student_{name}_int8',
                                           lambda k, mk=mk: spec_to_model(model_to_spec(mk(k), S['cfg'], 0.85, 'int8_channel')),
                                           real, pool)
    return res


def macs(cfg, W=271):
    """multiply-adds of one read of an 8-character captcha."""
    from model_ctc import STEM, KERNELS, STRIDES
    st = cfg.get('stem', STEM); h, w, c, tot = 105, W, 3, 0
    for f, k, s in zip(st, KERNELS, STRIDES):
        sy, sx = (s, s) if isinstance(s, int) else s
        h, w = -(-h // sy), -(-w // sx); tot += h * w * f * k * k * c; c = f
    T, d, ff, L = w, cfg['d'], cfg['ff'], cfg['layers']
    tot += T * h * c * d + L * T * (4 * d * d + 2 * d * ff) + L * 2 * T * T * d + T * d * 28
    return tot


def nparams(cfg):
    from model_ctc import build
    return build(**cfg).count_params()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('stage', nargs='+', choices=['teachers', 'quant', 'sens', 'students', 'final', 'report', 'all'])
    ap.add_argument('--students', default=','.join(STUDENTS))
    ap.add_argument('--producers', type=int, default=3)
    args = ap.parse_args()
    stages = ['teachers', 'quant', 'sens', 'students', 'report'] if 'all' in args.stage else args.stage
    os.makedirs(OUT, exist_ok=True); os.chdir(HERE); sys.path.insert(0, HERE)
    log(f'\n=== compress_study {" ".join(stages)}  {time.strftime("%Y-%m-%d %H:%M")}')
    need_train = any(s in stages for s in ('teachers', 'students', 'final'))
    procs = setup_producers(args.producers) if need_train else []
    pool = mp.Pool(min(12, os.cpu_count() or 4))                 # forked before TensorFlow loads
    import numpy as np, tensorflow as tf
    for g in tf.config.list_physical_devices('GPU'):
        try: tf.config.experimental.set_memory_growth(g, True)
        except Exception: pass
    import train_captcha as tc
    from train2 import load_real
    real = load_real(os.environ.get('CAPTCHA_DIR') or os.path.join(HERE, '..', 'captcja'))
    cfg = json.load(open('ctc_cfg.json'))
    old = []
    import glob
    for f in sorted(glob.glob('cvstats_ctc_fold*.json')): old += json.load(open(f))
    hard, _ = tc.hard_chars_from(old)
    log(f'{len(real)} images, hard chars {hard}')
    if 'teachers' in stages: stage_teachers(real, hard, cfg)
    if 'quant' in stages: stage_quant(real, cfg, pool)
    if 'sens' in stages: stage_sens(real, cfg, pool)
    if 'students' in stages: stage_students(real, hard, cfg, pool, args.students.split(','))
    if 'final' in stages: stage_final(real, hard, cfg, pool, args)
    if 'report' in stages: stage_report(real, cfg)
    for p in procs: p.terminate()
    pool.close()
    log('done')


def stage_final(real, hard, cfg, pool, args):
    """chosen student on ALL images, distilled from the shipped teacher (ctc_final), → spec_final.json"""
    import tensorflow as tf
    from model_ctc import build
    from spec_io import model_to_spec, spec_bytes
    name = args.students.split(',')[0]; S = STUDENTS[name]
    w = os.path.join(OUT, f'{name}_final.weights.h5')
    if not os.path.exists(w):
        t = build(**cfg); t.load_weights('ctc_final.weights.h5')
        m = train_student(S['cfg'], os.path.join(OUT, f'{name}_pre.weights.h5'), FT_STEPS_STUDENT, real, t,
                          S['kd'], hard, 3e-4, f'{name} final')
        m.save_weights(w); del t
    else:
        m = build(**S['cfg']); m.load_weights(w)
    cal = json.load(open(os.path.join(OUT, f'adaptive_{name}.json')))
    sp = model_to_spec(m, S['cfg'], cal['thresh'], 'int8_channel')
    sp['tta'] = dict(shifts=[list(s) for s in SHIFTS], col=COL, score='prod_agree', stop=cal['stop'])
    json.dump(sp, open(os.path.join(OUT, 'spec_final.json'), 'w'))
    log(f'  spec_final.json: {name}, {spec_bytes(sp) / 1e6:.2f} MB, thresh {cal["thresh"]}, stop {cal["stop"]}')


def stage_report(real, cfg):
    import numpy as np
    R = []; L = lambda s: R.append(s)
    load = lambda n: pickle.load(open(os.path.join(OUT, f'eval_{n}.pkl'), 'rb'))['st'] if os.path.exists(os.path.join(OUT, f'eval_{n}.pkl')) else None
    base = load('teacher_fp16')
    bs = summary(base, 'teacher fp16')
    L(f'# Captcha model compression study\n\n{len(real)} images, {FOLDS}-fold cross-validation; every captcha is '
      f'read by a model that never trained on it. "1 read" = one pass, "5 reads" = TTA average.\n'
      f'"trusted @98%" = share of captchas whose confidence clears the threshold at which trusted answers are ≥98 % right.\n'
      f'Δ vs today = paired McNemar test against the shipped format (teacher, fp16): captchas only this one '
      f'gets right / only today\'s gets right, p-value.\n')
    meta = json.load(open(os.path.join(OUT, 'quant_meta.json'))) if os.path.exists(os.path.join(OUT, 'quant_meta.json')) else {}

    def row(name, st, size=None, mac=None, par=None):
        s = summary(st, name); a, b, p = mcnemar(s['right5'], bs['right5'])
        return (f'| {name} | {par or ""} | {size or ""} | {mac or ""} | {s["acc1"]:.1%} | {s["acc5"]:.1%} | {s["cov5"]:.0%} | '
                f'+{a} / −{b} (p={p:.2f}) |')
    L('## 1. Quantisation (same teacher, different weight formats)\n')
    L('| variant | params | spec size | MACs/read | 1 read | 5 reads | trusted @98% | Δ vs today (5 reads) |\n|---|---|---|---|---|---|---|---|')
    tp = nparams(cfg); tm = macs(cfg)
    for n in ('fp32', 'fp16', 'int8_tensor', 'int8_channel', 'int4_g64', 'int4_g32'):
        st = load(f'teacher_{n}')
        if st: L(row(n, st, f'{meta.get("sizes", {}).get(n, 0) / 1e6:.2f} MB' if n != 'fp32' else '(8.5 MB)', f'{tm / 1e6:.0f} M', f'{tp / 1e6:.2f} M'))
    if meta.get('sqnr'):
        L('\n### Quantisation error per layer (fold-0 teacher), SQNR in dB — higher is better, +6 dB ≈ 1 more bit\n')
        L('| layer | weights | int8 per-tensor | int8 per-channel | int4 g32 | largest/median channel range |\n|---|---|---|---|---|---|')
        for r in meta['sqnr']:
            L(f'| {r["name"]} | {r["n"]:,} | {r["int8_tensor"]:.1f} | {r["int8_channel"]:.1f} | {r["int4_g32"]:.1f} | {r["ch_range_ratio"]:.1f}× |')
    L('\n## 2. Sensitivity: one layer group in crude int4 (one scale per tensor), all else fp16\n')
    L('| layer group | 1 read | 5 reads | change vs fp16 (1 read) |\n|---|---|---|---|')
    for g in SENS_GROUPS:
        st = load(f'sens_{g}')
        if st:
            s = summary(st, g); L(f'| {g} | {s["acc1"]:.1%} | {s["acc5"]:.1%} | {s["acc1"] - bs["acc1"]:+.1%} |')
    L('\n## 3. Smaller models (students)\n')
    L('| model | params | spec size (int8) | MACs/read | 1 read | 5 reads | trusted @98% | Δ vs today (5 reads) |\n|---|---|---|---|---|---|---|---|')
    L(row('teacher (today)', base, f'{meta.get("sizes", {}).get("fp16", 0) / 1e6:.2f} MB fp16', f'{tm / 1e6:.0f} M', f'{tp / 1e6:.2f} M'))
    from spec_io import model_to_spec, spec_bytes
    from model_ctc import build
    for name, S in STUDENTS.items():
        for suf in ('', '_int8'):
            st = load(f'student_{name}{suf}')
            if not st: continue
            size = ''
            if suf:
                size = f'{spec_bytes(model_to_spec(build(**S["cfg"]), S["cfg"], 0.85, "int8_channel")) / 1e6:.2f} MB'
            L(row(name + (' int8' if suf else ' fp32'), st, size, f'{macs(S["cfg"]) / 1e6:.0f} M', f'{nparams(S["cfg"]) / 1e6:.2f} M'))
    # adaptive TTA for the teacher and each student (int8 = what would ship)
    L('\n## 4. Adaptive TTA (read once; only if that read\'s confidence < stop, do all 5)\n')
    for name, st in [('teacher fp16', base)] + [(n, load(f'student_{n}_int8')) for n in STUDENTS]:
        if not st: continue
        full = [s['tta_pred'] == s['truth'] for s in st]
        L(f'\n**{name}** — always 5 reads: {np.mean(full):.1%} right\n')
        L('| stop | avg reads | right | trusted @98% | threshold |\n|---|---|---|---|---|')
        best = None
        for stop in (0.5, 0.7, 0.8, 0.9, 0.95, 0.97, 0.98, 0.99, 0.995, 1.01):
            a = adaptive(st, stop); right = [r['pred'] == r['truth'] for r in a]
            c = calib([(r['conf'], ok) for r, ok in zip(a, right)])
            reads = np.mean([r['reads'] for r in a])
            L(f'| {stop if stop <= 1 else "never"} | {reads:.2f} | {np.mean(right):.1%} | {c["coverage"] if c else 0:.0%} | {c["thresh"] if c else "-"} |')
            # cheapest stop that loses nothing against always-5 (accuracy and trusted share)
            c_full = calib([(s['tta_conf'], ok) for s, ok in zip(st, full)])
            if best is None and c and sum(right) >= sum(full) and c['coverage'] >= (c_full['coverage'] if c_full else 0) - 0.005:
                best = dict(stop=stop, thresh=round(c['thresh'], 4), reads=float(reads), acc=float(np.mean(right)),
                            coverage=c['coverage'])
        if best:
            L(f'\n→ chosen stop {best["stop"]}: {best["reads"]:.2f} reads on average, {best["acc"]:.1%} right, '
              f'trust threshold {best["thresh"]} ({best["coverage"]:.0%} trusted)')
            json.dump(best, open(os.path.join(OUT, f'adaptive_{name.split()[0] if name.startswith("teacher") else name}.json'), 'w'))
    conf = Counter()
    for s in base:
        for a, b in zip(s['truth'], s['tta_pred']):
            if a != b: conf[(a, b)] += 1
    L('\nTeacher\'s remaining confusions (5 reads): ' + ', '.join(f'{a}→{b}×{n}' for (a, b), n in conf.most_common(10)))
    open(os.path.join(OUT, 'report.md'), 'w').write('\n'.join(R) + '\n')
    print('\n'.join(R))


if __name__ == '__main__':
    import train_captcha as _tc
    _tc.ensure_cuda_libs()
    mp.set_start_method('fork', force=True)
    main()
