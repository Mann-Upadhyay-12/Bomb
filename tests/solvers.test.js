// Known-answer tests for the pure (no DOM, no image) solvers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMorseRLE, MORSE_TABLE, MORSE_FREQUENCIES } from '../src/modules/morse/morseDecoder.js';
import { evaluateExpression, parseManualText } from '../src/modules/logic/logicSolver.js';
import { toFen, parseFen } from '../src/modules/chess/chessEngine.js';
import { filterPasswordCandidates, MASTER_PASSWORDS } from '../src/modules/password/passwordSolver.js';
import { solveWordSearch } from '../src/modules/search/searchSolver.js';
import { parseSimonRules, SIMON_DEFAULT_RULES } from '../src/modules/simons/simonsSolver.js';
import { searchCube } from '../src/modules/cube/cubeSolver.js';

// ── Morse ──────────────────────────────────────────────────────────────────
const CODE = Object.fromEntries(Object.entries(MORSE_TABLE).map(([code, ch]) => [ch, code]));

// Standard timing: dot 1 unit, dash 3, gap inside a letter 1, between letters 3.
function transmit(word, unit = 120) {
  const rle = [];
  [...word].forEach((ch, i) => {
    if (i) rle.push({ is_on: false, duration: 3 * unit });
    [...CODE[ch]].forEach((sym, j) => {
      if (j) rle.push({ is_on: false, duration: unit });
      rle.push({ is_on: true, duration: sym === '-' ? 3 * unit : unit });
    });
  });
  return rle;
}

test('morse: every word in the frequency table decodes to its frequency', () => {
  for (const [word, freq] of Object.entries(MORSE_FREQUENCIES)) {
    const out = decodeMorseRLE(transmit(word));
    assert.equal(out.word, word);
    assert.equal(out.frequency, freq);
  }
});

test('morse: a capture that starts mid-word is rotated back to the word', () => {
  for (const [word, freq] of Object.entries(MORSE_FREQUENCIES)) {
    for (let k = 1; k < word.length; k++) {
      const rotated = word.slice(k) + word.slice(0, k);
      if (MORSE_FREQUENCIES[rotated]) continue;
      const out = decodeMorseRLE(transmit(rotated));
      assert.equal(out.frequency, freq, `${rotated} should resolve to ${word}`);
      assert.equal(out.word, word);
    }
  }
});

test('morse: timing jitter of 20% does not change the result', () => {
  const rle = transmit('STROBE', 100).map((seg, i) => ({ ...seg, duration: seg.duration * (i % 2 ? 1.2 : 0.85) }));
  // The decoder takes the shortest "on" as its unit, so keep one exact dot.
  rle.find(seg => seg.is_on && seg.duration < 150).duration = 85;
  assert.equal(decodeMorseRLE(rle).word, 'STROBE');
});

test('morse: no signal', () => {
  assert.deepEqual(decodeMorseRLE([]), { letters: [], unit: 100 });
  assert.deepEqual(decodeMorseRLE([{ is_on: false, duration: 500 }]), { letters: [], unit: 100 });
});

// ── Logic ──────────────────────────────────────────────────────────────────
test('logic: operator precedence is NOT > AND > OR > IMPLIES, implication is right-associative', () => {
  const v = { P: true, Q: false, R: true, S: false, T: true };
  const ev = src => evaluateExpression(src, {}, v);
  assert.equal(ev('P ^ Q V R'), true);          // (P ^ Q) V R
  assert.equal(ev('P ^ (Q V S)'), false);
  assert.equal(ev('¬Q ^ P'), true);             // (¬Q) ^ P
  assert.equal(ev('¬(Q V P)'), false);
  assert.equal(ev('P → Q'), false);
  assert.equal(ev('Q → S'), true);
  assert.equal(ev('P → Q → S'), true);          // P → (Q → S); left-assoc would be false → S = true too
  assert.equal(ev('Q → P → S'), true);          // Q → (P → S) = true; (Q → P) → S would be false
  assert.equal(ev('¬¬P'), true);
});

test('logic: ASCII spellings of the operators', () => {
  const v = { P: true, Q: false };
  assert.equal(evaluateExpression('p & !q', {}, v), true);
  assert.equal(evaluateExpression('p | q', {}, v), true);
  assert.equal(evaluateExpression('p -> q', {}, v), false);
  assert.equal(evaluateExpression('~p => q', {}, v), true);
});

test('logic: all 32 assignments of a five-variable formula match a direct evaluation', () => {
  const src = '(P ^ ¬Q) V (R → (S ^ T))';
  for (let m = 0; m < 32; m++) {
    const [P, Q, R, S, T] = [0, 1, 2, 3, 4].map(i => Boolean(m >> i & 1));
    assert.equal(evaluateExpression(src, {}, { P, Q, R, S, T }), (P && !Q) || (!R || (S && T)), `assignment ${m}`);
  }
});

