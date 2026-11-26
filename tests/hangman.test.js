// Hangman: every letter guess costs a body part, so the plan minimises letters needed in the worst case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HANGMAN_DEFAULT_WORDS, parseHangmanWords, looksLikeHangmanList, candidates, bestGuess, outcomes, revealed, positionsOf
} from '../src/modules/hangman/hangmanSolver.js';

const PASTED = `Mann D.Fool [DAWN], Role icon, ᝰ Fih~ — 12:40 PM
On the subject of Hangman
The hidden word is one of the words below. The Defuser can guess letters one at a time. To learn more, click here.

Words
SPEAKING CRANKING STICKING SLASHING BATTERED
FLASHING WOUNDING RUMBLING CREAKING CLICKING
FREAKING MATTERED CLANKING FLICKING MUMBLING
SMASHING BREAKING FUMBLING CRASHING SNEAKING
PATTERED TATTERED BUMBLING TRICKING BLANKING`;

test('hangman: the pasted Discord manual gives exactly the 25 words', () => {
  const w = parseHangmanWords(PASTED);
  assert.equal(w.length, 25);
  assert.deepEqual(w, parseHangmanWords(HANGMAN_DEFAULT_WORDS));
  assert.ok(!w.includes('DAWN') && !w.includes('PM'));
  assert.equal(looksLikeHangmanList(PASTED), true);
  assert.equal(looksLikeHangmanList(HANGMAN_DEFAULT_WORDS), true);
  assert.equal(looksLikeHangmanList('ABOUT AFTER AGAIN BELOW COULD EVERY FIRST FOUND GREAT HOUSE'), false); // a Password list
});

test('hangman: guesses filter by exact positions (a letter can appear twice)', () => {
  const w = parseHangmanWords(HANGMAN_DEFAULT_WORDS);
  assert.deepEqual(positionsOf('MUMBLING', 'M'), [0, 2]);
  assert.deepEqual(candidates(w, [{ letter: 'M', positions: [2] }]).sort(), ['BUMBLING', 'FUMBLING', 'RUMBLING']);
  assert.deepEqual(candidates(w, [{ letter: 'M', positions: [0, 2] }]), ['MUMBLING']);
  assert.equal(candidates(w, [{ letter: 'Z', positions: [] }]).length, 25);
  assert.deepEqual(revealed(8, [{ letter: 'T', positions: [2, 3] }, { letter: 'D', positions: [7] }]).join(''), '__TT___D');
  assert.equal(outcomes(w, 'R').reduce((a, g) => a + g.words.length, 0), 25);
});

test('hangman: the plan finds every word within 4 letter guesses (optimal for this list)', () => {
  const w = parseHangmanWords(HANGMAN_DEFAULT_WORDS);
  const memo = new Map();
  const first = bestGuess(w, memo);
  assert.equal(first.worst, 4); // B/M/P/TATTERED differ only in the first letter: 3 guesses inside, 1 to get there
  for (const word of w) {
    const g = [];
    let c = w;
    while (c.length > 1) {
      const b = bestGuess(c, memo);
      g.push({ letter: b.letter, positions: positionsOf(word, b.letter) });
      c = candidates(w, g);
    }
    assert.deepEqual(c, [word]);
    assert.ok(g.length <= 4, `${word} took ${g.length}`);
  }
  assert.ok(first.average < 3.5);
});

// ── Screenshots: each one comes after a guess ────────────────────────────────────────────────────
import { readPng } from './pngDecode.js';
import { readHangman, glyphScore, decodeGlyph, SEED_GLYPHS, GLYPH_W, GLYPH_H } from '../src/modules/hangman/hangmanVision.js';
import { applyShot, shapeBook, learnShapes } from '../src/modules/hangman/hangmanShot.js';

