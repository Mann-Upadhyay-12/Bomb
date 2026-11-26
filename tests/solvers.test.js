// Known-answer tests for the pure (no DOM, no image) solvers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMorseRLE, MORSE_TABLE, MORSE_FREQUENCIES } from '../src/modules/morse/morseDecoder.js';
import { evaluateExpression, parseManualText } from '../src/modules/logic/logicSolver.js';
import { toFen, parseFen, kingInCheck } from '../src/modules/chess/chessEngine.js';
import { filterPasswordCandidates, MASTER_PASSWORDS } from '../src/modules/password/passwordSolver.js';
import { solveWordSearch } from '../src/modules/search/searchSolver.js';
import { readPng } from './pngDecode.js';
import { simonPresses, simonRules, siReadManual, siAnalyzeFrames } from '../src/modules/simons/simonsSolver.js';
import { serialHasVowel, serialLastDigit, cleanSerial } from '../src/core/bombSerial.js';
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
// The manual table picture changes every game: read it, don't assume one
test('simon: manual table picture is read (two different games)', () => {
  const row = (t, v, p) => ['R', 'B', 'Y', 'G'].map(c => simonRules(t, v)[p][c]).join('');
  const a = readPng(new URL('./fixtures/simon_manual_a.png', import.meta.url));
  const ta = siReadManual(a.data, a.width, a.height);
  assert.equal(row(ta, false, 'odd'), 'RGYB');
  assert.equal(row(ta, false, 'even'), 'RYBG');
  assert.equal(row(ta, true, 'odd'), 'GBRY');
  assert.equal(row(ta, true, 'even'), 'GRBY');
  const b = readPng(new URL('./fixtures/simon_manual_b.png', import.meta.url));
  const tb = siReadManual(b.data, b.width, b.height);
  assert.equal(row(tb, false, 'odd'), 'BGYR');
  assert.equal(row(tb, false, 'even'), 'GRBY');
  assert.equal(row(tb, true, 'odd'), 'RGYB');
  assert.equal(row(tb, true, 'even'), 'GBYR');
  assert.deepEqual(simonPresses(tb, ['B', 'Y', 'G'], true, 'odd'), ['G', 'Y', 'B']);
  // the manual is not a module frame, and a module frame is not a manual
  assert.equal(siAnalyzeFrames([{ data: b.data }], b.width, b.height).notSimon, true);
});

test('bomb serial: vowel and last digit', () => {
  assert.equal(cleanSerial(' e1z-qg hv1 '), 'E1ZQGHV1');
  assert.equal(serialHasVowel('E1ZQGHV1'), true);
  assert.equal(serialHasVowel('B7XK29'), false);
  assert.equal(serialLastDigit('AB3C4X'), 4);
  assert.equal(serialLastDigit('ABCD'), null);
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

test('chess: side to move goes into the FEN; a side in check must be the one to move', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const p = parseFen(start).merged;
  assert.equal(toFen(p), start + ' w - - 0 1');
  assert.equal(toFen(p, 'b'), start + ' b - - 0 1');
  assert.equal(kingInCheck(p, 'w'), false);
  assert.equal(kingInCheck(p, 'b'), false);
  // rook on the open e-file checks the black king; a piece in between blocks it
  assert.equal(kingInCheck(parseFen('4k3/8/8/8/8/8/8/4RK2').merged, 'b'), true);
  assert.equal(kingInCheck(parseFen('4k3/4p3/8/8/8/8/8/4RK2').merged, 'b'), false);
  // pawn direction: a white pawn on d7 checks e8, a black pawn on d2 checks e1, not the other way round
  assert.equal(kingInCheck(parseFen('4k3/3P4/8/8/8/8/8/K7').merged, 'b'), true);
  assert.equal(kingInCheck(parseFen('k7/8/8/8/8/8/3p4/4K3').merged, 'w'), true);
  assert.equal(kingInCheck(parseFen('k7/8/8/8/8/8/8/3pK3').merged, 'w'), false);
  // knight, bishop (diagonal), queen
  assert.equal(kingInCheck(parseFen('4k3/8/5N2/8/8/8/8/K7').merged, 'b'), true);
  assert.equal(kingInCheck(parseFen('4k3/8/8/8/B7/8/8/K7').merged, 'b'), true);
  assert.equal(kingInCheck(parseFen('K7/8/8/8/8/8/8/q6k').merged, 'w'), true);
  // scholar's-mate sample: nobody in check before Qxf7
  const sample = parseFen('r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR').merged;
  assert.equal(kingInCheck(sample, 'b'), false);
  assert.equal(kingInCheck(sample, 'w'), false);
});
