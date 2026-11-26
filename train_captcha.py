#!/usr/bin/env python3
"""
train_captcha.py — retrain the Heist captcha reader (CTC transformer) and ship it to the React app.

Does, in order:
  0. data check   — fixes known mislabelled files, lists anything load_real() would skip
  2. hard chars   — measures which characters the CURRENT model confuses (old cvstats_ctc_fold*.json)
                    and oversamples captchas containing them while fine-tuning
  1. multi-read   — scores every held-out captcha twice: one read, and averaged over small shifts (TTA)
     cross-val    — honest accuracy on images each fold never trained on (5 folds)
  4. data curve   — the same cross-validation with 50% / 75% of the images → does more data still help?
  3. calibrate    — picks the confidence score + threshold from the held-out results, and the adaptive-TTA
                    stop (read once; only when that read is unsure, do all the shifted reads)
     final        — trains on all images, exports spec_ctc.json (int8 weights by default, --weights),
                    puts it into src/heist/captcha/captchaSpec.js

Run with the venv that has TensorFlow (GPU strongly recommended):
    .venv/bin/python train_captcha.py
Quick smoke test (tiny step counts, ~minutes, does NOT touch the app):
    ... train_captcha.py --smoke

Nothing in the app changes until the very last step, and the old model / captchaSpec.js are backed up.
Smaller student models + distillation: files(1)/compress_study.py (study/report.md has the measurements).
Everything is logged to <files1>/runs/<time>/report.md.
"""
import os, sys, json, time, glob, math, random, shutil, argparse, datetime, multiprocessing as mp
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FILES1_CANDIDATES = [
    os.path.join(SCRIPT_DIR, 'files(1)'),
    os.path.expanduser('~/Downloads/heist_bombs/heist/files(1)'),
]
# mislabelled files found by hand (image checked): wrong name -> right name
LABEL_FIXES = {'GDfni.png': 'GD4fmi.png', 'sterN.png': 'terN.png'}
# what the old model confused most, used when no old cvstats are found
DEFAULT_HARD = 'nmaA4rfTt7bhif39dDHRe'
# TTA shifts in half-res pixels (dx, dy). The model reads the captcha in columns 4 px wide (conv stride 4
# along x), so sideways shifts must be whole columns (±4) and are lined back up before averaging —
# a 2 px shift puts every read half a column apart and averaging smears the answer.
COL = 4
SHIFTS = [(0, 0), (0, -2), (0, 2), (-COL, 0), (COL, 0)]
TARGET_PRECISION = 0.98                             # answers trusted automatically must be ≥98% right


def log(*a):
    msg = ' '.join(str(x) for x in a)
    print(msg, flush=True)
    if REPORT:
        with open(REPORT, 'a', encoding='utf-8') as f: f.write(msg + '\n')


REPORT = None


# ---------------------------------------------------------------- synthetic captcha producers
def producer_worker(files1, wid, nworkers, pending_max):
    """Fake captchas into chunks/ (same as producer.py, but several workers with distinct file numbers)."""
    os.chdir(files1); sys.path.insert(0, files1)
    import random as R
    from producer import generate_chunk
    rng = R.Random(1000 + wid * 7919 + int(time.time()))
    k = wid + nworkers * int(time.time() % 100000)   # unique-ish numbers per run & worker
    while True:
        pend = [f for f in os.listdir('chunks') if f.endswith('.npz') and not f.endswith('_tmp.npz')]
        if len(pend) >= pending_max:
            time.sleep(1); continue
        generate_chunk(k, rng, 'chunks', 500)
        k += nworkers


# ---------------------------------------------------------------- helpers (need numpy / tf)
def shift_img(im, dx, dy):
    """Shift an HxWxC image by (dx, dy) pixels repeating the edges (identical to heistCore.js shiftImg)."""
    import numpy as np
    H, W = im.shape[:2]
    ys = np.clip(np.arange(H) - dy, 0, H - 1); xs = np.clip(np.arange(W) - dx, 0, W - 1)
    return im[ys][:, xs]