const WORDS = parseHangmanWords(HANGMAN_DEFAULT_WORDS);
const shotOf = (name) => { const i = readPng(new URL(`./fixtures/${name}`, import.meta.url)); return readHangman(i.data, i.width, i.height); };
// a made-up letter shape (each letter its own pattern, unlike any real one)
const fakeGlyph = (seed) => Float32Array.from({ length: GLYPH_W * GLYPH_H }, (_, k) => ((k * 7 + seed * 13) % 5 === 0 ? 1 : 0));
const fake = (length, letters, ink) => ({
  ok: true, length,
  slots: Array.from({ length }, (_, i) => ({ filled: Boolean(letters[i]), glyph: letters[i] || null })),
  figure: { ink, headOnly: ink > 0 && ink < 600 }
});

test('hangman screenshots: blanks, filled blanks and the stick figure are read', () => {
  const empty = shotOf('hangman_empty_8.png');
  assert.equal(empty.length, 8);
  assert.ok(empty.slots.every(s => !s.filled));
  assert.equal(empty.figure.ink, 0);
  const t = shotOf('hangman_t3_9.png');
  assert.equal(t.length, 9);
  assert.deepEqual(t.slots.map(s => s.filled), [false, false, true, false, false, false, false, false, false]);
  assert.equal(t.figure.headOnly, true);
  assert.ok(glyphScore(t.slots[2].glyph, decodeGlyph(SEED_GLYPHS.T)) > 0.99);
});

test('hangman screenshots: the 9-blank bomb — T in blank 3 is recognised by its shape', () => {
  const r = applyShot({ words: WORDS, guesses: [], length: null, prev: null, pending: null, book: shapeBook({}) }, shotOf('hangman_t3_9.png'));
  assert.equal(r.length, 9);
  assert.deepEqual(r.guesses, [{ letter: 'T', positions: [2] }]);
  assert.equal(r.events[0].how, 'shape');
  assert.ok(!r.events.some(e => e.type === 'started'), 'head only + one letter: nothing was missed');
  assert.equal(candidates(WORDS, r.guesses, 9).length, 0); // this game's list has only 8-letter words
});

test('hangman screenshots: guess → screenshot → next guess, to the word (BATTERED and MATTERED)', () => {
  const book = shapeBook({});
  const R = fakeGlyph(1), B = fakeGlyph(2);
  // empty board first
  let st = { words: WORDS, guesses: [], length: null, prev: null, pending: null, book };
  let r = applyShot(st, fake(8, [], 0));
  assert.equal(r.length, 8);
  assert.deepEqual(r.guesses, []);
  st = { ...st, guesses: r.guesses, length: r.length, prev: { ink: 0 } };
  // the app says R; BATTERED has R in blank 6 → that blank fills, the head is drawn
  assert.equal(bestGuess(WORDS).letter, 'R');
  r = applyShot({ ...st, pending: 'R' }, fake(8, { 5: R }, 492));
  assert.deepEqual(r.guesses, [{ letter: 'R', positions: [5] }]);
  assert.equal(r.events[0].how, 'guess');
  st = { ...st, guesses: r.guesses, prev: { ink: 492 } };
  const next = bestGuess(candidates(WORDS, st.guesses, 8));
  assert.equal(next.letter, 'B');
  // BATTERED: B shows in blank 1 → only one word left
  const hit = applyShot({ ...st, pending: 'B' }, fake(8, { 5: R, 0: B }, 700));
  assert.deepEqual(candidates(WORDS, hit.guesses, 8), ['BATTERED']);
  // MATTERED instead: nothing new, but the figure grew → B missed
  const miss = applyShot({ ...st, pending: 'B' }, fake(8, { 5: R }, 700));
  assert.deepEqual(miss.events.map(e => e.type), ['miss']);
  assert.deepEqual(miss.guesses.at(-1), { letter: 'B', positions: [] });
  // the same picture dropped twice changes nothing
  const same = applyShot({ ...st, pending: 'B' }, fake(8, { 5: R }, 492));
  assert.deepEqual(same.events.map(e => e.type), ['same']);
  assert.equal(same.guesses.length, 1);
});

