// Pure Piano interval calculation and manual stage code table parsing

import { discordPlain } from '../../utils/discordText.js';
export const PN_STEPS = [0, 2, 4, 5, 7, 9, 11];
export const PN_LET = 'CDEFGAB';
export const PN_INT = [
  'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd',
  'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th',
  'Minor 7th', 'Major 7th', 'Octave'
];

export const PN_DEFAULT_CODES = "Minor 2nd 5.68  Major 2nd 6.99  Minor 3rd 2.33  Major 3rd 4.84  Perfect 4th 7.33  Tritone 8.69  Perfect 5th 5.44  Minor 6th 5.62  Major 6th 7.96  Minor 7th 8.05  Major 7th 6.13  Octave 3.98";

export function pnNote(clef, pos, acc) {
  const d = (clef === 'treble' ? 30 : 18) + pos;
  const l = ((d % 7) + 7) % 7;
  const o = Math.floor(d / 7);
  return {
    name: PN_LET[l] + (acc > 0 ? '♯' : acc < 0 ? '♭' : '') + o,
    semi: PN_STEPS[l] + 12 * o + acc
  };
}

/** The note as drawn, with its own sign: "G♯4", "A♮4", "A4" (nothing drawn). */
export function pnDrawnName(clef, pos, drawnAcc) {
  const n = pnNote(clef, pos, drawnAcc === PN_NATURAL ? 0 : drawnAcc || 0).name;
  return drawnAcc === PN_NATURAL ? n.replace(/(-?\d+)$/, '♮$1') : n;
}

// ── Key signature ────────────────────────────────────────────────────────────────────────────
// The bot names the key in its message ("Key Signature: F Major."); the staff picture doesn't draw
// it. A note drawn without its own ♯ / ♭ takes the key's: in F major every B is B♭.
const SHARP_ORDER = 'FCGDAEB', FLAT_ORDER = 'BEADGCF';
// major keys by number of sharps (+) / flats (−); a minor key uses its relative major's signature
const MAJOR_FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F♯': 6, 'C♯': 7, F: -1, 'B♭': -2, 'E♭': -3, 'A♭': -4, 'D♭': -5, 'G♭': -6, 'C♭': -7 };
const MINOR_FIFTHS = { A: 0, E: 1, B: 2, 'F♯': 3, 'C♯': 4, 'G♯': 5, 'D♯': 6, 'A♯': 7, D: -1, G: -2, C: -3, F: -4, 'B♭': -5, 'E♭': -6, 'A♭': -7 };

/** Every key the picker offers: { id: 'F Major', fifths: -1 } … (C major / A minor first: no ♯ / ♭). */
export const PN_KEYS = [
  ...Object.entries(MAJOR_FIFTHS).map(([k, f]) => ({ id: `${k} Major`, fifths: f })),
  ...Object.entries(MINOR_FIFTHS).map(([k, f]) => ({ id: `${k} Minor`, fifths: f }))
];

/** Letter → +1 / −1 for a key id ('F Major'), {} for none / C major. */
export function pnKeyAccidentals(keyId) {
  const k = PN_KEYS.find(x => x.id === keyId);
  const out = {};
  if (!k) return out;
  if (k.fifths > 0) for (const l of SHARP_ORDER.slice(0, k.fifths)) out[l] = 1;
  if (k.fifths < 0) for (const l of FLAT_ORDER.slice(0, -k.fifths)) out[l] = -1;
  return out;
}

/**
 * "…Key Signature: F Major." / "key: Bb minor" / just "E Major" (the words copied on their own)
 * → 'F Major' / 'B♭ Minor' / 'E Major'; null when no key is named.
 */
export function pnParseKey(text) {
  const t = String(text || '');
  const m = /key(?:\s*signature)?\s*[:\-]?\s*([A-G])\s*(#|♯|sharp|b|♭|flat)?\s*(major|minor|maj|min)\b/i.exec(t)
    // a bare key must be the whole text, so other pasted text never sets one by accident
    || /^\s*([A-G])\s*(#|♯|sharp|b|♭|flat)?\s*(major|minor|maj|min)\s*\.?\s*$/i.exec(t);
  if (!m) return null;
  const acc = !m[2] ? '' : /#|♯|sharp/i.test(m[2]) ? '♯' : '♭';
  const id = `${m[1].toUpperCase()}${acc} ${/^min/i.test(m[3]) ? 'Minor' : 'Major'}`;
  return PN_KEYS.some(k => k.id === id) ? id : null;
}

/**
 * What's typed / pasted into the key field: anything pnParseKey reads, or just the key note
 * ("E", "Bb", "F#") — taken as major, the bot's keys are "X Major".
 */
export function pnParseKeyField(text) {
  const k = pnParseKey(text);
  if (k) return k;
  const m = /^\s*([A-G])\s*(#|♯|sharp|b|♭|flat)?\s*\.?\s*$/i.exec(String(text || ''));
  if (!m) return null;
  const id = `${m[1].toUpperCase()}${!m[2] ? '' : /#|♯|sharp/i.test(m[2]) ? '♯' : '♭'} Major`;
  return PN_KEYS.some(x => x.id === id) ? id : null;
}

// A drawn ♮ is 'n' (not 0 = nothing drawn): it cancels the key signature for that note — in A♭ major a
// plain A is A♭, an A with ♮ is A.
export const PN_NATURAL = 'n';

/** The accidental a note sounds with: its own ♯ / ♭ / ♮ when drawn, else the key signature's. */
export function pnEffectiveAcc(clef, pos, drawnAcc, keyId) {
  if (drawnAcc === PN_NATURAL) return 0;
  if (drawnAcc) return drawnAcc;
  const letter = pnNote(clef, pos, 0).name[0];
  return pnKeyAccidentals(keyId)[letter] || 0;
}

// ── The interval ─────────────────────────────────────────────────────────────────────────────
// The answer is the distance between the two notes as drawn — no up / down (seen in games on 23 Nov:
// G♭2 then E2 → "Major 2nd", B♭2 then A♭3 → "Minor 7th", C♯3 then E2 → "Major 6th"). More than an
// octave reduces to the simple interval (the manual only names Minor 2nd … Octave).
const simple = n => (n === 0 ? 0 : n % 12 === 0 ? 12 : n % 12);
export function pnInterval(semi1, semi2) {
  const distance = Math.abs(semi2 - semi1);
  const st = simple(distance);
  return { st, name: PN_INT[st], distance, octaveDropped: distance > 12 };
}

export function pnParseCodes(t) {
  t = discordPlain(t); // a phone copies Discord's **markup** too
  const m = {};
  const re = /(Minor 2nd|Major 2nd|Minor 3rd|Major 3rd|Perfect 4th|Tritone|Perfect 5th|Minor 6th|Major 6th|Minor 7th|Major 7th|Octave)\s*`?\s*([\d.]+)/gi;
  let r;
  while ((r = re.exec(t))) {
    m[r[1].toLowerCase()] = r[2];
  }
  return m;
}
