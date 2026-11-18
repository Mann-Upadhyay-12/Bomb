// Regression tests for the tester-reported bugs (Simon, Wire Sequences, Logic, Balance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { siAnalyzeFrames, SI_POS, SI_REF } from '../src/modules/simons/simonsSolver.js';
import { wsReadImage } from '../src/modules/wireseq/wireseqRules.js';
import { evaluateExpression, classify } from '../src/modules/logic/logicSolver.js';
import { fixOcrFormulaSide, balanceEquation } from '../src/modules/balance/balanceSolver.js';

// ── Simon: synthetic module frames (dark board, four unlit tiles, one lit) ──────────────────
const W = 242, H = 242;
function simonFrame(lit) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { d[i * 4] = 30; d[i * 4 + 1] = 33; d[i * 4 + 2] = 40; d[i * 4 + 3] = 255; }
  for (const k in SI_POS) {
    const cx = Math.round(SI_POS[k][0] * W), cy = Math.round(SI_POS[k][1] * H);
    const c = k === lit ? SI_REF[k].map(v => Math.min(255, v + 70)) : SI_REF[k];
    for (let y = cy - 12; y <= cy + 12; y++) for (let x = cx - 12; x <= cx + 12; x++) {
      const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
  return { data: d };
}

test('simon: unlit yellow is not a flash (the old detector saw yellow on every frame)', () => {
  const r = siAnalyzeFrames([simonFrame(null), simonFrame(null), simonFrame(null)], W, H);
  assert.equal(r.color, null);
  assert.deepEqual(r.flashes, []);
});

test('simon: a GIF stage is its LAST flash; repeats separated by a gap count twice', () => {
  const seq = [null, 'Y', null, 'B', 'B', null, 'B', null].map(simonFrame);
  const r = siAnalyzeFrames(seq, W, H);
  assert.deepEqual(r.flashes, ['Y', 'B', 'B']);
  assert.equal(r.color, 'B');
  for (const c of ['R', 'G', 'Y', 'B']) assert.equal(siAnalyzeFrames([null, c, null].map(simonFrame), W, H).color, c);
});

// ── Wire Sequences: pager-dot stage detection ─────────────────────────────────────────────
function wsImage(dotIdx, strayX) {
  const w = 400, h = 400, d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = 40; d[i * 4 + 1] = 40; d[i * 4 + 2] = 44; d[i * 4 + 3] = 255; }
  const paint = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      const i = (y * w + x) * 4; d[i] = 240; d[i + 1] = 180; d[i + 2] = 80;
    }
  };
  paint(Math.round((0.40 + 0.05 * dotIdx) * w), Math.round(0.82 * h), 4);
  if (strayX != null) paint(Math.round(strayX * w), Math.round(0.86 * h), 3); // orange reflection
  return { data: d, width: w, height: h };
}

test('wire seq: stage dot is binned, a stray orange blob no longer drags stage 1 to stage 3', () => {
  for (let s = 0; s < 5; s++) assert.equal(wsReadImage(wsImage(s)).stageNo, s + 1);
  assert.equal(wsReadImage(wsImage(0, 0.62)).stageNo, 1);
});

// ── Logic ─────────────────────────────────────────────────────────────────────────────────
test('logic: ß typed or pasted means β', () => {
  const vars = { P: true, Q: true, R: false, S: true, T: true };
  assert.equal(evaluateExpression('ß^P', { 'β': true }, vars), true);
  assert.equal(evaluateExpression('¬ß', { 'β': true }, vars), false);
});