test('hangman screenshots: a known shape beats the suggested letter; unknown shapes ask; new bomb resets', () => {
  const book = shapeBook({});
  const T = decodeGlyph(SEED_GLYPHS.T);
  const st = { words: WORDS, guesses: [{ letter: 'R', positions: [5] }], length: 8, prev: { ink: 492 }, book };
  // the app said B but the defuser typed T: TATTERED shows T in blanks 1, 3, 4
  const r = applyShot({ ...st, pending: 'B' }, fake(8, { 5: fakeGlyph(1), 0: T, 2: T, 3: T }, 700));
  assert.deepEqual(r.guesses.at(-1), { letter: 'T', positions: [0, 2, 3] });
  assert.deepEqual(candidates(WORDS, r.guesses, 8), ['TATTERED']);
  // no suggestion and an unknown shape in a place several letters could be → ask, with those letters
  const ask = applyShot({ ...st, pending: null }, fake(8, { 5: fakeGlyph(1), 0: fakeGlyph(9) }, 700));
  assert.equal(ask.unresolved.length, 1);
  assert.deepEqual(ask.unresolved[0].positions, [0]);
  assert.deepEqual(ask.unresolved[0].options, ['B', 'M', 'P']); // TATTERED would show T in 3 blanks
  // 9 blanks after an 8-blank bomb: a new bomb, guesses start over
  const nb = applyShot({ ...st, pending: 'B' }, fake(9, {}, 0));
  assert.equal(nb.newBomb, true);
  assert.deepEqual(nb.guesses, []);
  // learned shapes: newest first, at most 6 per letter
  let saved = {};
  for (let k = 0; k < 8; k++) saved = learnShapes(saved, [{ letter: 'Q', glyph: fakeGlyph(k) }]);
  assert.equal(saved.Q.length, 6);
});

test('hangman screenshots: the first picture after a missed first guess (head only, no letter) records the miss', () => {
  const book = shapeBook({});
  // the list gives the length, so the app suggests R before any picture; R misses: head, no letter
  const st = { words: WORDS, guesses: [], length: 8, prev: null, pending: 'R', book };
  const r = applyShot(st, fake(8, {}, 492));
  assert.deepEqual(r.guesses, [{ letter: 'R', positions: [] }]);
  assert.deepEqual(r.events.map(e => e.type), ['miss'], 'no "figure already started" note either');
  assert.equal(r.unresolved.length, 0);
  // no suggestion to go on (a list with several lengths): it asks which letter missed, nothing else
  const ask = applyShot({ ...st, length: null, pending: null }, fake(8, {}, 492));
  assert.deepEqual(ask.guesses, []);
  assert.equal(ask.unresolved.length, 1);
  assert.deepEqual(ask.unresolved[0].positions, []);
  assert.deepEqual(ask.events, []);
  // the real start picture (gallows only) is still no guess at all
  const start = applyShot(st, shotOf('hangman_empty_8.png'));
  assert.deepEqual(start.guesses, []);
  assert.deepEqual(start.events, []);
  // more than the head: misses the app never saw, which it can't name → only the note
  const two = applyShot(st, fake(8, {}, 900));
  assert.deepEqual(two.guesses, []);
  assert.deepEqual(two.events.map(e => e.type), ['started']);
  // the miss already tapped in before the picture: nothing more is added
  const tapped = applyShot({ ...st, guesses: [{ letter: 'R', positions: [] }], pending: 'B' }, fake(8, {}, 492));
  assert.deepEqual(tapped.guesses, [{ letter: 'R', positions: [] }]);
  // the next bomb, whose first guess missed: the old guesses go and the miss is recorded
  const next = applyShot({ ...st, guesses: [{ letter: 'R', positions: [5] }, { letter: 'B', positions: [0] }], prev: { ink: 700 } }, fake(8, {}, 492));
  assert.equal(next.newBomb, true);
  assert.deepEqual(next.guesses, [{ letter: 'R', positions: [] }]);
});
