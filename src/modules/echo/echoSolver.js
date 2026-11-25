// Echo: 10 stages. The Defuser's module shows one word; the Helper's list has directed pairs
// "shown word → word to enter". Only the left side is looked up (a right-hand word can also be a
// left-hand word of another pair; the reverse pairing means nothing). The list changes per game.

// From the guide's example (COYLY → CHACE, HABIT → PLONK); the rest are stand-ins.
export const SAMPLE_PAIRS = `COYLY → CHACE
HABIT → PLONK
CONGA → BRISK
PLONK → TAWNY
FJORD → MIRTH`;

const WORD = "[A-Za-z][A-Za-z'-]*";

/**
 * The pasted list → { pairs: [{ from, to }], map: Map(from → to), dupes: [from] }.
 * Takes "A → B", "A -> B", "A => B", "A - B", "A: B", "A = B", "A to B", "A B", several per line
 * (split by , ; |), and two-column tables.
 */
export function parseEchoPairs(text) {
  const pairs = [];
  const seen = new Map();
  const dupes = [];
  const add = (a, b) => {
    const from = a.toUpperCase(), to = b.toUpperCase();
    if (seen.has(from) && seen.get(from) !== to) dupes.push(from);
    if (!seen.has(from)) { seen.set(from, to); pairs.push({ from, to }); }
  };
  const sep = new RegExp(`(${WORD})\\s*(?:→|⟶|->|=>|—>|>|—|–|-|:|=|\\bto\\b|\\|)\\s*(${WORD})`, 'g');
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/[*_`#]/g, '').replace(/^\s*(?:[-•]\s+|\d+[.)]\s*)/, '').trim();
    if (!line) continue;
    let found = false;
    for (const part of line.split(/\s*[,;]\s*|\s{3,}|\t+(?=\S+\s*(?:→|->|:|=))/)) {
      sep.lastIndex = 0;
      let m;
      while ((m = sep.exec(part))) { add(m[1], m[2]); found = true; }
    }
    if (!found) {
      const words = line.split(/[\s\t]+/).filter(w => new RegExp(`^${WORD}$`).test(w));
      if (words.length === 2) add(words[0], words[1]);
    }
  }
  return { pairs, map: seen, dupes };
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/**
 * The shown word → { from, to, exact } or { near: [from] } / null.
 * A misread word (OCR, a typo) is taken only when one left-hand word is clearly closest:
 * 1 letter off for short words, 2 for 7+ letters, and the runner-up further away.
 */
export function lookupEcho(parsed, word) {
  const w = String(word || '').toUpperCase().replace(/[^A-Z'-]/g, '');
  if (!w || !parsed || !parsed.pairs.length) return null;
  if (parsed.map.has(w)) return { from: w, to: parsed.map.get(w), exact: true };
  const scored = parsed.pairs.map(p => ({ p, d: editDistance(w, p.from) })).sort((a, b) => a.d - b.d);
  const best = scored[0], next = scored[1];
  const limit = w.length >= 7 ? 2 : 1;
  if (best.d <= limit && (!next || next.d > best.d)) return { from: best.p.from, to: best.p.to, exact: false, distance: best.d };
  const right = parsed.pairs.find(p => p.to === w);
  return { near: scored.filter(s => s.d <= limit + 1).slice(0, 3).map(s => s.p.from), onRight: right ? right.from : null };
}
