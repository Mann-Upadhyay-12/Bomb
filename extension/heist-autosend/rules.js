// Heist auto-send — reading the puzzle's instruction from a screenshot of the Discord tab.
// No Discord page access: this works on pixels only, like reading the screen yourself.
//
// 1. findPanel(): the puzzle picture (Glass digits, Caesar letters) is a big white panel. The bottom-most one
//    on screen is the newest puzzle, and its instruction is the 2–3 lines of text right above it.
// 2. That strip is OCR'd (Tesseract, bundled in ocr/), ~0.15 s instead of 1–2 s for the whole screen.
// 3. parseInstruction() turns the sentence into what to copy.

/** Bottom-most white panel at least `minW` px wide: { x0, x1, top, bottom } or null. data = RGBA bytes. */
function findPanel(data, W, H, minW = 250) {
  const white = (x, y) => { const i = (y * W + x) * 4; return data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235; };
  const longestRun = y => {
    let best = [0, 0], s = -1;
    for (let x = 0; x <= W; x++) {
      if (x < W && white(x, y)) { if (s < 0) s = x; }
      else if (s >= 0) { if (x - s > best[1] - best[0]) best = [s, x]; s = -1; }
    }
    return best;
  };
  for (let y = H - 1; y > 0; y--) {
    const [x0, x1] = longestRun(y);
    if (x1 - x0 < minW) continue;
    // go up while most of the row is white (the black digits / letters inside the panel break single runs)
    const share = yy => { let n = 0; for (let x = x0; x < x1; x++) n += white(x, yy); return n / (x1 - x0); };
    let top = y;
    while (top > 0 && share(top - 1) > 0.6) top--;
    if (y - top < 40) { y = top; continue; } // a thin white strip (a line, a button), not a puzzle panel
    return { x0, x1, top, bottom: y };
  }
  return null;
}

/** The area to OCR: the text right above the panel (title + instruction), in screenshot pixels. */
function instructionRect(panel, W, scale = 1) {
  const x = Math.max(0, panel.x0 - Math.round(20 * scale));
  const y = Math.max(0, panel.top - Math.round(140 * scale));
  const w = Math.min(W - x, panel.x1 - panel.x0 + Math.round(40 * scale));
  const h = Math.max(1, panel.top - Math.round(6 * scale) - y);
  return { x, y, w, h };
}

const clean = t => String(t || '').replace(/\s+/g, ' ').trim();

/**
 * What the instruction asks for, or null if it isn't one of the rules we know.
 *   Glass:  "… Ignore odd-valued digits (…). Spell only the even-valued digits as words, from left to right."
 *           → { kind: 'words', key: 'evenLR' }   (keys match the app: normal/even/odd × LR/RL)
 *   Guard:  "Spell every displayed digit as a word, from left to right." → { kind: 'words', key: 'normalLR' }
 *   Caesar: "… shift every letter 5 to the right in the alphabet …" → { kind: 'caesar', shift: 5 }
 *   Sort:   "… sort the numbers Descending …" → { kind: 'sort', order: 'desc' }
 * The LAST match wins (newest text is lowest on screen).
 */
function parseInstruction(text) {
  const t = clean(text).toLowerCase();
  let out = null, m;
  // Digits → words: any "spell … digit(s) … left to right / right to left" sentence. Which digits: "only the
  // odd/even(-valued)" or "ignore odd/even(-valued)" (up to 120 characters before "spell"); otherwise all of them.
  const reSpell = /spell\s+([^.]{0,60}?)\bdigits?\b[\s\S]{0,60}?(left\s*to\s*right|right\s*to\s*left)/g;
  while ((m = reSpell.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 120), m.index);
    const only = m[1].match(/\b(odd|even)\b/);
    const ignore = before.match(/ignore\s+(?:all\s+|the\s+)*(odd|even)\b/);
    const parity = only ? only[1] : ignore ? (ignore[1] === 'odd' ? 'even' : 'odd') : 'normal';
    out = { kind: 'words', key: parity + (/right\s*to\s*left/.test(m[2]) ? 'RL' : 'LR'), at: m.index };
  }
  const reShift = /shift\s+every\s+letter\s+([0-9]{1,2}|[a-z]+)\s+(?:places?\s+|steps?\s+|letters?\s+)?to\s+the\s+(right|left)/g;
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  while ((m = reShift.exec(t))) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1]];
    if (n != null && (!out || m.index > out.at)) out = { kind: 'caesar', shift: m[2] === 'left' ? -n : n, at: m.index };
  }
  // Sort: "sort the numbers descending" / "in ascending order" / "from largest to smallest" …
  const reSort = /sort\s+(?:the\s+)?(?:numbers?|values?|digits?)?[^.]{0,30}?\b(ascending|descending|increasing|decreasing|(?:smallest|lowest|largest|highest|biggest)\s+(?:to|first))/g;
  while ((m = reSort.exec(t))) {
    const w = m[1];
    const desc = /^(descending|decreasing|largest|highest|biggest)/.test(w);
    if (!out || m.index > out.at) out = { kind: 'sort', order: desc ? 'desc' : 'asc', at: m.index };
  }
  if (out) delete out.at;
  return out;
}

/** Who the instruction is for (shown in the notification only): the "@Name," it starts with, or ''. */
function mentionOf(text) {
  const t = clean(text);
  let m, who = '';
  const re = /@([^,@\n]{1,40}?)\s*,\s*(?:shift|shatter|decode|sort|spell|type|reply|ignore|enter|answer|read)/gi;
  while ((m = re.exec(t))) who = m[1].trim();
  return who;
}

const shiftLetters = (s, by) => [...String(s).toUpperCase().replace(/[^A-Z]/g, '')]
  .map(c => String.fromCharCode(65 + ((((c.charCodeAt(0) - 65 + by) % 26) + 26) % 26))).join('');

if (typeof module !== 'undefined') module.exports = { findPanel, instructionRect, parseInstruction, mentionOf, shiftLetters };
