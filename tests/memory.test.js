import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { SAMPLE_MANUAL, parseMemoryManual, parseMemoryAction, solveMemoryStage } from '../src/modules/memory/memorySolver.js';
import { locateMemory } from '../src/modules/memory/memoryVision.js';

test('memory: the manual — 20 rules, one per stage and display', () => {
  const p = parseMemoryManual(SAMPLE_MANUAL);
  assert.equal(p.count, 20);
  assert.deepEqual(p.unclear, []);
  // the guide's three examples
  assert.deepEqual([p.rules[1][1].type, p.rules[1][1].n], ['label', 4]);
  assert.deepEqual([p.rules[2][3].type, p.rules[2][3].stage], ['samePos', 1]);
  assert.deepEqual([p.rules[2][4].type, p.rules[2][4].stage], ['sameLabel', 1]);
});

test('memory: instructions in other words', () => {
  const a = (t) => { const r = parseMemoryAction(t); return r && [r.type, r.n || r.stage]; };
  assert.deepEqual(a('press the button labeled "4"'), ['label', 4]);
  assert.deepEqual(a('button labelled 2'), ['label', 2]);
  assert.deepEqual(a('the second position'), ['pos', 2]);
  assert.deepEqual(a('position 3'), ['pos', 3]);
  assert.deepEqual(a('same position as stage 1'), ['samePos', 1]);
  assert.deepEqual(a('the same label used in stage 2'), ['sameLabel', 2]);
  assert.deepEqual(a('the label you pressed in stage 3'), ['sameLabel', 3]);
  const p = parseMemoryManual('Stage 1, display 1: press the button labeled 4\nStage 2:\n1 → second position\n2 - same label used in stage 1');
  assert.equal(p.count, 3);
  assert.equal(p.rules[2][2].type, 'sameLabel');
});

test('memory: positions and labels carried between stages', () => {
  const p = parseMemoryManual(SAMPLE_MANUAL);
  const h = [];
  let r = solveMemoryStage(p, 1, 1, [4, 2, 3, 1], h); // label 4 → 1st
  assert.deepEqual([r.pos, r.label], [1, 4]);
  h.push(r);
  r = solveMemoryStage(p, 2, 3, [1, 3, 4, 2], h); // stage 1's position (1st) → label 1
  assert.deepEqual([r.pos, r.label], [1, 1]);
  r = solveMemoryStage(p, 2, 4, [1, 3, 4, 2], h); // stage 1's label (4) → 3rd
  assert.deepEqual([r.pos, r.label], [3, 4]);
  h.push(r);
  // a label rule without the labels typed: the label is known, the place isn't
  assert.deepEqual([solveMemoryStage(p, 1, 1, null, []).label, solveMemoryStage(p, 1, 1, null, []).needLabels], [4, true]);
  assert.ok(solveMemoryStage(p, 3, 1, [1, 2, 3, 4], [h[0]]).error, 'stage 2 not entered yet');
});

test('memory: the picture — display, four labels and five stage lights (board crop)', () => {
  const r = locateMemory(readPng(new URL('./fixtures/memory_boardcrop.png', import.meta.url).pathname));
  assert.ok(r.display);
  assert.equal(r.labels.length, 4);
  assert.deepEqual(r.dots, { total: 5, lit: 0 });
});
