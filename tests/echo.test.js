import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { SAMPLE_PAIRS, parseEchoPairs, lookupEcho } from '../src/modules/echo/echoSolver.js';
import { locateEchoWord } from '../src/modules/echo/echoVision.js';

test('echo: the list in any separator', () => {
  const p = parseEchoPairs('**COYLY** → **CHACE**, HABIT -> PLONK; FJORD: MIRTH\n1. ALPHA = BRAVO\nDELTA\tECHO\nfoo to bar | baz - qux');
  assert.deepEqual(p.pairs.map(x => `${x.from}>${x.to}`), ['COYLY>CHACE', 'HABIT>PLONK', 'FJORD>MIRTH', 'ALPHA>BRAVO', 'DELTA>ECHO', 'FOO>BAR', 'BAZ>QUX']);
});

test('echo: only the left side is looked up; a misread word is taken only when clearly closest', () => {
  const p = parseEchoPairs(SAMPLE_PAIRS);
  assert.equal(lookupEcho(p, 'coyly').to, 'CHACE'); // the guide's example
  assert.equal(lookupEcho(p, 'HABIT').to, 'PLONK');
  assert.equal(lookupEcho(p, 'PLONK').to, 'TAWNY'); // a right-hand word that is also a left-hand one
  const off = lookupEcho(p, 'CONCA');
  assert.deepEqual([off.to, off.exact], ['BRISK', false]);
  const right = lookupEcho(p, 'CHACE'); // only ever on the right
  assert.equal(right.to, undefined);
  assert.equal(right.onRight, 'COYLY');
  assert.equal(lookupEcho(p, 'ZZZZZ').to, undefined);
});

test('echo: the picture — the word box (board crop)', () => {
  const r = locateEchoWord(readPng(new URL('./fixtures/echo_boardcrop.png', import.meta.url).pathname));
  assert.equal(r.letters, 5); // C O N G A
});