def read_one(model, im, N, tta):
    """→ dict(pred, prod, minp, tta_pred, tta_prod, agree) for one half-res uint8 image."""
    import numpy as np
    from model_ctc import fixed_len, log_softmax
    shifts = SHIFTS if tta else [(0, 0)]
    batch = np.stack([shift_img(im, dx, dy) for dx, dy in shifts]).astype(np.float32) / 255.
    lps = [log_softmax(x) for x in model(batch, training=False).numpy()]
    s1, c1 = fixed_len(lps[0], N)
    out = dict(pred=s1, prod=float(np.prod(c1)) if c1 else 0., minp=min(c1) if c1 else 0.)
    if tta:
        T = lps[0].shape[0]
        aligned = [x[np.clip(np.arange(T) + dx // COL, 0, T - 1)] for x, (dx, dy) in zip(lps, shifts)]
        lp = np.log(np.maximum(np.mean([np.exp(x) for x in aligned], 0), 1e-30))
        s, c = fixed_len(lp, N)
        singles = [fixed_len(x, N)[0] for x in lps]
        out.update(tta_pred=s, tta_prod=float(np.prod(c)) if c else 0., agree=sum(t == s for t in singles) / len(singles))
    return out


def evaluate(model, data, tta=True):
    stats = []
    for im, t in data:
        r = read_one(model, im, len(t), tta); r.update(truth=t, n=len(t)); stats.append(r)
    return stats


def summarize(stats, key='pred'):
    n = len(stats); ok = sum(s[key] == s['truth'] for s in stats)
    by = {L: [sum(s[key] == s['truth'] for s in stats if s['n'] == L), sum(1 for s in stats if s['n'] == L)] for L in (4, 6, 8)}
    chars = sum(s['n'] for s in stats); cc = sum(sum(a == b for a, b in zip(s[key], s['truth'])) for s in stats)
    return dict(exact=ok, of=n, acc=ok / max(n, 1), perchar=cc / max(chars, 1), by_len=by)


def finetune(train_set, steps, hard, cfg, args, tag):
    """train_ctc.finetune, but oversampling captchas that contain the measured hard characters."""
    import numpy as np
    from model_ctc import build
    from train_ctc import make_opt, make_step, next_chunk, enc
    from finetune import aug
    model = build(**cfg); model.load_weights('ctc_synth.weights.h5')
    opt = make_opt(model, args.ft_lr, 40, steps); step = make_step(model, opt, model.trainable_variables)
    rng = random.Random(7)
    byN = {n: [s for s in train_set if len(s[1]) == n] for n in (4, 6, 8)}
    # weight = how many hard characters the answer contains (0 = never picked from the hard pool)
    hard_byN = {n: [s for s in byN[n] if any(c in hard for c in s[1])] for n in (4, 6, 8)}
    it = 0; t0 = time.time()
    while it < steps:
        X, T, N = next_chunk()
        if not byN[N]: continue
        for b in range(0, len(X) - args.synth_per_batch + 1, args.synth_per_batch):
            if it >= steps: break
            xs = [X[b + j].astype(np.float32) / 255. for j in range(args.synth_per_batch)]
            ys = list(T[b:b + args.synth_per_batch])
            for _ in range(args.real_per_batch):
                pool = hard_byN[N] if hard_byN[N] and rng.random() < args.hard_frac else byN[N]
                im, t = rng.choice(pool); xs.append(aug(im, rng)); ys.append(t)
            loss = float(step(np.stack(xs), enc(ys))); it += 1
            if it % 100 == 0: log(f'    [{tag}] step {it}/{steps} loss {loss:.3f} ({time.time() - t0:.0f}s)')
    return model


def cross_val(real, folds, steps, hard, cfg, args, tag, frac=1.0):
    stats = []
    for k in range(folds):
        te = [r for i, r in enumerate(real) if i % folds == k]
        tr = [r for i, r in enumerate(real) if i % folds != k]
        if frac < 1:
            tr = random.Random(100 + k).sample(tr, int(len(tr) * frac))
        log(f'  {tag} fold {k + 1}/{folds}: train {len(tr)}, test {len(te)}')
        model = finetune(tr, steps, hard, cfg, args, f'{tag} f{k}')
        st = evaluate(model, te, tta=True)
        s1, s2 = summarize(st, 'pred'), summarize(st, 'tta_pred')
        log(f'    one read {s1["exact"]}/{s1["of"]}  ·  {len(SHIFTS)} reads averaged {s2["exact"]}/{s2["of"]}')
        stats += st
        del model
        import tensorflow as tf; tf.keras.backend.clear_session()
    return stats


def hard_chars_from(old_stats):
    err, tot, pairs = Counter(), Counter(), Counter()
    for s in old_stats:
        for a, b in zip(s['truth'], s['pred']):
            tot[a] += 1
            if a != b: err[a] += 1; pairs[(a, b)] += 1
    if not tot: return DEFAULT_HARD, 'default list (no old results found)'
    mean = sum(err.values()) / sum(tot.values())
    hard = {c for c in tot if err[c] / tot[c] >= 1.5 * mean}
    for (a, b), n in pairs.items():
        if n >= 2: hard |= {a, b}
    why = ', '.join(f'{a}→{b}×{n}' for (a, b), n in pairs.most_common(12))
    return ''.join(sorted(hard)), f'old model error rate {mean:.1%}/char; top confusions {why}'


def calibrate(stats, target):
    """For each score type: highest coverage whose trusted answers are ≥ target precision."""
    import numpy as np
    kinds = {
        'one read (prod)': ('pred', lambda s: s['prod']),
        'averaged (prod)': ('tta_pred', lambda s: s['tta_prod']),
        'averaged (prod × agreement)': ('tta_pred', lambda s: s['tta_prod'] * s['agree']),
    }
    res = {}
    for name, (key, score) in kinds.items():
        rows = sorted(((score(s), s[key] == s['truth']) for s in stats), key=lambda r: -r[0])
        best = None; ok = 0
        for i, (sc, right) in enumerate(rows):
            ok += right; prec = ok / (i + 1)
            # threshold = this score; everything ≥ it is trusted (ties: next row has a lower score)
            if prec >= target and (i + 1 == len(rows) or rows[i + 1][0] < sc):
                best = dict(thresh=sc, coverage=(i + 1) / len(rows), precision=prec)
        table = []
        for th in (0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98, 0.99):
            sel = [r for r in rows if r[0] >= th]
            table.append((th, len(sel) / len(rows), (sum(r[1] for r in sel) / len(sel)) if sel else 1.0))
        res[name] = dict(best=best, table=table, acc=sum(r[1] for r in rows) / len(rows))
    return res


def choose_stop(stats, score, target):
    """Adaptive TTA: the lowest stop (fewest reads) at which "read once, and only if that read's confidence
    is below stop do all the shifted reads" loses nothing against always doing them: as many captchas
    right, and at least as many trusted at the target precision. → (stop, trust threshold) or (None, None)."""
    conf5 = (lambda s: s['tta_prod'] * s['agree']) if score == 'prod_agree' else (lambda s: s['tta_prod'])
    right5 = [s['tta_pred'] == s['truth'] for s in stats]
    full = calibrate_rows([(conf5(s), r) for s, r in zip(stats, right5)], target)
    for stop in (0.5, 0.7, 0.8, 0.9, 0.95, 0.97, 0.98, 0.99, 0.995):
        early = [s['prod'] >= stop for s in stats]
        right = [(s['pred'] if e else s['tta_pred']) == s['truth'] for s, e in zip(stats, early)]
        cal = calibrate_rows([(s['prod'] if e else conf5(s), r) for s, e, r in zip(stats, early, right)], target)
        if cal and sum(right) >= sum(right5) and cal['coverage'] >= (full['coverage'] if full else 0) - 0.005:
            return stop, round(cal['thresh'], 4), sum(early) / len(stats)
    return None, None, 0


def calibrate_rows(rows, target):
    rows = sorted(rows, key=lambda r: -r[0]); ok = 0; best = None
    for i, (sc, right) in enumerate(rows):
        ok += right
        if ok / (i + 1) >= target and (i + 1 == len(rows) or rows[i + 1][0] < sc):
            best = dict(thresh=sc, coverage=(i + 1) / len(rows), precision=ok / (i + 1))
    return best


def patch_app(spec, project):
    """Write spec_ctc.json and src/heist/captcha/captchaSpec.js (the model the app runs)."""
    js = os.path.join(project, 'src', 'heist', 'captcha', 'captchaSpec.js')
    lines = open(js, encoding='utf-8').read().split('\n')
    idx = [i for i, l in enumerate(lines) if l.startswith('export const SPEC = ')]
    if len(idx) != 1: raise RuntimeError(f'expected one "export const SPEC = " line in {js}, found {len(idx)}')
    stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    shutil.copyfile(js, js + f'.bak_{stamp}')
    lines[idx[0]] = 'export const SPEC = ' + json.dumps(spec) + ';'
    open(js, 'w', encoding='utf-8').write('\n'.join(lines))
    sp = os.path.join(project, 'spec_ctc.json')
    if os.path.exists(sp): shutil.copyfile(sp, sp + f'.bak_{stamp}')
    json.dump(spec, open(sp, 'w'))
    return js, sp, stamp


def main():
    global REPORT
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--files1', default=None, help='folder with model_ctc.py / train_ctc.py / ctc_synth.weights.h5')
    ap.add_argument('--captcha-dir', default=os.path.join(SCRIPT_DIR, 'captcja'))
    ap.add_argument('--project', default=SCRIPT_DIR, help='React app to update (src/heist/heistCore.js)')
    ap.add_argument('--steps', type=int, default=800, help='fine-tune steps per model')
    ap.add_argument('--folds', type=int, default=5)
    ap.add_argument('--curve', default='0.5,0.75', help='data fractions for the learning curve ("" = skip)')
    ap.add_argument('--pretrain-minutes', type=float, default=0, help='>0: redo synthetic pretraining first')
    ap.add_argument('--pretrain-steps', type=int, default=12000)
    ap.add_argument('--ft-lr', type=float, default=3e-4)
    ap.add_argument('--synth-per-batch', type=int, default=20)
    ap.add_argument('--real-per-batch', type=int, default=12)
    ap.add_argument('--hard-frac', type=float, default=0.6, help='share of real samples drawn from hard-char captchas')
    ap.add_argument('--target-precision', type=float, default=TARGET_PRECISION)
    ap.add_argument('--producers', type=int, default=max(1, min(6, (os.cpu_count() or 2) // 2)))
    ap.add_argument('--weights', default='int8_channel', help='weight format in the app: fp16 | int8_channel | int8_tensor | int4_g32')
    ap.add_argument('--no-patch', action='store_true', help='train + report, but do not touch the app')
    ap.add_argument('--allow-cpu', action='store_true', help='run even if TensorFlow sees no GPU')
    ap.add_argument('--smoke', action='store_true', help='tiny run to check everything works (no app patch)')
    args = ap.parse_args()
    if args.smoke:
        args.steps, args.folds, args.curve, args.no_patch, args.allow_cpu = 30, 2, '0.5', True, True

    files1 = args.files1 or next((p for p in FILES1_CANDIDATES if os.path.isfile(os.path.join(p, 'model_ctc.py'))), None)
    if not files1: sys.exit('Could not find files(1) with model_ctc.py — pass --files1')
    files1 = os.path.abspath(files1); cap = os.path.abspath(args.captcha_dir)
    run_dir = os.path.join(files1, 'runs', datetime.datetime.now().strftime('%Y%m%d_%H%M%S') + ('_smoke' if args.smoke else ''))
    os.makedirs(run_dir, exist_ok=True); REPORT = os.path.join(run_dir, 'report.md')
    log(f'# Captcha training run {os.path.basename(run_dir)}\n\nfiles(1): {files1}\nimages: {cap}\n')

    # ---- 0. data check (before anything heavy)
    log('## 0. Data check')
    for wrong, right in LABEL_FIXES.items():
        a, b = os.path.join(cap, wrong), os.path.join(cap, right)
        if os.path.exists(a) and not os.path.exists(b):
            os.rename(a, b); log(f'- renamed {wrong} → {right} (label fixed)')

    # ---- synthetic producers must start before TensorFlow is imported (fork safety)
    os.chdir(files1); sys.path.insert(0, files1); os.makedirs('chunks', exist_ok=True)
    procs = [mp.Process(target=producer_worker, args=(files1, w, args.producers, 4 * args.producers), daemon=True)
             for w in range(args.producers)]
    for p in procs: p.start()
    log(f'- started {len(procs)} synthetic-captcha producers')

    os.environ['CAPTCHA_DIR'] = cap
    import numpy as np, tensorflow as tf
    gpus = tf.config.list_physical_devices('GPU')
    log(f'- TensorFlow {tf.__version__}, GPU: {[g.name for g in gpus] or "NONE"}')
    if not gpus and not args.allow_cpu:
        sys.exit('No GPU visible to TensorFlow. Install the CUDA build in this venv:\n'
                 '    pip install "tensorflow[and-cuda]"\n'
                 'or pass --allow-cpu (≈10-30x slower).')
    for g in gpus:
        try: tf.config.experimental.set_memory_growth(g, True)
        except Exception: pass

    from train2 import load_real
    real = load_real(cap)
    lens = Counter(len(t) for _, t in real)
    log(f'- {len(real)} usable images (4: {lens[4]}, 6: {lens[6]}, 8: {lens[8]}); skipped files are listed above by load_real')
    cfg = json.load(open('ctc_cfg.json')) if os.path.exists('ctc_cfg.json') else None
    if cfg is None:
        from model_ctc import CFG; cfg = dict(CFG)

    # ---- optional: redo synthetic pretraining
    if args.pretrain_minutes > 0:
        log(f'\n## Pretraining on synthetic captchas ({args.pretrain_minutes} min)')
        import subprocess
        subprocess.check_call([sys.executable, 'train_ctc.py', 'pretrain', '--minutes', str(args.pretrain_minutes),
                               '--steps', str(args.pretrain_steps), '--stem', 'bb_synth.weights.h5'])
    if not os.path.exists('ctc_synth.weights.h5'):
        sys.exit('ctc_synth.weights.h5 missing — run with --pretrain-minutes 90')

    # ---- 2. hard characters from the current model's held-out mistakes
    log('\n## 2. Hard characters')
    old = []
    for f in sorted(glob.glob('cvstats_ctc_fold*.json')): old += json.load(open(f))
    hard, why = hard_chars_from(old)
    if old:
        o = summarize(old); log(f'- current model (old cross-val): {o["exact"]}/{o["of"]} = {o["acc"]:.1%} whole captchas, {o["perchar"]:.1%} per char')
    log(f'- oversampling captchas with: {" ".join(hard)}  ({why})')

    # ---- 1 + main cross-validation
    log(f'\n## 1. Cross-validation, {args.folds} folds × {args.steps} steps (one read vs {len(SHIFTS)} averaged reads)')
    stats = cross_val(real, args.folds, args.steps, hard, cfg, args, 'cv')
    json.dump(stats, open(os.path.join(run_dir, 'cvstats.json'), 'w'))
    s1, s2 = summarize(stats, 'pred'), summarize(stats, 'tta_pred')
    log(f'- one read:      {s1["exact"]}/{s1["of"]} = {s1["acc"]:.1%}  (per char {s1["perchar"]:.1%})  by length {s1["by_len"]}')
    log(f'- averaged read: {s2["exact"]}/{s2["of"]} = {s2["acc"]:.1%}  (per char {s2["perchar"]:.1%})  by length {s2["by_len"]}')
    use_tta = s2['exact'] >= s1['exact']
    conf = Counter((a, b) for s in stats for a, b in zip(s['truth'], s['tta_pred' if use_tta else 'pred']) if a != b)
    log(f'- remaining confusions: {", ".join(f"{a}→{b}×{n}" for (a, b), n in conf.most_common(10)) or "none"}')

    # ---- 4. learning curve
    curve = [float(x) for x in args.curve.split(',') if x.strip()]
    if curve:
        log('\n## 4. Does more data help? (same cross-validation, fewer images)')
        pts = []
        for fr in curve:
            st = cross_val(real, args.folds, args.steps, hard, cfg, args, f'curve{int(fr * 100)}', fr)
            pts.append((fr, summarize(st, 'tta_pred' if use_tta else 'pred')['acc']))
        pts.append((1.0, (s2 if use_tta else s1)['acc']))
        for fr, acc in pts: log(f'- {fr:4.0%} of the images → {acc:.1%} whole captchas right')
        if len(pts) >= 2:
            (fa, aa), (fb, ab) = pts[-2], pts[-1]
            gain = (ab - aa) / max(fb - fa, 1e-9) * 0.25   # per +25% of the data
            verdict = ('still rising clearly — more labelled captchas (especially misreads) will help'
                       if gain > 0.01 else 'flattening — more data helps less than better training/augmentation')
            log(f'- last step: {gain:+.1%} per extra 25% of images → {verdict}')

    # ---- 3. calibration
    log(f'\n## 3. Calibration (trusted answers must be ≥{args.target_precision:.0%} right)')
    cal = calibrate(stats, args.target_precision)
    for name, c in cal.items():
        b = c['best']
        log(f'- {name}: accuracy {c["acc"]:.1%}; ' + (f'threshold {b["thresh"]:.3f} trusts {b["coverage"]:.0%} at {b["precision"]:.1%} right'
                                                     if b else 'target not reachable'))
        log('    thresh: ' + '  '.join(f'{th}→{cov:.0%} trusted/{pr:.1%} right' for th, cov, pr in c['table']))
    names = ['averaged (prod × agreement)', 'averaged (prod)'] if use_tta else ['one read (prod)']
    reachable = [n for n in names if cal[n]['best']]
    choice = max(reachable, key=lambda n: cal[n]['best']['coverage']) if reachable else names[0]
    if cal[choice]['best']:
        thresh = round(cal[choice]['best']['thresh'], 4)
    else:   # target unreachable: most trusting threshold that still beats the current 0.85 behaviour
        thresh = 0.95
        log(f'- ⚠ no threshold reaches {args.target_precision:.0%}; using {thresh}')
    tta_cfg = dict(shifts=[list(s) for s in SHIFTS], col=COL, score='prod_agree' if 'agreement' in choice else 'prod') if use_tta else None
    log(f'- chosen: {choice}, threshold {thresh}')
    if use_tta:
        stop, th_ad, early = choose_stop(stats, tta_cfg['score'], args.target_precision)
        if stop is not None:
            tta_cfg['stop'] = stop; thresh = th_ad
            log(f'- adaptive TTA: stop {stop} — {early:.0%} of captchas answered after one read, '
                f'{early + (1 - early) * len(SHIFTS):.2f} reads on average instead of {len(SHIFTS)}; threshold {thresh}')
        else:
            log('- adaptive TTA: no stop loses nothing against always reading 5×, keeping all reads')

    # ---- final model
    log(f'\n## Final model ({args.steps} steps on all {len(real)} images)')
    model = finetune(real, args.steps, hard, cfg, args, 'final')
    for f in ('ctc_final.weights.h5',):
        if os.path.exists(f): shutil.copyfile(f, os.path.join(run_dir, 'previous_' + f))
    out_w = os.path.join(run_dir, 'ctc_final.weights.h5'); model.save_weights(out_w)
    from spec_io import model_to_spec, spec_bytes
    spec_path = os.path.join(run_dir, 'spec_ctc.json')
    spec = model_to_spec(model, cfg, thresh, args.weights)
    if tta_cfg: spec['tta'] = tta_cfg
    json.dump(spec, open(spec_path, 'w'))
    log(f'- exported with {args.weights} weights: {spec_bytes(spec) / 1e6:.2f} MB')
    log(f'- weights + spec saved in {run_dir}')

    if args.no_patch:
        log('\n(--no-patch / --smoke: the app was NOT updated)')
    else:
        shutil.copyfile(out_w, 'ctc_final.weights.h5')
        js, sp, stamp = patch_app(spec, os.path.abspath(args.project))
        log(f'\n## App updated\n- {js} (backup .bak_{stamp})\n- {sp}\n- next: npm run build')
    for p in procs: p.terminate()
    log(f'\nDone. Report: {REPORT}')


def ensure_cuda_libs():
    """pip/uv's tensorflow[and-cuda] puts the CUDA libraries in site-packages/nvidia/*/lib, but TensorFlow
    doesn't find all of them (libcusolver.so.11). LD_LIBRARY_PATH only counts at process start, so set it
    and restart this script once."""
    import site
    dirs = []
    for sp in site.getsitepackages():
        dirs += sorted(glob.glob(os.path.join(sp, 'nvidia', '*', 'lib')))
    cur = os.environ.get('LD_LIBRARY_PATH', '')
    if dirs and not all(d in cur.split(':') for d in dirs) and not os.environ.get('_TRAIN_CAPTCHA_REEXEC'):
        env = dict(os.environ, LD_LIBRARY_PATH=':'.join(dirs + ([cur] if cur else [])), _TRAIN_CAPTCHA_REEXEC='1')
        os.execve(sys.executable, [sys.executable] + sys.argv, env)


if __name__ == '__main__':
    ensure_cuda_libs()
    mp.set_start_method('fork', force=True)
    main()
