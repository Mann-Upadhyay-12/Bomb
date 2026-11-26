import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readCircuit } from '../src/modules/circuit/circuitVision.js';
import { solveCircuit, parseCircuitManual, CIRCUIT_DEFAULT_MANUAL } from '../src/modules/circuit/circuitSolver.js';
import { readLegend, legendToManual, classifyDigit } from '../src/modules/circuit/circuitLegend.js';
import { DIGIT_REFS } from '../src/modules/circuit/circuitDigits.js';
import { decodeShape, glyphScore } from '../src/utils/glyph.js';

const FIX = new URL('./fixtures/circuit/', import.meta.url).pathname;
const MAN = parseCircuitManual(CIRCUIT_DEFAULT_MANUAL);
// look-alikes of the game's Circuit module (bridge checked against numpy: 5.914529…)
const CASES = { series: '32', diagonal: '9', bridge: '692/117', parallel: '72/7', real_shorted_r3: '10', real_dark_labels: '26/3' }; // real_*: game screenshots (dark_labels: R3–R5 carry dark text)

for (const [name, exact] of Object.entries(CASES)) {
  test(`circuit: ${name}`, () => {
    const { data, width, height } = readPng(FIX + name + '.png');
    const c = readCircuit(data, width, height);
    assert.ok(c.ok, c.error);
    const s = solveCircuit(c.resistors, c.A, c.B, MAN);
    assert.ok(s.ok, s.error);
    assert.equal(s.ohms.exact, exact);
  });
}

test('circuit manual parsing (aliases, decimals)', () => {
  assert.deepEqual(parseCircuitManual('Purple = 2.5 Ω\nGrey: 7\nred=1'), { violet: '2.5', gray: '7', red: '1' });
  const s = solveCircuit([{ a: 1, b: 2, color: 'violet' }, { a: 1, b: 2, color: 'violet' }], 1, 2, { violet: '2.5' });
  assert.equal(s.ohms.exact, '5/4');
});

test('circuit: shorted and open terminals', () => {
  assert.equal(solveCircuit([{ a: 1, b: 2, color: 'red' }], 1, 1, MAN).ohms.exact, '0');
  assert.ok(!solveCircuit([{ a: 1, b: 2, color: 'red' }], 1, 3, MAN).ok);
});

// ---- the colour legend picture (values change every game) ----

const LEGEND = { red: '4', orange: '20', yellow: '12', green: '6', blue: '16', violet: '10', white: '2', gray: '8' };
const legendImg = readPng(FIX + 'legend_game.png');
const scale = (img, f) => {
  const W = Math.round(img.width * f), H = Math.round(img.height * f), data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (Math.min(img.height - 1, Math.floor((y + 0.5) / f)) * img.width + Math.min(img.width - 1, Math.floor((x + 0.5) / f))) * 4, t = (y * W + x) * 4;
    for (let k = 0; k < 4; k++) data[t + k] = img.data[s + k];
  }
  return { data, width: W, height: H };
};

test('circuit legend: all 8 colours and values read, every one sure', () => {
  const r = readLegend(legendImg.data, legendImg.width, legendImg.height);
  assert.ok(r.ok);
  assert.deepEqual(Object.fromEntries(r.chips.map(c => [c.color, c.value])), LEGEND);
  assert.ok(r.chips.every(c => c.sure));
  assert.deepEqual(parseCircuitManual(legendToManual(r.chips)), LEGEND);
});

test('circuit legend: same values at other picture sizes', () => {
  for (const f of [0.7, 1.5]) {
    const img = scale(legendImg, f);
    const r = readLegend(img.data, img.width, img.height);
    assert.deepEqual(Object.fromEntries(r.chips.map(c => [c.color, c.value])), LEGEND, `×${f}`);
  }
});

test('circuit legend: the font shapes alone read the real digits (3 5 7 9 rely on them)', () => {
  const r = readLegend(legendImg.data, legendImg.width, legendImg.height);
  const fontOnly = DIGIT_REFS.filter(x => x.font !== 'game').map(x => ({ ...x, v: decodeShape(x.fp) }));
  for (const c of r.chips) {
    for (const g of c.digits) {
      const best = {};
      for (const ref of fontOnly) { const s = glyphScore(g.glyph, ref); if (!(ref.ch in best) || s > best[ref.ch]) best[ref.ch] = s; }
      const rk = Object.entries(best).sort((a, b) => b[1] - a[1]);
      assert.equal(rk[0][0], g.ch, `${c.color}: ${g.ch} read as ${rk[0][0]}`);
      assert.ok(rk[0][1] - rk[1][1] > 0.15, `${c.color} ${g.ch}: margin ${(rk[0][1] - rk[1][1]).toFixed(2)}`);
    }
  }
  assert.ok(['3', '5', '7', '9'].every(d => fontOnly.some(x => x.ch === d)));
  assert.equal(classifyDigit(r.chips[0].digits[0].glyph).ch, '4');
});

test('circuit legend vs circuit: each picture is told apart', () => {
  const asCircuit = readCircuit(legendImg.data, legendImg.width, legendImg.height);
  assert.equal(asCircuit.terminals.length, 0);
  for (const name of ['real_shorted_bus', 'bridge', 'series']) {
    const { data, width, height } = readPng(FIX + name + '.png');
    assert.equal(readLegend(data, width, height).chips.length, 0, name);
  }
});

test('circuit: real game — R2–R4 shorted by the bottom wire, legend values → 4 + 12 = 16 Ω', () => {
  const lg = readLegend(legendImg.data, legendImg.width, legendImg.height);
  const { data, width, height } = readPng(FIX + 'real_shorted_bus.png');
  const c = readCircuit(data, width, height);
  assert.ok(c.ok, c.error);
  assert.deepEqual(c.resistors.map(r => r.color).sort(), ['gray', 'gray', 'gray', 'red', 'yellow']);
  const s = solveCircuit(c.resistors, c.A, c.B, parseCircuitManual(legendToManual(lg.chips)));
  assert.equal(s.ohms.exact, '16');
});