test('logic: stage results feed later stages; errors are reported', () => {
  assert.equal(evaluateExpression('α ^ P', { 'α': true }, { P: true }), true);
  assert.throws(() => evaluateExpression('β V P', { 'α': true }, { P: false }), /not solved yet/);
  assert.throws(() => evaluateExpression('(P ^ Q', {}, { P: true, Q: true }), /missing \)/);
  assert.throws(() => evaluateExpression('P ^', {}, { P: true }), /incomplete/);
  assert.throws(() => evaluateExpression('', {}, {}), /empty/);
  assert.throws(() => evaluateExpression('P Q', {}, { P: true, Q: true }), /unexpected/);
});

test('logic: manual text parsing', () => {
  assert.deepEqual(parseManualText('P = TRUE, q: false\nR=1 S = F  T:T'), { P: true, Q: false, R: true, S: false, T: true });
});

// ── Chess FEN ──────────────────────────────────────────────────────────────
test('chess: board to FEN and back', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const parsed = parseFen(start + ' w KQkq - 0 1');
  assert.equal(toFen(parsed.merged), start + ' w - - 0 1');
  assert.equal(parsed.white.filter(Boolean).length, 16);
  assert.equal(parsed.black.filter(Boolean).length, 16);
  assert.equal(parsed.merged[0], 'r');   // a8
  assert.equal(parsed.merged[60], 'K');  // e1

  const sparse = '8/3k4/8/2Q5/8/8/5K2/7r';
  assert.equal(toFen(parseFen(sparse).merged), sparse + ' w - - 0 1');
  assert.equal(parseFen('not a fen'), null);
  assert.equal(parseFen(''), null);
});

// ── Password ───────────────────────────────────────────────────────────────
test('password: only words whose every letter is available in its column survive', () => {
  // Columns offer exactly the letters of WATER and WORLD, column by column.
  const out = filterPasswordCandidates(['WATER', 'WORLD'], MASTER_PASSWORDS.join(' '));
  assert.deepEqual(out.matches.sort(), ['WATER', 'WORLD']);
  assert.equal(filterPasswordCandidates([], MASTER_PASSWORDS.join(' ')).matches.length, 0);
  assert.deepEqual(filterPasswordCandidates(['ab1ou-t'], 'about, there').matches, ['ABOUT']);
});

// ── Word search ────────────────────────────────────────────────────────────
test('word search: finds words in all eight directions and nothing else', () => {
  const grid = ['CATXX', 'XOXXG', 'XXWOX', 'XXDXX', 'XXXXX'].map(r => r.split(''));
  const out = solveWordSearch(grid, 'CAT TAC COW DOG GOD BIRD');
  assert.deepEqual(out.uniqueWords.sort(), ['CAT', 'COW', 'DOG', 'GOD', 'TAC']);
  assert.deepEqual(out.foundMatches.find(m => m.word === 'DOG').path, [[3, 2], [2, 3], [1, 4]]);
  assert.deepEqual(out.foundMatches.find(m => m.word === 'CAT').path, [[0, 0], [0, 1], [0, 2]]);
  assert.equal(out.hitCells.has('2_2'), true);
  assert.equal(out.hitCells.has('4_4'), false);
});

// ── Simon ──────────────────────────────────────────────────────────────────
test('simon: default rules parse; incomplete rules are rejected', () => {
  assert.deepEqual(parseSimonRules(SIMON_DEFAULT_RULES), {
    even: { R: 'R', B: 'G', Y: 'Y', G: 'B' },
    odd: { R: 'G', B: 'R', Y: 'B', G: 'Y' },
  });
  assert.equal(parseSimonRules('Even number of modules disarmed\n* If red flashes, press red.'), null);
});

// ── Rubik's cube ───────────────────────────────────────────────────────────
// Sticker order: U, R, F faces, each row by row. Colours: U white, R red,
// F green, D yellow, L orange, B blue. The scrambles below are written out by
// hand from the standard move definitions, independently of the solver.
const face = s => s.replace(/\s/g, '').split('');
test('cube: solved cube needs no moves', async () => {
  const out = await searchCube(face('WWWWWWWWW RRRRRRRRR GGGGGGGGG'), 6);
  assert.equal(out.len, 0);
});

test('cube: one quarter turn is undone by its inverse', async () => {
  // After U: the top row of F shows R's colour, the top row of R shows B's.
  const afterU = await searchCube(face('WWWWWWWWW BBBRRRRRR RRRGGGGGG'), 6);
  assert.equal(afterU.len, 1);
  assert.ok(afterU.sols.includes("U'"), `got ${afterU.sols}`);
  // After R: the right column of U shows F's colour, the right column of F shows D's.
  const afterR = await searchCube(face('WWGWWGWWG RRRRRRRRR GGYGGYGGY'), 6);
  assert.equal(afterR.len, 1);
  assert.ok(afterR.sols.includes("R'"), `got ${afterR.sols}`);
});

test('cube: partially observed stickers still give a shortest solution', async () => {
  const obs = face('WWGWWGWWG RRRRRRRRR GGYGGYGGY');
  for (const hidden of [0, 4, 9, 13, 18, 22]) obs[hidden] = '';
  const out = await searchCube(obs, 6);
  assert.equal(out.len, 1);
  assert.ok(out.sols.includes("R'"));
});
