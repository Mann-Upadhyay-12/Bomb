import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readWireBoard, readWireTable, classifyWirePicture } from '../src/modules/wireplace/wireplaceVision.js';
import { solveWirePlacement, SAMPLE_TABLE, SAMPLE_WIRES } from '../src/modules/wireplace/wireplaceSolver.js';

const BOARD = readPng(new URL('./fixtures/wireplace_module.png', import.meta.url));
const TABLE = readPng(new URL('./fixtures/wireplace_table.png', import.meta.url));

test('wire placement: the module picture reads all 8 wires with their ends', () => {
  const b = readWireBoard(BOARD);
  assert.ok(b.ok, b.reason);
  assert.deepEqual(b.wires.map(w => `${w.color} ${w.a}-${w.b}`), [
    'yellow A1-A2', 'black B1-B2', 'yellow C1-D1', 'blue C2-D2', 'white A3-B3', 'blue C3-D3', 'yellow A4-B4', 'blue C4-D4'
  ]);
});

test('wire placement: the table picture reads every badge colour and cell code', () => {
  const t = readWireTable(TABLE);
  assert.ok(t.ok, t.reason);
  assert.deepEqual(t.columns, SAMPLE_TABLE.columns);
  assert.deepEqual(t.rows, SAMPLE_TABLE.rows);
  assert.deepEqual(t.unsure, []);
});

test('wire placement: each picture is told apart', () => {
  assert.equal(classifyWirePicture(BOARD).type, 'board');
  assert.equal(classifyWirePicture(TABLE).type, 'table');
});

test('wire placement: C3 is blue → blue column → only the yellow A1-A2 wire is cut', () => {
  const r = solveWirePlacement(SAMPLE_TABLE, SAMPLE_WIRES);
  assert.ok(r.ready);
  assert.equal(r.c3.color, 'blue');
  assert.equal(r.column, 1);
  assert.equal(r.copy, 'A1-A2 Yellow');
  // row 7 (Yellow, A1) is the match
  assert.deepEqual(r.verdicts.filter(v => v.cut).map(v => v.rows), [[6]]);
});

test('wire placement: either end counts, colour must match, and no C3 wire is reported', () => {
  const table = { columns: ['red'], rows: [{ color: 'yellow', cells: ['B2'] }, { color: 'blue', cells: ['A1'] }] };
  const wires = [{ color: 'red', a: 'C3', b: 'C4' }, { color: 'yellow', a: 'A2', b: 'B2' }, { color: 'yellow', a: 'A1', b: 'B1' }];
  const r = solveWirePlacement(table, wires);
  assert.equal(r.copy, 'A2-B2 Yellow'); // B2 is its second end; the A1 row wants a blue wire
  assert.equal(solveWirePlacement(table, [{ color: 'red', a: 'A1', b: 'B1' }]).ready, false);
  assert.equal(solveWirePlacement(table, [{ color: 'red', a: 'C3', b: 'D3' }]).copy, 'NONE');
});

test('wire placement: a Discord phone screenshot with the module in it, and a second table', () => {
  const shot = readPng(new URL('./fixtures/wireplace_discord.png', import.meta.url));
  const table = readPng(new URL('./fixtures/wireplace_table2.png', import.meta.url));
  const b = readWireBoard(shot);
  assert.ok(b.ok, b.reason);
  // the same wires the screenshot's "Cut …" buttons name
  assert.deepEqual(b.wires.map(w => `${w.color} ${w.a}-${w.b}`), [
    'yellow A1-A2', 'red B1-C1', 'white D1-D2', 'yellow B2-C2', 'black A3-B3', 'red C3-D3', 'yellow A4-B4', 'blue C4-D4'
  ]);
  assert.equal(classifyWirePicture(shot).type, 'board');
  const t = readWireTable(table);
  assert.ok(t.ok);
  assert.deepEqual(t.unsure, []);
  assert.deepEqual(t.rows.map(r => r.color), ['red', 'yellow', 'black', 'white', 'blue', 'white', 'white', 'white', 'blue', 'black']);
  // C3 is red → red column: Yellow·A1 cuts A1-A2, White·D1 cuts D1-D2
  const r = solveWirePlacement(t, b.wires);
  assert.ok(r.ready);
  assert.equal(r.c3.color, 'red');
  assert.deepEqual(r.verdicts.filter(v => v.cut).map(v => v.wire.a + '-' + v.wire.b), ['A1-A2', 'D1-D2']);
  assert.equal(r.copy, 'A1-A2 Yellow, D1-D2 White');
});
