// Turning a new Hangman screenshot into guesses. Every screenshot comes after one more letter guess:
// blanks that just filled in are where that letter is; nothing new but a bigger stick figure = it
// missed, and so does a first picture showing just the head and no letter. Which letter was
// guessed: a shape seen before, else the letter the app suggested (or the one typed in), else the
// only letter the word list allows there — otherwise the user is asked.

import { candidates } from './hangmanSolver.js';
import { glyphScore, encodeGlyph, decodeGlyph, SEED_GLYPHS } from './hangmanVision.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SAME_SHAPE = 0.9;   // two blanks show the same letter (same letter renders almost identically)
const KNOWN_SHAPE = 0.93; // a blank shows a letter seen before (high, so E is never taken for a known F)
const PART_INK = 30;      // a new body part adds well over this many white pixels (440×440)

/** Saved shapes ({ letter: [encoded] }) + the built-in ones → { letter: [Float32Array] } */
export function shapeBook(saved) {
  const book = {};
  for (const [k, list] of Object.entries(SEED_GLYPHS)) book[k] = [decodeGlyph(list)];
  for (const [k, list] of Object.entries(saved || {})) {
    book[k] = (book[k] || []).concat((list || []).map(decodeGlyph));
  }
  return book;
}

/** Add newly identified shapes to the saved ones (at most 6 per letter). */
export function learnShapes(saved, learned) {
  const out = { ...(saved || {}) };
  for (const { letter, glyph } of learned) {
    if (!glyph) continue;
    out[letter] = [encodeGlyph(glyph), ...(out[letter] || [])].slice(0, 6);
  }
  return out;
}

function bestShape(glyph, book, skip) {
  let best = null, score = -1, second = -1;
  for (const [letter, list] of Object.entries(book)) {
    if (skip.has(letter)) continue;
    const s = Math.max(...list.map(g => glyphScore(glyph, g)));
    if (s > score) { second = score; score = s; best = letter; } else if (s > second) second = s;
  }
  return { letter: best, score, margin: score - second };
}

/**
 * state: { words, guesses: [{ letter, positions }], length: n|null, prev: { ink } | null,
 *          pending: letter the defuser was about to guess | null, book: shapeBook() }
 * shot:  readHangman() result
 * → { guesses, length, newBomb, events: [{ type: 'hit'|'miss'|'same'|'started', … }],
 *     unresolved: [{ positions, options, glyph }], learned: [{ letter, glyph }] }
 */
export function applyShot(state, shot) {
  const L = shot.length;
  const filled = shot.slots.map(s => s.filled);
  let guesses = state.guesses || [];
  const events = [], unresolved = [], learned = [];

  // a different bomb: other number of blanks, a letter we knew is gone, or a smaller stick figure
  const knownPos = guesses.flatMap(g => g.positions);
  const changed = state.length != null && (state.length !== L || knownPos.some(p => !filled[p])
    || (state.prev && shot.figure.ink + PART_INK < state.prev.ink));
  const newBomb = changed && (guesses.length > 0 || Boolean(state.prev));
  if (changed) guesses = [];
  const first = !state.prev || changed;

  const known = new Set(guesses.flatMap(g => g.positions));
  const fresh = filled.map((f, i) => (f && !known.has(i) ? i : -1)).filter(i => i >= 0);

  // blanks showing the same shape hold the same letter
  const groups = [];
  for (const i of fresh) {
    const g = shot.slots[i].glyph;
    const grp = groups.find(gr => glyphScore(gr.glyph, g) >= SAME_SHAPE);
    if (grp) grp.positions.push(i); else groups.push({ positions: [i], glyph: g });
  }

  let pendingUsed = false;
  for (const grp of groups) {
    const used = new Set(guesses.map(g => g.letter));
    const fits = X => !used.has(X) && candidates(state.words, [...guesses, { letter: X, positions: grp.positions }], L).length > 0;
    const listHasWords = candidates(state.words, guesses, L).length > 0;
    const shape = bestShape(grp.glyph, state.book || {}, used);
    let letter = null, how = '';
    const P = state.pending;
    if (shape.letter && shape.score >= KNOWN_SHAPE && shape.margin >= 0.08) {
      letter = shape.letter; how = 'shape';
    } else if (P && !pendingUsed && !used.has(P) && (!listHasWords || fits(P))) {
      const pShape = (state.book && state.book[P]) ? bestShape(grp.glyph, { [P]: state.book[P] }, new Set()).score : null;
      if (pShape === null || pShape >= 0.6) { letter = P; how = 'guess'; pendingUsed = true; }
    }
    if (!letter && listHasWords) {
      const options = [...LETTERS].filter(fits);
      if (options.length === 1) { letter = options[0]; how = 'list'; }
      else { unresolved.push({ positions: grp.positions, options, glyph: grp.glyph }); continue; }
    }
    if (!letter) { unresolved.push({ positions: grp.positions, options: [], glyph: grp.glyph }); continue; }
    guesses = [...guesses, { letter, positions: grp.positions.slice().sort((a, b) => a - b) }];
    learned.push({ letter, glyph: grp.glyph });
    events.push({ type: 'hit', letter, positions: grp.positions, how });
  }

  if (!groups.length) {
    const grew = state.prev && !changed && shot.figure.ink > state.prev.ink + PART_INK;
    // The first picture of a bomb, taken after its first guess: the drawing is just the head (one
    // guess so far) and no blank shows a letter, so that guess missed. With no picture before it
    // there was nothing to compare, and this used to record nothing (the miss had to be tapped in).
    const firstGuessMissed = first && !guesses.length && shot.figure.headOnly;
    if (grew || firstGuessMissed) {
      const used = new Set(guesses.map(g => g.letter));
      const P = state.pending;
      if (P && !used.has(P)) {
        guesses = [...guesses, { letter: P, positions: [] }];
        events.push({ type: 'miss', letter: P });
      } else {
        unresolved.push({ positions: [], options: [], glyph: null }); // a miss, letter unknown
      }
    } else if (!first) {
      events.push({ type: 'same' });
    }
  }
  // the first picture of a bomb can come after guesses the app never saw: a missed letter leaves no
  // trace but a body part, so say so unless the drawing is just the head for one letter showing
  // (a letter still to be named below is one of those guesses too)
  if (first && (changed || !(state.guesses || []).length) && shot.figure.ink > 0) {
    const seen = new Set(guesses.map(g => g.letter)).size + unresolved.length;
    if (!(shot.figure.headOnly && seen === 1)) events.push({ type: 'started' });
  }
  return { guesses, length: L, newBomb, events, unresolved, learned };
}
