// Knobs: the manual picture (UP / DOWN / LEFT / RIGHT panels of X / O) is read into the solver's table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readKnobManual, knobManualText } from '../src/modules/knob/knobManual.js';
import { parseKnobRules, solveKnob } from '../src/modules/knob/knobSolver.js';

const img = readPng(new URL('./fixtures/knob_manual.png', import.meta.url));
// transcribed by eye from the picture
const EYE = {
  UP: 'OOOOXO OOXOXX XXXOOO XXXOXX OOXOOO XXXOOX OXXOXO OOOOXX',
  DOWN: 'OXOOXX XOXXXX XXOXOO XOOOOX OXOXOO XOOOOO OXOXOX OOOXOO',
  LEFT: 'XOXOOO XOXOXX XXOOOO OXXXXO XXXXXX OOXOOX OXOXXO XOXXOX',
  RIGHT: 'XXOXXX XXXXOO XOOXXO XXOOXO OXXOOO XOOXXX XXOOXX OOXXOX'
};
const scale = (im, f) => {
  const W = Math.round(im.width * f), H = Math.round(im.height * f), data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (Math.min(im.height - 1, Math.floor((y + 0.5) / f)) * im.width + Math.min(im.width - 1, Math.floor((x + 0.5) / f))) * 4, t = (y * W + x) * 4;
    for (let k = 0; k < 4; k++) data[t + k] = im.data[s + k];
  }
  return { data, width: W, height: H };
};

test('knob manual: all four panels, titles read from their letters, every X / O', () => {
  const r = readKnobManual(img.data, img.width, img.height);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.panels.map(p => [p.dir, p.titleRead]), [['UP', true], ['DOWN', true], ['LEFT', true], ['RIGHT', true]]);
  for (const d of Object.keys(EYE)) assert.equal(r.dirs[d].join(' '), EYE[d], d);
});

test('knob manual: same table at other picture sizes', () => {
  for (const f of [0.75, 1.6]) {
    const s = scale(img, f);
    const r = readKnobManual(s.data, s.width, s.height);
    assert.equal(r.ok, true, `×${f}: ${r.reason}`);
    for (const d of Object.keys(EYE)) assert.equal(r.dirs[d].join(' '), EYE[d], `×${f} ${d}`);
  }
});

test('knob manual: the text it makes is what the solver reads', () => {
  const r = readKnobManual(img.data, img.width, img.height);
  const rules = parseKnobRules(knobManualText(r.dirs, '# read from the manual picture 2026-11-22T12:00:00.000Z'));
  for (const d of Object.keys(EYE)) assert.deepEqual(rules[d], [...new Set(EYE[d].split(' '))], d);
  // top row matches LEFT (OXXXXO, 4 lit), bottom row matches UP (OOXOOO, 1 lit)
  assert.equal(solveKnob('OXXXXO', 'OOXOOO', 1, rules).direction, 'LEFT'); // odd → most lit
  assert.equal(solveKnob('OXXXXO', 'OOXOOO', 0, rules).direction, 'UP');   // even → fewest lit
});

test('knob manual: other pictures are not taken for the manual', () => {
  for (const f of ['circuit/legend_game.png', 'circuit/real_shorted_bus.png', 'blackjack_defuser_6.png', 'pipes_helper.png']) {
    const im = readPng(new URL(`./fixtures/${f}`, import.meta.url));
    const r = readKnobManual(im.data, im.width, im.height);
    assert.ok(!(r.panels.length === 4 && r.panels.reduce((n, p) => n + p.rows.join('').length, 0) >= 150), f);
  }
});

// ── Defuser picture: the 12 lamps (lit = yellow) ─────────────────────────────────────────────
test('knob lamps: read from the module picture, not OCR (top 100000, bottom 110111)', async () => {
  const { readKnobLeds } = await import('../src/modules/knob/knobVision.js');
  const p = readPng(new URL('./fixtures/knob_defuser_lamps.png', import.meta.url));
  const r = readKnobLeds(p.data, p.width, p.height);
  assert.equal(r.how, 'lamps');
  assert.deepEqual(r.state, [1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1]);
  // the manual picture is not a lamp panel
  assert.equal(readKnobLeds(img.data, img.width, img.height), null);
});
