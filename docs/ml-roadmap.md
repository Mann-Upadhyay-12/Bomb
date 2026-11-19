# Captcha model: speed-up roadmap (to do by hand)

Plan for making the Heist captcha model cheaper without losing accuracy. Written 2026-11-19, to work
through starting 2026-11-20. The engine side (WebAssembly SIMD) is done; everything here changes the
model or its answers, so each step must be measured.

## Where the time goes (one read of an 8-character captcha, half-res input 105 × 271 × 3)

| Layer | Output | Multiply-adds |
|---|---|---|
| conv1 5×5 s2,2 | 53 × 136 × 24 | ≈ 13 M |
| conv2 3×3 s2,2 | 27 × 68 × 48 | ≈ 19 M |
| conv3 3×3 s2,1 | 14 × 68 × 96 | ≈ 40 M |
| conv4 3×3 s2,1 | 7 × 68 × 128 | ≈ 53 M |
| dense0 896 → 192 | T = 68 | ≈ 12 M |
| 4 transformer blocks (q, k, v, o, up, down) | 68 × 192 | ≈ 120 M |
| attention | | ≈ 7 M |
| **one read** | | **≈ 265 M** |
| **× 5 TTA reads** (`SPEC.tta.shifts`) | | **≈ 1.3 G** |

Conv stem ≈ 47 %, transformer ≈ 53 %. Current speed with the wasm engine: ~78 ms per captcha on the
laptop, 0.27–0.37 s with the CPU slowed 4×.

## Step 0 — fix the measurement first (most important)

`train_and_patch.py` trains on the `captcja` images and calls `evaluate(bb, hd, real_data)` on the
same images; there is no held-out split. "515/515" means the model fits images it has seen, not how
it does on new captchas. A compressed model can keep fitting its training images while generalising
worse, so comparisons on training data hide exactly the damage we care about.

- Keep ~20 % of the real images out of training (split by captcha, fixed seed), or collect fresh ones.
- For every variant, on the held-out set, track:
  1. accuracy;
  2. review-flag rate (`THRESH`);
  3. **confident-and-wrong** count — the most dangerous number in auto mode.

## A. Fewer TTA reads (no retraining — cheapest experiment)

TTA reads the image 5 times nudged by a few pixels, shifts each read's time axis back by `col` to line
them up, and averages the probabilities. Each read is ~20 % of the cost.

- **Ablation:** `shifts = [[0,0]]`, then 3 shifts, then all 5. Plot accuracy and confident-and-wrong
  against time.
- **Adaptive TTA:** run `[0,0]` first; if its confidence is very high, stop, otherwise run the other 4.
  Most captchas are easy, so the average approaches ~1.3 reads. Tune the stop threshold on held-out data.
- **Training side:** stronger shift augmentation makes the model less sensitive to shifts, so the extra
  reads matter less.

## B. A smaller model

| Knob | Effect on cost |
|---|---|
| `d_model` | dense-layer cost ∝ d²: 192 → 128 ≈ 0.44× |
| `ff` | 768 = 4d; 2d halves `up` / `down` |
| layers | 4 → 2 halves the transformer |
| conv channels | cost ∝ cin × cout: conv4 96 → 96 instead of 96 → 128 saves 25 % |

**Distillation** keeps small models accurate:
1. The current model is the teacher.
2. Label unlimited synthetic captchas (`gen_full`) with its per-frame probabilities.
3. Train the small student to match those soft targets, alongside the CTC loss.

Keep the same horizontal stride in the stem so teacher and student have the same T.

The wasm engine reads every shape from `SPEC`, so a smaller model just works — **except that every
layer's output size must be a multiple of 4** (the SIMD `linear` kernel assumes it). Add a guard that
falls back to the JS forward pass before changing shapes.

## C. Quantisation (fewer bits)

Weights are stored as float16 (2 bytes, then base64): 5.6 MB of the 9.6 MB HTML. All maths is float32.

1. **Weight-only int8 storage.** Per output channel `scale = max|w| / 127`; store `round(w / scale)` as
   int8; multiply back at load time. ~2.75 MB of weights (~3.7 MB base64 instead of 5.5). Same speed,
   small accuracy cost — measure it. Changes: `export_spec` in Python and the weight decoder
   (`b64f16`) in `heistCore.js`. Good first project.
2. **Post-training quantisation (PTQ) with int8 maths.** Quantise activations too: run representative
   images, record each layer's value range (calibration), do integer multiply-adds. wasm's
   `i32x4.dot_i16x8_s` does 8 multiplies per instruction instead of 4 → up to ~2×, conv stem first.
   LayerNorm, softmax and GELU stay float; the first conv and the output head usually stay float too.
   Needs a new wasm kernel.
3. **Quantisation-aware training (QAT)** if PTQ loses accuracy: fake rounding in the forward pass while
   fine-tuning, so the model learns weights that survive it (`tensorflow_model_optimization`).

## Suggested order

held-out split → TTA ablation → int8 storage → smaller model with distillation → int8 maths.
Each step only needs the previous one's measurements; only the last needs a new wasm kernel.
