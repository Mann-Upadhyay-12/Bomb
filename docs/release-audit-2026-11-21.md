# Bombs release audit — 2026-11-21

Scope: the **Bombs** game (`#play=bomb`) in the build made by `npm run build` (`dist/yuza.html` with auto-copy off by default, `dist/dixie.html` with auto-copy on). The Heist game shares the build but is a separate app: it was **not audited** beyond confirming the build completes.

Limits of this audit, stated up front:

- **The real game was not available.** Puzzle rules were checked against the manual text built into the code (default manuals, sample checklists) and against independently computed answers (textbook chemistry, Python fractions, brute-force search). Whether the game accepts each copied answer format (`# ` prefix, `SW1 → SW2`, `Wire 1 Wire 3`, `Qxf7#` …) was **not** verified.
- **Vision/OCR accuracy** was only tested where the repo has real screenshots (`tests/fixtures`: Maze, Logic, Balance, Word Search, Circuit, Symbols, Simon, Wire Seq). The other readers were not tested against real screenshots.
- The source audit covered the files listed as "Full" in the checklist below. "Partial" means only the answer, copy, input and error paths were read. "No" means not read.

---

## 1. Release recommendation

**READY WITH KNOWN ISSUES**, conditional on what you distribute:

- `yuza.html` (auto-copy **off**) is the safer file to hand out as-is. No crashes, every sample solved, and the clipboard is only written when the player clicks.
- `dixie.html` (auto-copy **on**) had a confirmed clipboard bug (**H1**) that could make a player's next Ctrl+V paste an old answer instead of the screenshot they just copied. **H1 and H3 were fixed on 2026-11-21 after this audit** (see their entries), so both builds can ship. H2 is still open.

No Critical findings: no crash, and no solver produced a wrong answer from correct input in any test.

---

## 2. Findings (most severe first)

### High

**H1. Auto-copy fires again when a module becomes active, overwriting the clipboard.** *Confirmed in the built `dixie.html`.* **FIXED 2026-11-21:** `src/core/useAnswerGate.js` — the 15 auto-copy effects (knob, circuit, wireseq, search, symbols, balance, simons, maze, complexwires, wof, diagram, piano, logic, button, password) now copy only when the answer changes. Re-running the same Playwright probe on the rebuilt `dixie.html`: 0 of 21 tabs re-copy (was 12), and the 16 SAMPLE auto-copies are unchanged. Card switching inside a module group goes through the same `isActive` path but was not separately tested in the browser. Trade-off: a new screenshot that gives exactly the same answer is not auto-copied again (Wire Seq counts the stage, so a repeat answer on a new stage still copies).
Every module's auto-copy effect lists `isActive` as a dependency and copies whenever it re-runs with an answer present. So switching back to a solved module's tab, or clicking a different card in a group (that changes which card is active), puts that module's old answer on the clipboard.
- Player scenario: copy the next screenshot (Simon stage 3, Wire Seq stage 2, Password row …) in Discord → switch to that module's tab or card in the app → the app replaces the image on the clipboard with the previous answer → Ctrl+V pastes text, and the new screenshot never arrives.
- Evidence: Playwright on `dist/dixie.html`. Clipboard set to `SENTINEL`, switched away, then back. In 12 modules the clipboard was overwritten: Search, Maze, Password, Diagram, Piano, Who's On First, Knobs, Logic, Complex Wires, Symbols, The Button, Balance. `yuza.html`: none.
- Files: every `src/modules/*/index.jsx` auto-copy `useEffect` (e.g. `password/index.jsx:47`, `wireseq/index.jsx:49`, `simons/index.jsx:89`, `maze/index.jsx:69`).
- Fix: copy only when the **answer** changes, not when the window is activated. One shared hook (`useAutoCopy(value, isActive)`) that remembers the last value it copied and skips activations is the smallest change.

