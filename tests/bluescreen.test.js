import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { parseCrashMessage, solveBluescreen, countableModules, moduleLabel, ordinal, SAMPLE_MESSAGE } from '../src/modules/bluescreen/bluescreenSolver.js';
import { locateErrorNumber } from '../src/modules/bluescreen/bluescreenVision.js';

test('bluescreen: the crash message gives the error number and both counts', () => {
  assert.deepEqual(parseCrashMessage(SAMPLE_MESSAGE), { error: '8136', disarmed: 1, armed: 7, serial: null });
  // other wordings of the same facts
  assert.deepEqual(parseCrashMessage('**Error number:** 4021 — Disarmed: 3, Armed: 2'), { error: '4021', disarmed: 3, armed: 2, serial: null });
  assert.deepEqual(parseCrashMessage('error 0507. 7 armed modules and 4 disarmed modules. Serial: ab3c7'), { error: '0507', disarmed: 4, armed: 7, serial: 'AB3C7' });
});

test('bluescreen: every true rule, top to bottom', () => {
  // 8+1+3+6 = 18; 4 armed (even) +8; vowel +4; last digit 7 odd −2; 5 disarmed > 4 armed +3 → 31
  const r = solveBluescreen({ error: '8136', armed: 4, disarmed: 5, serial: 'AB3C7' });
  assert.equal(r.total, 31);
  assert.equal(r.position, 1); // 31 counted over 5 disarmed: 6 rounds and 1 more
  // 7 armed (odd) → − last digit; no vowel; even last digit; fewer disarmed
  const s = solveBluescreen({ error: '8136', armed: 7, disarmed: 3, serial: 'XYZ8' });
  assert.equal(s.total, 18 - 6);
  assert.equal(s.position, 3); // 12 over 3 → the 3rd
  assert.deepEqual(s.steps.map(x => x.applies), [true, true, false, false, false]);
});

test('bluescreen: a total of 0 or below gets the disarmed count added until it is above 0', () => {
  // 0+0+0+1 = 1; 3 armed → −1 = 0; no vowel; 7 odd → −2 = −2; 4 > 3 → +0 = −2; +4 → 2
  const r = solveBluescreen({ error: '0001', armed: 3, disarmed: 4, serial: 'XYZ7' });
  assert.equal(r.total, -2);
  assert.equal(r.count, 2);
  assert.equal(r.wraps, 1);
  assert.equal(r.position, 2);
  // exactly 0 also wraps
  const z = solveBluescreen({ error: '1001', armed: 2, disarmed: 3, serial: 'XYZ3' }); // 2 + 1 − 2 + 0 = 1 … not 0
  assert.equal(z.total, 1);
  const zero = solveBluescreen({ error: '1010', armed: 3, disarmed: 2, serial: 'XYZ1' }); // 2 − 0 − 2 = 0, 2 ≤ 3
  assert.equal(zero.total, 0);
  assert.equal(zero.count, 2);
  assert.equal(zero.position, 2);
});

test('bluescreen: with one disarmed module the answer needs nothing else (the 8136 sample)', () => {
  const r = solveBluescreen({ error: '8136', armed: 7, disarmed: 1, serial: '' });
  assert.equal(r.ok, true);
  assert.equal(r.position, 1);
  assert.equal(r.onlyOne, true);
  assert.deepEqual(r.missing, ['serial']);
  const none = solveBluescreen({ error: '8136', armed: 7, disarmed: 0, serial: 'AB12' });
  assert.equal(none.ok, false);
  assert.equal(none.noneDisarmed, true);
  assert.equal(solveBluescreen({ error: '81', armed: 2, disarmed: 3, serial: 'AB12' }).ok, false);
});

test('bluescreen: board cards — needy ones left out, repeated names numbered', () => {
  const cards = countableModules(['Piano', 'Bluescreen', 'Breaker', 'Maze', 'Piano', '']);
  assert.deepEqual(cards.map(moduleLabel), ['Piano #1', 'Maze', 'Piano #2']);
  assert.deepEqual(cards.map(c => c.slot), [1, 4, 5]);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
});

test('bluescreen: the crash picture — four digits found right of the square code', () => {
  const r = locateErrorNumber(readPng(new URL('./fixtures/bluescreen_8136.png', import.meta.url).pathname));
  assert.deepEqual(r.panel, [30, 74, 409, 409]);
  assert.equal(r.glyphs.length, 4);
  assert.ok(r.box[0] > 150, 'starts right of the square code');
  // a picture with no blue screen says so
  const grey = { data: new Uint8ClampedArray(100 * 100 * 4).fill(60), width: 100, height: 100 };
  assert.ok(locateErrorNumber(grey).reason);
});
