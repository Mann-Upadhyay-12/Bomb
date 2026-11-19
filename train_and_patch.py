#!/usr/bin/env python3
"""
train_and_patch.py

Complete end-to-end training and HTML patching pipeline:
1. Trains the captcha CNN model on images from the local `captcja` directory using the fixed `files(1)` modules.
2. Evaluates held-out / overall accuracy and calibrates the confidence threshold.
3. Exports weights to spec.json in the format expected by the browser.
4. Generates `HeistMannHiHiHellowHi.html` from `GayHeistFinal.html` in the current directory.
"""

import os
import sys
import json
import base64
import random
import time
import argparse
import re
import numpy as np

# Ensure files(1) is in Python path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FILES1_DIR = os.path.join(SCRIPT_DIR, "files(1)")
if FILES1_DIR not in sys.path:
    sys.path.insert(0, FILES1_DIR)

import tensorflow as tf
from common import CHARSET, SIZES, load_real, enc
from train2 import backbone, head, logits, evaluate
from finetune import aug
import common
import gen_full
import calibrate

def export_spec(bb, hd, out_json_path):
    """Exports model weights to JSON format (base64 float16)."""
    def b64(a):
        return base64.b64encode(np.asarray(a, np.float16).tobytes()).decode()

    L = bb.layers
    convs = [l for l in L if isinstance(l, tf.keras.layers.Conv2D)]
    bns = [l for l in L if isinstance(l, tf.keras.layers.BatchNormalization)]
    strides = [(2, 2), (2, 2), (2, 1), (2, 1)]
    spec = {"charset": CHARSET, "conv2d": [], "dense": [], "conv1d": [], "head": []}

    for c, bn, st in zip(convs, bns, strides):
        w = c.get_weights()[0]
        g, be, mu, var = bn.get_weights()
        sc = g / np.sqrt(var + bn.epsilon)
        spec["conv2d"].append({
            "k": w.shape[0],
            "cin": w.shape[2],
            "cout": w.shape[3],
            "sy": st[0],
            "sx": st[1],
            "w": b64(w * sc[None, None, None, :]),
            "b": b64(be - mu * sc)
        })

    for d in [l for l in L if isinstance(l, tf.keras.layers.Dense)]:
        w, b = d.get_weights()
        spec["dense"].append({"nin": w.shape[0], "nout": w.shape[1], "w": b64(w), "b": b64(b)})

    for c in [l for l in L if isinstance(l, tf.keras.layers.Conv1D)]:
        w, b = c.get_weights()
        spec["conv1d"].append({"k": w.shape[0], "cin": w.shape[1], "cout": w.shape[2], "w": b64(w), "b": b64(b)})

    for d in [l for l in hd.layers if isinstance(l, tf.keras.layers.Dense)]:
        w, b = d.get_weights()
        spec["head"].append({"nin": w.shape[0], "nout": w.shape[1], "w": b64(w), "b": b64(b)})

    out_dir = os.path.dirname(os.path.abspath(out_json_path))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(spec, f)

    return spec


