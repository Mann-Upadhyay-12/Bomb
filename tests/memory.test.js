import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { SAMPLE_MANUAL, parseMemoryManual, parseMemoryAction, solveMemoryStage, stageAfterPicture } from '../src/modules/memory/memorySolver.js';
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

// The manual from a game where one drop was read as two stages (2026-11-26)
const GAME_MANUAL = `Stage 1
• If the display is 1, press the button in position 2.
• If the display is 2, press the button in position 3.
• If the display is 3, press the button labeled 3.
• If the display is 4, press the button labeled 2.
Stage 2
• If the display is 1, press the button labeled 3.
• If the display is 2, press the button labeled 3.
• If the display is 3, press the button labeled 3.
• If the display is 4, press the button labeled 3.
Stage 3
• If the display is 1, press the button labeled 3.
• If the display is 2, press the button labeled 4.
• If the display is 3, press the button labeled 4.
• If the display is 4, press the button in position 3.
Stage 4
• If the display is 1, press the button with the same label you pressed in stage 3.
• If the display is 2, press the button in the same position you pressed in stage 3.
• If the display is 3, press the button with the same label you pressed in stage 2.
• If the display is 4, press the button with the same label you pressed in stage 3.
Stage 5
• If the display is 1, press the button with the same label you pressed in stage 4.
• If the display is 2, press the button in the same position you pressed in stage 1.
• If the display is 3, press the button with the same label you pressed in stage 3.

• If the display is 4, press the button with the same label you pressed in stage 1.`;

test('memory: the stage 2 picture — one light lit', () => {
  const r = locateMemory(readPng(new URL('./fixtures/memory_stage2.png', import.meta.url).pathname));
  assert.equal(r.labels.length, 4);
  assert.deepEqual(r.dots, { total: 5, lit: 1 });
});

test('memory: the same stage 2 picture taken twice is still stage 2', () => {
  const p = parseMemoryManual(GAME_MANUAL);
  assert.equal(p.count, 20);
  assert.deepEqual(p.unclear, []);
  // stage 1 on screen: display 1 → position 2
  const s1 = solveMemoryStage(p, 1, 1, [2, 4, 1, 3], []);
  const shown1 = { ...s1, display: 1, key: '1|2413' };
  // the stage 2 picture (display 3, buttons 1 4 3 2, one light): stage 1 saved
  const h1 = stageAfterPicture([], shown1, '3|1432', 1);
  assert.deepEqual(h1, [{ pos: 2, label: 4, display: 1 }]);
  // the same drop handled a second time by an older handler, which still has stage 1 on screen
  const h2 = stageAfterPicture(h1, shown1, '3|1432', 1);
  assert.equal(h2, h1, 'not saved again');
  const r = solveMemoryStage(p, h2.length + 1, 3, [1, 4, 3, 2], h2);
  assert.deepEqual([r.pos, r.label], [3, 3]); // stage 2: label 3 — not stage 3's 2nd button (label 4)
  // a stage saved twice already: the lights take it back to stage 2
  assert.deepEqual(stageAfterPicture([h1[0], h1[0]], null, '3|1432', 1), h1);
});

test('memory: without the lights, a different picture means the answer was pressed', () => {
  const shown = { pos: 2, label: 4, display: 1, key: '1|2413' };
  assert.equal(stageAfterPicture([], shown, '3|1432', null).length, 1);
  assert.equal(stageAfterPicture([], shown, '1|2413', null).length, 0);
  assert.equal(stageAfterPicture([], null, '3|1432', 1).length, 0, 'nothing answered on screen: nothing to save');
});
