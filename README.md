# Bomb Vision

A browser tool that solves the bomb-defusal puzzle modules of a heist minigame from screenshots. Paste a screenshot of a module, the page reads the board with computer vision or OCR, runs a solver, and copies the answer to the clipboard. Everything runs client-side in one static page; Tesseract.js, chess.js and the fonts are loaded from public CDNs.

**Live demo:** not deployed yet. What changed when: [CHANGELOG.md](CHANGELOG.md). Plan for a cheaper captcha model: [docs/ml-roadmap.md](docs/ml-roadmap.md).

![Symbols module with the built-in sample](docs/symbols-solver.png)

*The Symbols module on its built-in sample: two reference grids, the four keypad buttons, and the press order (highest symbol count first).*

## Modules

20 modules, each with its own input, answer, copy buttons and a collapsible view of the solver's working:

| | | | |
|---|---|---|---|
| Mines (8×10) | Queens (8×8) | Morse (GIF) | Word Search (5×5) |
| Maze (8×8) | Password | Switches | Diagram |
| Piano | Who's On First | Knobs | Rubik's Cube |
| Logic | Chess (8×8) | Simon Says | Wire Sequences |
| Complex Wires | Symbols | The Button | Balance |

A missions sidebar groups the modules by level, and the level generator builds that list from a screenshot of the bomb board.

How the pieces work:

- **Vision** (`src/modules/*/*Vision.js`, `src/utils/`): canvas pixel analysis written for each module: grid detection, Otsu thresholding, connected components, colour classification, GIF frame timing for Morse. No ML model.
- **OCR**: Tesseract.js for the modules that read letters (Word Search, Password, Who's On First, Balance).
- **Solvers** (`src/modules/*/*Solver.js`): constraint propagation plus exhaustive frontier search for Mines, iterative-deepening search for the cube, a recursive-descent parser for Logic expressions, rule tables for the manual-driven modules.
- **Chess**: Stockfish (bundled in `public/stockfish.js`) running in a Web Worker.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # dist/index.html with all app code inlined
npm test
npm run build:captcha-wasm   # only after editing src/heist/captcha/captchaKernel.c (needs clang)
```

The Heist captcha reader runs its network in WebAssembly SIMD (`src/heist/captcha/captchaKernel.c`, embedded as base64 in `captchaKernelWasm.js`); browsers without WebAssembly SIMD use the plain-JS version of the same network.

Several modules have a **SAMPLE** button that loads a built-in board, so you can see a solver work without a screenshot.

## Tests

`npm test` runs 45 tests on the solvers with Node's built-in test runner (no extra dependencies):

- **Mines**: on 2,000 random boards the solver never calls a mine safe or a safe square a mine; on 400 boards small enough to enumerate every mine layout, its output is exactly the set of squares forced by the clues.
- **Morse**: every word in the frequency table decodes correctly, including captures that start mid-word and timings with 20% jitter.
- **Logic**: operator precedence, ASCII operator spellings, all 32 assignments of a five-variable formula, error reporting.
- **Rubik's Cube**: hand-written single-turn scrambles are solved by the inverse turn, with and without hidden stickers.
- **Chess, Password, Word Search, Simon Says**: FEN round trip, candidate filtering, eight-direction search, rule parsing.

Not covered by automated tests: the vision and OCR code, which needs real game screenshots, and the 12 modules not listed above.

## Layout

```text
src/
├── App.jsx, main.jsx
├── core/            shared layout components, contexts, missions data, level generator
├── modules/<name>/  index.jsx (UI), working.jsx (working panel), *Vision.js, *Solver.js
├── styles/
└── utils/           canvas, image, GIF and thresholding helpers
tests/               solver tests
public/              stockfish.js and the original single-file version of the app
```

`migration.md` documents the shared component API and how to add a module.