def swap_spec_into_html(html_in_path, html_out_path, spec_json_str, thresh=0.7):
    """Replaces captcha model spec & threshold in target HTML."""
    with open(html_in_path, "r", encoding="utf-8") as f:
        content = f.read()

    spec_tag_match = re.search(r'<script\s+[^>]*id=["\']captchaSpecData["\'][^>]*>', content)
    if spec_tag_match:
        a = spec_tag_match.end()
        b = content.index('</script>', a)
        content = content[:a] + spec_json_str.strip() + content[b:]
    elif 'const SPEC = ' in content:
        a = content.index('const SPEC = ') + len('const SPEC = ')
        b = content.index(';\nconst SIZES=', a)
        content = content[:a] + spec_json_str.strip() + content[b:]
    else:
        raise ValueError(f"Could not find captchaSpecData script tag or const SPEC in {html_in_path}")

    content, n = re.subn(r'THRESH\s*:\s*[0-9.]+\s*\}', f'THRESH:{thresh:.2f}' + '}', content)
    if n == 0:
        print("Warning: THRESH parameter not found to replace, keeping existing threshold.")

    out_dir = os.path.dirname(os.path.abspath(html_out_path))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(html_out_path, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    parser = argparse.ArgumentParser(description="Train Captcha Model and Patch HTML")
    parser.add_argument("--build-dir", default=os.path.join(SCRIPT_DIR, "build"),
                        help="Directory to store built outputs (spec.json, HTML, weights)")
    parser.add_argument("--captcha-dir", default=os.path.join(SCRIPT_DIR, "captcja"),
                        help="Path to folder containing real captcha PNGs")
    parser.add_argument("--html-in", default=os.path.join(SCRIPT_DIR, "GayHeistFinal.html"),
                        help="Input HTML file")
    parser.add_argument("--html-out", default=None,
                        help="Output HTML file path (defaults to <build-dir>/HeistMannHiHiHellowHi.html)")
    parser.add_argument("--stem", default=os.path.join(FILES1_DIR, "bb_synth.weights.h5"),
                        help="Pre-trained conv stem weights")
    parser.add_argument("--stage1-steps", type=int, default=350,
                        help="Steps to train head while keeping conv stem frozen")
    parser.add_argument("--stage2-steps", type=int, default=300,
                        help="Steps to fine-tune full backbone + head jointly")
    parser.add_argument("--batch-size", type=int, default=24,
                        help="Batch size per training step")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed")
    args = parser.parse_args()
    os.makedirs(args.build_dir, exist_ok=True)
    if not args.html_out:
        args.html_out = os.path.join(args.build_dir, "HeistMannHiHiHellowHi.html")
    os.makedirs(os.path.dirname(os.path.abspath(args.html_out)), exist_ok=True)

    print(f"=== Build directory: {args.build_dir} ===")
    print(f"=== Loading Captcha Dataset from {args.captcha_dir} ===")
    real_data = load_real(args.captcha_dir)
    print(f"Loaded {len(real_data)} valid captcha images.")
    byN = {n: [(im, t) for im, t in real_data if len(t) == n] for n in (4, 6, 8)}
    for n in (4, 6, 8):
        print(f"  Length {n}: {len(byN[n])} samples")

    rng = random.Random(args.seed)
    np.random.seed(args.seed)
    tf.random.set_seed(args.seed)

    print("\n=== Initializing Architecture ===")
    bb = backbone()
    if os.path.exists(args.stem):
        print(f"Loading warm-start conv stem from {args.stem}...")
        bb.load_weights(args.stem)
    else:
        print("Notice: No warm-start stem found; initializing backbone from scratch.")

    hd = head()
    initial_acc = evaluate(bb, hd, real_data)
    print(f"Baseline (uninitialized head) exact matches: {initial_acc[0]}/{initial_acc[1]} (per-char: {initial_acc[2]})")

    # Stage 1: Train Head only
    print(f"\n=== Stage 1: Training Classifier Head ({args.stage1_steps} steps, conv stem frozen) ===")
    opt1 = tf.keras.optimizers.Adam(
        tf.keras.optimizers.schedules.CosineDecay(1e-3, args.stage1_steps, alpha=0.1)
    )

    @tf.function
    def train_step_head(x, y, N: int):
        with tf.GradientTape() as tape:
            lg = logits(bb, hd, x, N, True)
            loss = tf.reduce_mean(tf.keras.losses.sparse_categorical_crossentropy(y, lg, from_logits=True))
        opt1.apply_gradients(zip(tape.gradient(loss, hd.trainable_variables), hd.trainable_variables))
        return loss

    t0 = time.time()
    for it in range(1, args.stage1_steps + 1):
        N = (4, 6, 8)[it % 3]
        samples = [rng.choice(byN[N]) for _ in range(args.batch_size)]
        xs = np.stack([aug(im, rng) for im, t in samples])
        ys = enc([t for im, t in samples])
        loss_val = float(train_step_head(xs, ys, N))
        if it % 50 == 0 or it == args.stage1_steps:
            print(f"  [Stage 1] Step {it}/{args.stage1_steps} - loss: {loss_val:.4f} (elapsed: {time.time()-t0:.1f}s)", flush=True)

    stage1_acc = evaluate(bb, hd, real_data)
    print(f"Stage 1 Result: {stage1_acc[0]}/{stage1_acc[1]} exact string matches ({stage1_acc[2]*100:.1f}% per-character)")

    # Stage 2: Fine-tune backbone + head jointly
    print(f"\n=== Stage 2: Joint Fine-tuning ({args.stage2_steps} steps, lower learning rate) ===")
    opt2 = tf.keras.optimizers.Adam(
        tf.keras.optimizers.schedules.CosineDecay(2.5e-4, args.stage2_steps, alpha=0.05)
    )
    train_vars = bb.trainable_variables + hd.trainable_variables

    @tf.function
    def train_step_full(x, y, N: int):
        with tf.GradientTape() as tape:
            lg = logits(bb, hd, x, N, True)
            loss = tf.reduce_mean(tf.keras.losses.sparse_categorical_crossentropy(y, lg, from_logits=True))
        opt2.apply_gradients(zip(tape.gradient(loss, train_vars), train_vars))
        return loss

    t1 = time.time()
    for it in range(1, args.stage2_steps + 1):
        # Bias sampling towards 8-char (50% 8-char, 25% 6-char, 25% 4-char)
        N = rng.choices([4, 6, 8], weights=[0.25, 0.25, 0.50])[0]
        # Mix 18 augmented real images + 6 synthetic images
        samples = [rng.choice(byN[N]) for _ in range(18)]
        xs = [aug(im, rng) for im, t in samples]
        ys_list = [t for im, t in samples]
        for _ in range(6):
            syn_text = common.rand_text(N, rng)
            syn_img = gen_full.render(syn_text, rng, rng.uniform(0.4, 0.9), half_res=True)
            xs.append(syn_img.astype(np.float32) / 255.)
            ys_list.append(syn_text)

        loss_val = float(train_step_full(np.stack(xs), enc(ys_list), N))
        if it % 50 == 0 or it == args.stage2_steps:
            print(f"  [Stage 2] Step {it}/{args.stage2_steps} - loss: {loss_val:.4f} (elapsed: {time.time()-t1:.1f}s)", flush=True)

    final_acc = evaluate(bb, hd, real_data)
    print(f"\n=== Training Complete ===")
    print(f"Final Exact Accuracy: {final_acc[0]}/{final_acc[1]} ({final_acc[0]/final_acc[1]*100:.2f}%)")
    print(f"Final Per-character Accuracy: {final_acc[2]*100:.2f}%")
    print(f"By length breakdown: 4-char: {final_acc[3][4][0]}/{final_acc[3][4][1]} | 6-char: {final_acc[3][6][0]}/{final_acc[3][6][1]} | 8-char: {final_acc[3][8][0]}/{final_acc[3][8][1]}")

    # Save trained weights
    bb_out_path = os.path.join(FILES1_DIR, "bb_final.weights.h5")
    hd_out_path = os.path.join(FILES1_DIR, "hd_final.weights.h5")
    bb.save_weights(bb_out_path)
    hd.save_weights(hd_out_path)
    print(f"Saved weights to {bb_out_path} and {hd_out_path}")

    # Calibrate threshold using calibrate module
    calib_stats = []
    for im, t in real_data:
        N = len(t)
        pr = tf.nn.softmax(logits(bb, hd, im[None].astype(np.float32) / 255., N, False)).numpy()[0]
        pred_str = ''.join(CHARSET[i] for i in pr.argmax(-1))
        mp = pr.max(-1)
        calib_stats.append({
            "truth": t,
            "pred": pred_str,
            "prod": float(np.prod(mp)),
            "minp": float(mp.min()),
            "n": N
        })

    calib_res = calibrate.compute_calibration(calib_stats, min_precision=0.98)
    calibrate.print_calibration_report(calib_res)
    best_thresh = calib_res["best_cutoff"]

    # Export to spec.json in build directory
    spec_path = os.path.join(args.build_dir, "spec.json")
    spec = export_spec(bb, hd, spec_path)
    spec_str = json.dumps(spec)
    print(f"\nExported JS model specification to {spec_path} ({len(spec_str)/1e6:.2f} MB)")

    # Swap into HTML
    print(f"\n=== Generating {args.html_out} from {args.html_in} ===")
    swap_spec_into_html(args.html_in, args.html_out, spec_str, thresh=best_thresh)
    out_size = os.path.getsize(args.html_out) / (1024 * 1024)
    print(f"Successfully created {args.html_out} ({out_size:.2f} MB) with newly trained model!")

    # Also sync to root directory if html_out / spec_path are not in root
    root_spec = os.path.join(SCRIPT_DIR, "spec.json")
    root_html = os.path.join(SCRIPT_DIR, os.path.basename(args.html_out))
    if os.path.abspath(spec_path) != os.path.abspath(root_spec):
        import shutil
        shutil.copyfile(spec_path, root_spec)
        print(f"Synced spec to root: {root_spec}")
    if os.path.abspath(args.html_out) != os.path.abspath(root_html):
        import shutil
        shutil.copyfile(args.html_out, root_html)
        print(f"Synced HTML to root: {root_html}")


if __name__ == "__main__":
    main()