test('logic: thin italic β from the game (one loop, narrow) is β, not Q; R / P unchanged', () => {
  // measured from a real stage-3 screenshot: (¬S V (¬R V (β V T)))
  const beta = { stem: 0.567, aspect: 0.567, hRel: 0.6, holes: 1, holeCy: 0.399, TL: 0.055, TC: 0.142, TR: 0.153, BL: 0.148, BC: 0.098, BR: 0.027, ML: 0.197, BRq: 0.109, topCover: 0.706, leftEdge: 0.333 };
  const R = { stem: 1, aspect: 0.929, hRel: 0.56, holes: 1, holeCy: 0.281, TL: 0.124, TC: 0.202, TR: 0.048, BL: 0.099, BC: 0.126, BR: 0.103, ML: 0.138, BRq: 0.2, topCover: 0.808, leftEdge: 1 };
  assert.equal(classify(beta), 'β');
  assert.equal(classify(R), 'R');
  assert.equal(classify({ ...R, BRq: 0.02 }), 'P');
  assert.equal(classify({ ...R, stem: 0.6, leftEdge: 0.9 }), 'Q'); // round letter with a solid left side
});

// ── Balance ───────────────────────────────────────────────────────────────────────────────
test('balance: OCR "l" on its own is iodine, "l" after a capital stays (Cl, Al)', () => {
  assert.equal(fixOcrFormulaSide('l2'), 'I2');
  assert.equal(fixOcrFormulaSide('HCI'), 'HCl');
  assert.equal(balanceEquation(`H2 + ${fixOcrFormulaSide('l2')} → HI`).answer, '1 1 2');
});

// ── Symbols strip layout: which grids are added up for which puzzle ──────────────────────
import { syLayoutPanels } from '../src/modules/symbols/symbolsVision.js';
import { dgSplitPanels } from '../src/modules/diagram/diagramStrip.js';

// Draw a fake strip: dark page, light 5×5 grids (with thin dark cell lines), optional orange header text
function strip(W, H, grids, headers = []) {
  const d = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, r, g, b) => { const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 22, 24, 30);
  for (const [gx, gy, s] of grids) for (let y = gy; y < gy + s; y++) for (let x = gx; x < gx + s; x++) {
    const line = (x - gx) % (s / 5) < 1 || (y - gy) % (s / 5) < 1;
    const v = line ? 40 : 235;
    put(x, y, v, v, v);
  }
  for (const [hx, hy] of headers) for (let y = hy; y < hy + 14; y++) for (let x = hx; x < hx + 120; x += 2) put(x, y, 255, 200, 120);
  return { data: d, width: W, height: H };
}
const groupsOf = img => syLayoutPanels(img).rects.map(r => r.group);

test('symbols: grids side by side are one puzzle; the row below is the next puzzle', () => {
  const img = strip(460, 460, [[10, 10, 200], [240, 10, 200], [10, 240, 200]]);
  assert.deepEqual(groupsOf(img), [0, 0, 1]);
});

test('symbols: with headers, every grid under header #n is puzzle #n (even stacked)', () => {
  const img = strip(240, 760, [[20, 40, 200], [20, 260, 200], [20, 520, 200]], [[30, 10], [30, 480]]);
  assert.deepEqual(groupsOf(img), [0, 0, 1]);
});

test('symbols: one grid per line without headers → puzzle 1, 2, 3', () => {
  const img = strip(240, 700, [[20, 10, 200], [20, 240, 200], [20, 470, 200]]);
  assert.deepEqual(groupsOf(img), [0, 1, 2]);
});

test('symbols: a single grid is one puzzle', () => {
  const r = syLayoutPanels(strip(240, 240, [[20, 20, 200]])).rects;
  assert.equal(r.length, 1);
  assert.equal(r[0].group, 0);
});

test('diagram: a strip of panels is split one per card, a single panel is not', () => {
  const panel = (W, H, rects) => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) { d[i * 4] = 20; d[i * 4 + 1] = 22; d[i * 4 + 2] = 27; d[i * 4 + 3] = 255; }
    for (const [x0, y0, s] of rects) for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) {
      const i = (y * W + x) * 4; d[i] = 44; d[i + 1] = 48; d[i + 2] = 54;
    }
    return d;
  };
  assert.equal(dgSplitPanels(panel(440, 880, [[8, 8, 424], [8, 448, 424]]), 440, 880).length, 2);
  assert.equal(dgSplitPanels(panel(880, 440, [[8, 8, 424], [448, 8, 424]]), 880, 440).length, 2);
  assert.equal(dgSplitPanels(panel(440, 440, [[8, 8, 424]]), 440, 440).length, 0);
});