**H2. Simon Says silently ignores a manual it can't parse.** *Code reading.*
`simons/index.jsx:72` falls back to the built-in default table when the pasted manual doesn't yield all 8 rules. The only warning (`simons/index.jsx:199`) is inside `!grouped`, but Simon is a "shared manual" module and **always** renders inside `ModuleGroup`, so the warning never appears. Meanwhile the group's manual bar (`ModuleGroup.jsx` `SharedManual`) says **LOADED ✓** for any text containing "flashes" and "press".
- Player scenario: the round's manual uses a different wording or layout (e.g. headings without "number/modules/disarmed") → the app shows LOADED ✓ and gives answers from the default table, which may be wrong for this round.
- Fix: show the parse result in the shared manual bar (e.g. "8/8 RULES" or "⚠ USING DEFAULT"). Ideally the bar shows a parse status for every manual: Wire Seq rule count, WOF positions, Piano codes found, Circuit colours.

**H3. "COPIED ✓" appears even when nothing was copied.** *Code reading.* **FIXED 2026-11-21:** the fallback now checks `execCommand`'s result and shows "⚠ COPY FAILED — CLICK THE ANSWER TO COPY". Verified in the built `dixie.html` by forcing both copy methods to fail (failure toast) and forcing the fallback to succeed (COPIED ✓). Not fixed: `chess63Core.js:119` still copies with no success/failure feedback.
`src/core/useClipboard.js:41-52`: when `navigator.clipboard.writeText` is rejected (page not focused — typical after dragging an image in from Discord — or no permission), the fallback runs `document.execCommand('copy')`. The fallback ignores its return value, which is `false` on failure, and always shows the toast.
- Player scenario: auto-copy runs while the page isn't focused → toast says COPIED ✓ → the clipboard still holds the old content → the player pastes a stale answer into the game.
- Fix: `if (document.execCommand('copy')) done(); else showToast('⚠ COPY FAILED — CLICK THE ANSWER')`.

### Medium

**M1. Maze keeps an old start/goal when a dot isn't detected.** `maze/index.jsx:84-89` updates `startPos`/`goalPos` only if found, but always sets `dotsLoaded = true`. A screenshot where the red or yellow dot isn't found solves from the previous screenshot's position, or (0,0)/(7,7), with no warning. Fix: if either dot is missing, keep `dotsLoaded` false and say which dot wasn't found.

**M2. Simon's auto-copy picks ODD by default.** `simons/index.jsx:74,83`: both answers are shown, but auto-copy copies a sticky ODD/EVEN choice (default ODD), not one tied to the bomb's actual disarmed count. A player relying on auto-copy can paste the wrong half. Fix: make the auto-copied side obvious next to the answer, or don't auto-copy Simon until the side has been chosen for this bomb.

**M3. Piano copies a non-code when the manual has no code for the interval.** `piano/index.jsx:42-53` copies `code || intervalName`, so a missing code puts e.g. `Minor 3rd` on the clipboard. An interval over an octave copies `15 half-steps`. Fix: don't auto-copy without a code, and show "no code for X in the manual".

**M4. Chess answer format depends on a CDN.** `chess/index.jsx:70-77` converts Stockfish's UCI move to SAN with `window.Chess` (chess.js, loaded from cdnjs). If that script didn't load, the copied answer silently changes from `Qxf7#` to `d1f7`. Fix: bundle chess.js like Stockfish, or warn when falling back.

**M5. OCR modules need internet (accepted).** Tesseract.js and its language data load from jsDelivr at runtime. Offline, Password, Word Search, Who's On First, Balance, Button and Knobs can't read screenshots. They show an "OCR unavailable" message and manual entry still works. You've said Bombs needing internet is fine; listed only so players are told the page needs a connection.

**M6. When the answer is "no cut" or "Null", auto-copy leaves the previous answer on the clipboard.** Wire Seq (`wireseq/index.jsx:52`) and Complex Wires (`complexwires/index.jsx:103`) auto-copy only when there is at least one cut. Diagram (`diagram/index.jsx:127`) skips `Null`. The clipboard keeps the previous stage's `Wire 1 …`. Fix: also copy `NONE` (or clear the clipboard), or show "nothing to copy".

