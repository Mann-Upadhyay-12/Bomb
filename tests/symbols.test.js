// Symbols: one puzzle can have 1–3 reference grids, one per helper player, each sent as its own image.
// The fixtures are three real helper screenshots (400×400) for the same Symbols module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { syReadPanels } from '../src/modules/symbols/symbolsVision.js';
import { addGrids } from '../src/modules/symbols/stripStore.js';

const load = f => readPng(new URL(`./fixtures/${f}`, import.meta.url).pathname);
const gridsOf = f => syReadPanels(load(f)).panels.map(p => ({ cells: p.cells, group: 0 }));
const total = grids => {
  const c = {};
  for (const g of grids) for (const k of g.cells) if (k) c[k] = (c[k] || 0) + 1;
  return c;
};

test('symbols OCR: each helper grid reads as one full 5×5 grid', () => {
  const want = [
    { KOPPA: 8, YAT: 7, LAMBDA_STROKE: 4, COPYRIGHT: 3, INV_QUESTION: 2, ZHE: 1 },
    { INV_QUESTION: 9, COPYRIGHT: 6, OMEGA: 2, STAR_SOLID: 2, STAR_HOLLOW: 2, LAMBDA_STROKE: 1, OT: 1, PSI: 1, KOPPA: 1 },
    { PSI: 15, ZHE: 3, DOUBLE_CROSS: 2, YAT: 1, LAMBDA_STROKE: 1, KOPPA: 1, INV_QUESTION: 1, STAR_HOLLOW: 1 }
  ];
  want.forEach((w, i) => {
    const g = gridsOf(`symbols_helper${i + 1}.png`);
    assert.equal(g.length, 1);
    assert.deepEqual(total(g), w);
  });
});

test('symbols: grids pasted one after another are added up, not replaced', () => {
  let strip = [];
  for (const n of [1, 2, 3]) strip = addGrids(strip, gridsOf(`symbols_helper${n}.png`)).grids;
  assert.equal(strip.length, 3);
  assert.deepEqual(total(strip), {
    PSI: 16, INV_QUESTION: 12, KOPPA: 10, COPYRIGHT: 9, YAT: 8, LAMBDA_STROKE: 6,
    ZHE: 4, STAR_HOLLOW: 3, OMEGA: 2, STAR_SOLID: 2, DOUBLE_CROSS: 2, OT: 1
  });
});

test('symbols: the same image pasted twice is counted once', () => {
  let strip = addGrids([], gridsOf('symbols_helper1.png')).grids;
  const again = addGrids(strip, gridsOf('symbols_helper1.png'));
  assert.equal(again.added.length, 0);
  assert.equal(again.grids.length, 1);
});

test('symbols: a strip section goes to its own puzzle', () => {
  const a = { cells: Array(25).fill('YAT'), group: 0 }, b = { cells: Array(25).fill('ZHE'), group: 1 };
  const c = { cells: Array(25).fill('YAT'), group: 1 }; // same cells as a, other puzzle → kept
  const { grids } = addGrids([a, b], [c]);
  assert.equal(grids.length, 3);
  assert.deepEqual(total(grids.filter(g => g.group === 1)), { ZHE: 25, YAT: 25 });
});
