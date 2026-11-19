# Changelog

Newest first. Dates are when the work was committed.

## 2026-11-19 — Speed audit, phone fix

### Heist
- **Captcha reader ~12× faster, same answers.** The network now runs in WebAssembly SIMD
  (`src/heist/captcha/captchaKernel.c`, embedded as base64 in `captchaKernelWasm.js`, rebuilt with
  `npm run build:captcha-wasm`). Your model, weights, 5-read averaging and decoding are unchanged; only
  the maths loops moved.
  - Mean time per captcha 925 → 78 ms; first captcha 880 → 63 ms; with the CPU slowed 4× (phone-like)
    2.8–4.3 s → 0.27–0.37 s.
  - Checked on all 515 labelled captchas against the previous version: identical text, puzzle type and
    review flag on every one; largest confidence difference 7.6e-7.
  - Browsers without WebAssembly SIMD (e.g. iPhones before iOS 16.4) use the old JavaScript forward
    pass, bit-identical to before. `CaptchaVision.engine()` says which one is running.
  - Known limit: the SIMD kernel needs every layer's output size to be a multiple of 4. A retrained
    model with other shapes needs a guard that falls back to JavaScript.
- Float16 weights decode through a lookup table instead of `Math.pow` per weight.
- **Caesar letter matcher** and **digit matcher** do the same comparisons with precomputed ink lists and
  padded, pre-shifted templates: 650 → 390 ms per pass over the 33 non-captcha examples, every
  confidence identical. Self-test still 34/34.

### Bombs
- **OCR worker pool.** One shared Tesseract worker could read an image with another module's settings
  when two modules read at once (`setParameters` and `recognize` were separate queued jobs). Each read
  now leases a worker, sets only the settings that differ, reads, and hands the worker back. Up to 3
  workers depending on the device; extra workers start only when a read would have to wait.
  Timeouts start once a worker is leased, so waiting in the queue no longer drops letters.
- Independent reads now run in parallel: Word Search unclear cells and its 4-mode vote, Password's
  missed letters, Who's on First's display and 6 buttons, Balance glyphs and both equation sides.
  Word Search fixtures: same letters, 1,240 → 490 ms.
- Password, Who's on First, Balance, Button and Knobs start the OCR worker when they open.
- **Chess:** a search stops as soon as Stockfish has proven a mate (mate in N at depth ≥ min(12, 2N+2));
  mate-in-1 answers in 8–390 ms instead of 3 s. Other positions still search for 3 s.
- Stockfish is bundled into the build (`src/modules/chess/stockfishSource.js`), so Chess and the
  level 6.4 batch solver work from the single `dist/index.html` without a separate `stockfish.js`.

### App
- **Phone fix: "File couldn't be accessed".** Android opens local files as `content://` addresses, and
  adding `?play=heist` pointed at a file that doesn't exist. The game choice is now in the hash
  (`#play=heist` / `#play=bomb`); old `?play=` links still work.
- Tesseract.js pinned to 5.1.1; the CDN scripts load with `defer` so they no longer block the 9.6 MB page.

### Repo
- `tests/captchaKernel.test.js`: the WebAssembly kernels against plain-JS maths (45 tests total).
- `docs/ml-roadmap.md`: plan for making the captcha model itself cheaper (held-out split, fewer TTA
  reads, smaller model / distillation, quantisation).
- `train_and_patch.py`: train, export and patch pipeline for the captcha model.

## 2026-11-19 — Heist/Bombs chooser, Circuit module, retrained captcha model (c7b725c)
- Start page asks Heist or Bombs; each game loads alone. Heist ported into `src/heist/`.
- New Circuit module: reads resistors, wires and terminals and solves the network exactly.
- Captcha model retrained (hard-character oversampling, 5-read averaged decoding, threshold 0.5);
  cross-validation 83.5 % → 86.0 %.
- Search letters matched by shape; Balance handles wrapped equations, subscripts and brackets.
- Level 6.4 opens the batch chess solver.

## 2026-11-18 — Tester feedback, grouped modules, phone support (a67e820)
- Simon, Wire Seq, Logic, Search, Maze, Diagram, Symbols and Balance solver fixes.
- Copies of Maze, Symbols, Diagram and Chess share one page; 2–3 cards across on a laptop.
- Phones: dropdown module tabs under 700 px, paste box in every drop area.

## 2026-11-10 — Shared manuals, Password rows, hand-built levels (c67594c)
- Modules sharing one manual show as one window with a card per copy; manuals shared live.
- Password reads a screenshot row; Generate Level builds a level by clicking modules.

## 2026-11-10 — Audit fixes (8b71408)
- Mines solver: pruned backtracking per independent group instead of 2ⁿ brute force.
- Chess searches from different windows queue instead of cancelling each other; OCR and async
  result races fixed.