**M7. Knobs: a failed read is silent, and ties are decided silently.** `knob/index.jsx:66-76`: if detection doesn't return 12 LEDs, nothing happens. No toast; the old LEDs and old answer stay on screen. `knobSolver.js:89-101`: when both rows match and have equal lit counts, the top row wins without a note. Can't confirm the tie rule against the real manual.

**M8. Complex Wires starts with assumed bomb facts.** `complexwires/index.jsx:28`: serial ODD, no needy, ≥5 modules. Rules S/P/B give confident cut lists from these defaults if the player never sets them. (Complex Wires isn't in any built-in level, so exposure is low.)

**M9. Queens picks the first of several solutions silently.** `queens/index.jsx:35`: if the region read is off and the puzzle has more than one solution, the first is copied with no warning.

### Low

- **L1** `password/passwordSolver.js:16`: `CANCEL` (6 letters) is in the default list and can never match. The list effectively has 44 words. Typo for a 5-letter word?
- **L2** `search/index.jsx:58-68`: auto-copy depends on the grid only, so editing the word list after the grid is filled doesn't re-copy. 2-letter words are accepted in the list but never searched (`searchSolver.js:31`).
- **L3** Morse: auto-copy and clicking the answer copy the word (`SHELL`); the stamp shows `SHELL 3.505 MHz`. The frequency is a separate copy button. Fine if the game wants the word; check.
- **L4** Switches `swNorm` silently pads a short state with `U`.
- **L5** `dist/` ships debug and test pages copied from `public/`: `dnd-debug.html`, `HiTestCTC.html`, `HeistMannHiHiHellowHi.html`, `test`-style standalone pages. Remove the ones players shouldn't get.
- **L6** `Dropzone.jsx` `loadFromSource`: a slow image-link paste followed quickly by a file paste can finish last and overwrite the newer result.
- **L7** Balance: when the null space has more than one dimension, the sum of basis vectors can contain a negative and the solver reports "no all-positive solution" for a solvable mix. Rare; it is already flagged as ambiguous.
- **L8** Knobs (unexplained): in `dixie.html` the SAMPLE answer was not auto-copied (clipboard unchanged), although switching back to the tab did copy it. Not investigated further.

---

## 3. Solver-by-solver status

| Module | Solver logic | How it was verified | Result | Remaining risk |
|---|---|---|---|---|
| Mines | `minesSolver.js` | existing tests: 2,000 random boards + exhaustive enumeration; built-app SAMPLE | ✅ pass | vision not tested on real screenshots |
| Queens | `queensSolver.js` | **new**: 60 random puzzles grown from a planted solution, every solution checked against the rules; SAMPLE | ✅ | M9; vision untested |
| Morse | `morseDecoder.js` | existing tests (all words, mid-word start, 20 % jitter); SAMPLE | ✅ | L3; GIF reader untested on real GIFs |
| Word Search | `searchSolver.js` | existing + **new** direction tests; SAMPLE | ✅ | L2 |
| Maze | `mazeSolver.js` | existing fixture (real 2-maze strip) + **new** open/blocked grids; SAMPLE | ✅ solver | **M1** |
| Password | `passwordSolver.js` | existing + **new**; SAMPLE (CHAIR) | ✅ | L1 |
| Switches | `switchesSolver.js` | **new**: all 1,024 start/goal pairs = Hamming distance; 400 random forbidden sets vs a reference BFS | ✅ | L4 |
| Diagram | `diagramCore.js` expression | **new**: all 16 (2-circle) + 512 (3-circle, two letter orders) shadings evaluate back exactly; fully bracketed | ✅ | circle/letter reading untested on real screenshots |
| Piano | `pianoSolver.js` | **new**: staff positions → notes (treble/bass lines, ledger C4), default codes cover all 12 intervals | ✅ | **M3** |
| Who's On First | `wofSolver.js` | **new**: default manual parses to 6 positions, first-match rule, fuzzy match keeps `'`/`?` | ✅ | OCR untested on real screenshots |
| Knobs | `knobSolver.js` | **new**: default rules 32 patterns, no pattern in two directions, odd/even pick | ✅ | **M7**, L8 |
| Rubik's Cube | `cubeSolver.js` | existing tests (solved, inverse turn, partial stickers) | ✅ unit | built-app SAMPLE was still searching at 1.5 s (not waited longer) |
| Logic | `logicSolver.js` | existing tests (precedence, all 32 assignments, OCR fixtures); SAMPLE | ✅ | a failed stage is dropped from the copied line |
| Chess | Stockfish (bundled) | built-app SAMPLE → `Qxf7#` (engine loads from the inline copy) | ✅ | **M4** |
| Chess batch (6.4) | `chess63Core.js` | **not audited** (ported standalone page) | ❓ | not inspected |
| Simon Says | `simonsSolver.js` | existing tests (glow, last flash, gap = two flashes) + **new** default rules | ✅ solver | **H2**, **M2**; no SAMPLE, so not run in the built app |
| Wire Sequences | `wireseqRules.js` | existing stage-dot test + **new**: 27 default rules, counts carry across stages, quick-entry parser | ✅ | **M6**; no SAMPLE, so not run in the built app |
| Complex Wires | `complexwiresConstants.js` | **new**: 4 presets × 16 regions valid; SAMPLE | ✅ | M8, M6 |
| Symbols | press order in `index.jsx` | existing strip-splitting tests; SAMPLE → `2 1 4 3` (matches the comment in the code); `tests/symbols.test.js` with 3 real helper grids | ✅ (fixed after the audit) | **Bug found by the user after the audit, now fixed:** each paste replaced the grids, so with 2–3 helpers only the last helper's grid was counted. Pastes are now added up (`addGrids` in `stripStore.js`) and a duplicate paste is skipped. Grids are cleared on **clear** or a level change, not between bombs on the same level. Ties are warned, not resolved |
| The Button | `buttonSolver.js` | existing tests (three real checklists, wordings); SAMPLE → `7s` | ✅ | an unknown wording blocks the answer (safe) |
| Balance | `balanceSolver.js` | **new**: 13 textbook equations incl. sucrose, KMnO4 + HCl, hydrate; 6 invalid inputs rejected; OCR fixes; existing fixtures | ✅ | L7 |
| Circuit | `circuitSolver.js` | **new**: series, parallel, balanced and unbalanced bridge (26/9 Ω, checked with Python fractions), open circuit, unknown colour, 0 Ω → error | ✅ | no SAMPLE, so not run in the built app; copies the value rounded to 2 decimals |

---

## 4. Shared functionality

- `useClipboard.js`: **H3**. `# ` prefix on by default (`AppStateContext.jsx:12`). Every copied answer starts with `# `, confirmed in the build. Make sure the game accepts that.
- `AppStateContext.jsx`: the auto-copy default per build works: `dixie.html` copied on SAMPLE and `yuza.html` didn't (checked for every module with a SAMPLE).
- `Dropzone.jsx`: paste and drop only go to the visible window. Drops in a group go to the card under the pointer (code reading). L6.
- `ModuleGroup.jsx` / `sharedSetting.js`: a manual pasted anywhere loads for every copy. The status shows LOADED ✓ without checking the parse result (H2).
- `searchOCR.js` worker pool: each handle keeps its own settings, so parallel reads can't swap whitelists (checked every caller in Balance, WOF, Search, Knobs, Button). Needs the CDN (M5).
- `utils/canvas.js`: one shared work canvas. All callers read it synchronously (no `await` between drawing and reading), so modules don't clobber each other.
- `ToastContext.jsx`: now takes an optional duration (used by the needy reminder).

## 5. Game interaction

- Manual copy (clicking the answer) and auto-copy put the same text on the clipboard in every module checked, except Morse (L3) and Password with several candidates (click copies all candidates; auto-copy waits for one).
- Auto-copy timing: H1 (copies on activation), H3 (false success), M6 (nothing copied for "no cut").
- Interference between solvers: none found in the browser run (21 modules opened one after another, no errors). Shared state is only the manuals and the Button facts, by design.

## 6. Tests run

| What | Result |
|---|---|
| `npm test` before the audit | 60/60 pass |
| New tests added: `tests/audit-solvers.test.js`, `tests/audit-solvers2.test.js`, `tests/audit-diagram.test.js` | 23 new tests |
| `npm test` after | **83/83 pass** |
| Built-app run (Playwright + Chromium) on `dist/dixie.html` and `dist/yuza.html`: open every module, load its SAMPLE, read the answer and the clipboard, tab-switch clipboard probe, needy timer with a fake clock | 0 page errors and 0 console errors in both; results as described above |

Two of my test expectations were wrong at first and were corrected after independent checks; the code was right both times: the word-search direction (`YTO`, not `YSN`) and the unbalanced bridge (26/9 Ω, confirmed with Python fractions, not 3 Ω).

## 7. Build

- `npm run build` completes. It writes `dist/yuza.html` (9.68 MB) and `dist/dixie.html` (9.68 MB, differs only in the auto-copy default) plus the `public/` pages and `stockfish.js`.
- Both pages load and run from `dist/` over HTTP. Not tested: opening them from `file://` and on phones.
- External resources at runtime: Tesseract.js (jsDelivr), chess.js (cdnjs), Google Fonts, plus Discord CDN warm-up requests. Stockfish has CDN fallbacks but loaded from the inline copy in the test.
- Dev vs build: the dev server was not compared side by side. The build was tested directly.

## 8. New feature in this session: needy reminder

`src/core/components/NeedyTimer.jsx`: a ▶ NEEDY REMINDER button next to the missions button, shown on every level and in All Modules. While running, it shows a countdown and pops "⚠ PLEASE CHECK THE NEEDY" for 4 s every 30 s. Picking another level stops it.
Verified in both builds with a fake clock: no toast at 29 s, toast at 30.5 s, gone by 35.5 s, toast again at 60.5 s, none after stopping. Note: in a background tab the browser may delay timers, and a toast can't be seen while the tab is hidden anyway.

---

## 9. File checklist

Legend: **Inspected** Full / Partial (answer, copy, input and error paths) / No. **Tested**: U = unit test, E = built-app run, F = real-screenshot fixture, — = none.

### Core and shared (25 files)

| File | Inspected | Deps traced | Tested | Issues |
|---|---|---|---|---|
| src/main.jsx | Full | Yes | E | — |
| src/App.jsx | Full | Yes | E | — |
| src/core/AppStateContext.jsx | Full | Yes | E | — |
| src/core/ToastContext.jsx | Full | Yes | E | changed (duration) |
| src/core/useClipboard.js | Full | Yes | E | **H3** |
| src/core/Dropzone.jsx | Full | Yes | — | L6 |
| src/core/InstanceContext.jsx | Full | Yes | E | — |
| src/core/sharedSetting.js | Full | Yes | E | — |
| src/core/sectionsData.js | Full | Yes | — | — |
| src/core/ModeRouter.jsx | Partial | Yes | E | — |
| src/core/GameChooser.jsx | Full | Yes | E | — |
| src/core/ThemeContext.jsx | No | No | E (loads) | — |
| src/core/components/ModuleGroup.jsx | Full | Yes | E | H2 (status) |
| src/core/components/ModuleInput.jsx | Full | Yes | E | — |
| src/core/components/AnswerPanel.jsx | Full | Yes | E | — |
| src/core/components/CopyLines.jsx | Full | Yes | — | — |
| src/core/components/MissionSidebar.jsx | Full | Yes | — | — |
| src/core/components/NeedyTimer.jsx | Full | Yes | E | new |
| src/core/components/ModuleLayout.jsx | No | No | E (renders) | — |
| src/core/components/WorkingPanel.jsx | No | No | E (renders) | — |
| src/core/components/Common.jsx | No | No | — | — |
| src/core/level/LevelGenerator.jsx | No | No | — | not audited |
| src/core/level/levelVision.js | No | No | — | not audited |
| src/core/level/levelTitleRefs.js | No | No | — | not audited |
| src/utils/image.js | Full | Yes | — | — |
| src/utils/canvas.js | Full | Yes | — | — |
| src/utils/otsu.js | Full | Yes | — | — |
| src/utils/gif.js | No | No | U (indirect: Simon/Morse tests) | — |

### Modules (89 files)

| Module | index.jsx | Solver | Vision / OCR | working.jsx / other | Tested | Issues |
|---|---|---|---|---|---|---|
| balance | Partial | Full | Partial (OCR section) | No | U F E | L7 |
| button | Partial | Full | Partial (OCR call) | No | U E | — |
| chess | Partial | — | No (`chessVision.js`) | engine Partial, stockfishSource No, working No | U E | M4 |
| chess63 | No | No (`chess63Core.js`) | — | — | — | not audited |
| circuit | Partial | Full | No | No | U F | — |
| complexwires | Partial | Full (constants) | No | No | U E | M6, M8 |
| cube | Partial | Partial | No | No | U E | — |
| diagram | Partial | Partial (expression engine Full) | No | diagramStrip No, working No | U F E | M6 |
| knob | Partial | Full | Partial | No | U E | M7, L8 |
| logic | Partial | Full | Full | No | U F E | — |
| maze | Partial | Full | Partial | mazeStrip No, manualBar No, working No | U F E | **M1** |
| mines | Partial | No (covered by existing tests) | No | No | U E | — |
| morse | Partial | Partial | — | No | U E | L3 |
| password | Partial | Full | No | No | U E | L1 |
| piano | Partial | Full | No | No | U E | M3 |
| queens | Partial | Full | No | constants Full, working No | U E | M9 |
| search | Partial | Full | Partial (pool Full, glyphs No) | No | U F E | L2 |
| simons | Partial | Full | Full (in solver file) | No | U F | **H2**, M2 |
| switches | Partial | Full | No | No | U E | L4 |
| symbols | Partial | Partial (order) | No | constants Full, stripStore No, SymbolGlyph No, working No | U F E | — |
| wireseq | Partial | Full | Full (in rules file) | No | U F | M6 |
| wof | Partial | Full | Partial | No | U E | — |

### Styles (30 files)

`src/styles/**/*.css`: not inspected line by line. Exercised by the built-app run (pages rendered, buttons clickable). `sidebar.css`: needy-button styles added and checked.

### Build and packaging (13 files)

| File | Inspected | Result |
|---|---|---|
| package.json | Full | — |
| vite.config.js | Full | single-file build |
| scripts/build-variants.mjs | Full | builds both variants; copies `public/` → L5 |
| index.html | No | build loads it fine |
| public/*.html (8) + public/stockfish.js | Listed only | shipped in `dist/` → L5 |

### Totals

- Relevant files identified: **160** (117 JS/JSX in Bombs scope, 30 CSS, 4 build/config, 9 public).
- Fully inspected: **≈45**. Partially inspected: **≈35**. Not inspected: **≈80** (mostly vision readers, `working.jsx` panels, level generator, chess batch, CSS, public pages).
- Every solver's core logic was inspected and tested except `chess63Core.js`.

## 10. Still unverified

- Every answer format against the real game, including the `# ` prefix.
- Vision readers without real screenshots in the repo: Mines, Queens, Switches, Piano, Who's On First, Knobs, Cube, Chess, Complex Wires, Password, Button, Diagram, Morse GIFs, the level generator.
- Chess batch (level 6.4).
- Simon, Wire Seq and Circuit in the built app (no SAMPLE button).
- `file://` and mobile use of the built page; offline behaviour (M5).
- The Heist game.
