// Hangman: the hidden word is one of the manual's words. Every letter guess, right or wrong, adds a
// body part, so the best letter is the one that narrows the list down fastest, not the most likely
// one. Once one word is left, guess the whole word (no body part needed).

// The list from the 2026-11-22 game's manual
export const HANGMAN_DEFAULT_WORDS = `SPEAKING CRANKING STICKING SLASHING BATTERED
FLASHING WOUNDING RUMBLING CREAKING CLICKING
FREAKING MATTERED CLANKING FLICKING MUMBLING
SMASHING BREAKING FUMBLING CRASHING SNEAKING
PATTERED TATTERED BUMBLING TRICKING BLANKING`;

/**
 * Manual text → the word list (upper case, no repeats). Text before a "Words" heading is skipped,
 * and only ALL-CAPS words count, so the manual's sentences and a pasted Discord name line drop out.
 */
export function parseHangmanWords(text) {
  let t = String(text || '');
  const head = t.match(/^\s*words\s*:?\s*$/im);
  if (head) t = t.slice(head.index + head[0].length);
  let words = t.match(/\b[A-Z]{3,}\b/g) || [];
  // a list typed in lower case: every word after the heading
  if (words.length < 5 && head) words = (t.match(/\b[a-zA-Z]{3,}\b/g) || []).map(w => w.toUpperCase());
  return [...new Set(words)];
}

/** Pasted text that is a Hangman manual / word list. */
export function looksLikeHangmanList(text) {
  const t = String(text || '');
  const words = parseHangmanWords(t);
  if (/hangman/i.test(t)) return words.length >= 5;
  // a bare list: 10+ capital words of one length (6+ letters, so a Password list of 5s is not taken)
  return words.length >= 10 && words.every(w => w.length === words[0].length) && words[0].length >= 6;
}

/** Positions (0-based) of `letter` in `word`. */
export const positionsOf = (word, letter) => {
  const out = [];
  for (let i = 0; i < word.length; i++) if (word[i] === letter) out.push(i);
  return out;
};

/** Words that agree with every guess so far: guesses = [{ letter, positions: [0-based] }]. */
export function candidates(words, guesses, length = null) {
  return words.filter(w => (length == null || w.length === length)
    && guesses.every(g => positionsOf(w, g.letter).join() === [...g.positions].sort((a, b) => a - b).join()));
}

/** What guessing `letter` can show: [{ positions, words }], "not in the word" last. */
export function outcomes(cands, letter) {
  const groups = new Map();
  for (const w of cands) {
    const k = positionsOf(w, letter).join();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  return [...groups.entries()]
    .map(([k, ws]) => ({ positions: k ? k.split(',').map(Number) : [], words: ws }))
    .sort((a, b) => (b.positions.length ? 1 : 0) - (a.positions.length ? 1 : 0) || b.words.length - a.words.length);
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// The search below splits word lists by every letter and looks lists up in its memo tens of
// thousands of times, so each word seen gets, once: its letters' positions as numbers (bit i =
// position i) and a two-character id. Comparing those numbers and keying a list by its ids is much
// faster than building position lists and joining words (it is the same split as outcomes()).
const wordInfo = new Map(); // word → { word, key, masks }
function infoOf(word) {
  let w = wordInfo.get(word);
  if (!w) {
    const masks = new Array(26).fill(0);
    for (let i = 0; i < word.length; i++) {
      const c = word.charCodeAt(i) - 65;
      if (c >= 0 && c < 26) masks[c] += 2 ** i; // each position once, so the sum is exact
    }
    const id = wordInfo.size;
    w = { word, key: String.fromCharCode(id & 0xFFFF, id >>> 16), masks };
    wordInfo.set(word, w);
  }
  return w;
}

/** The words split by where letter number `li` shows up in them (each group in list order); null if it doesn't split them. */
function splitBy(infos, li) {
  const first = infos[0].masks[li];
  let i = 1;
  while (i < infos.length && infos[i].masks[li] === first) i++;
  if (i === infos.length) return null;
  const byMask = new Map();
  for (const w of infos) {
    const k = w.masks[li];
    const g = byMask.get(k);
    if (g) g.push(w); else byMask.set(k, [w]);
  }
  return [...byMask.values()];
}

const NO_COST = { worst: 0, total: 0 };
const TWO_WORDS = { worst: 1, total: 2 }; // one more letter tells two words apart, 1 guess each

/** Letters still needed for a list of words: worst case and the sum over the words. */
function cost(infos, memo) {
  if (infos.length < 2) return NO_COST;
  if (infos.length === 2) {
    const a = infos[0].masks, b = infos[1].masks;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return TWO_WORDS;
    return NO_COST;
  }
  return search(infos, memo) || NO_COST;
}

/** The answer for 2+ words, memoised by the words in order. `groups` is worked out when read. */
function search(infos, memo) {
  let key = '';
  for (const w of infos) key += w.key;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;

  const options = [];
  for (let li = 0; li < LETTERS.length; li++) {
    const groups = splitBy(infos, li);
    if (groups) options.push({ li, groups });
  }
  if (!options.length) { memo.set(key, null); return null; } // words that can't be told apart

  let best = null;
  if (infos.length > 40) {
    // big list: biggest group first, then the sum of squares (how spread out the groups are)
    for (const o of options) {
      let big = 0, sq = 0;
      for (const g of o.groups) { big = Math.max(big, g.length); sq += g.length ** 2; }
      if (!best || big < best.big || (big === best.big && sq < best.sq)) best = { ...o, big, sq };
    }
    const sub = best.groups.map(g => cost(g, memo));
    best = { li: best.li, worst: 1 + Math.max(...sub.map(r => r.worst)), total: sub.reduce((a, r, i) => a + r.total + best.groups[i].length, 0) };
  } else {
    for (const o of options) {
      o.groups.sort((a, b) => b.length - a.length); // big groups first: a worse letter is dropped sooner
      let worst = 0, total = 0;
      for (const g of o.groups) {
        const r = cost(g, memo);
        worst = Math.max(worst, 1 + r.worst);
        total += g.length + r.total;
        if (best && worst > best.worst) break; // already worse
      }
      if (!best || worst < best.worst || (worst === best.worst && total < best.total)) best = { li: o.li, worst, total };
    }
  }
  const letter = LETTERS[best.li];
  let groups = null;
  const out = {
    letter, worst: best.worst, average: best.total / infos.length, total: best.total,
    get groups() { return groups || (groups = outcomes(infos.map(w => w.word), letter)); }
  };
  memo.set(key, out);
  return out;
}

/**
 * Best next letter for the words still possible. Minimises the worst case (letters needed before
 * only one word is left), then the average. Exact search for up to 40 words; above that the letter
 * that leaves the smallest biggest group is taken.
 * Returns null when 0 or 1 words are left, else { letter, worst, average, groups: [{ positions, words }] }.
 */
export function bestGuess(cands, memo = new Map()) {
  if (cands.length <= 1) return null;
  return search(cands.map(infoOf), memo);
}

/** A word board for display: '_' where unknown. */
export function revealed(length, guesses) {
  const out = Array(length).fill('_');
  for (const g of guesses) for (const p of g.positions) if (p < length) out[p] = g.letter;
  return out;
}
