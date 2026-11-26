// Bluescreen (needy): the screen crashes with a 4-digit error number; the Defuser must power cycle
// one module they already disarmed. The rules are the same every game (pasted 2026-11-23/25):
//   1. Start with the sum of the four digits.
//   2. Every true rule, top to bottom:
//      - armed modules even → + first digit, otherwise − last digit
//      - the serial has a vowel → + 4
//      - the serial's last digit is odd → − 2
//      - more disarmed than armed → + third digit
//   3. Count that many disarmed modules in reading order, skipping armed ones and wrapping after the
//      last; a total of 0 or below gets the number of disarmed modules added until it is above 0.
// Needy modules and the Timer are neither armed nor disarmed. Use the bomb as it was at the crash.
import { cleanSerial, serialHasVowel, serialLastDigit } from '../../core/bombSerial.js';

/** Modules that never count (needy: their light is green from the start). */
export const NEEDY_MODULES = new Set(['Bluescreen', 'Breaker']);

export const SAMPLE_MESSAGE = 'The screen crashed with error 8136.\nAt the crash: 1 disarmed and 7 armed modules (needy modules and the Timer do not count).\nOpen the module the Helpers name and press Power Cycle a minute ago, or the bomb detonates.';

const num = (s) => (s === undefined || s === null || s === '' ? null : Number(s));

/**
 * The bot's crash message → { error, disarmed, armed, serial } (null where it doesn't say).
 * Takes "error 8136" / "error number: 8136", "1 disarmed and 7 armed modules" or "Disarmed: 1".
 */
export function parseCrashMessage(text) {
  const t = String(text || '').replace(/[*_`]/g, '');
  const out = { error: null, disarmed: null, armed: null, serial: null };
  const err = t.match(/error(?:\s*(?:number|code|no\.?|#))?\s*[:#]?\s*(\d{4})\b/i) || t.match(/(?:^|[^\d])(\d{4})(?!\d)/);
  if (err) out.error = err[1];
  const dis = t.match(/(\d+)\s+disarmed/i) || t.match(/disarmed(?:\s+modules?)?\s*[:=]\s*(\d+)/i);
  if (dis) out.disarmed = Number(dis[1]);
  // "armed" on its own, not the end of "disarmed"
  const arm = t.match(/(\d+)\s+armed/i) || t.match(/(?:^|[^s])armed(?:\s+modules?)?\s*[:=]\s*(\d+)/i);
  if (arm) out.armed = Number(arm[1]);
  const ser = t.match(/serial(?:\s*number)?\s*[:=]?\s*([A-Z0-9]{4,})/i);
  if (ser) out.serial = cleanSerial(ser[1]);
  return out;
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/**
 * → { steps, total, count, position, missing, ok }
 * steps: [{ text, delta, applies }] — applies is true / false, or null when a fact is missing.
 * position: which disarmed module (1-based, in reading order) to power cycle, or null.
 * With one disarmed module the answer is that one, whatever else is missing.
 */
export function solveBluescreen({ error, armed, disarmed, serial }) {
  const digits = /^\d{4}$/.test(String(error || '')) ? String(error).split('').map(Number) : null;
  const A = Number.isInteger(num(armed)) && num(armed) >= 0 ? num(armed) : null;
  const D = Number.isInteger(num(disarmed)) && num(disarmed) >= 0 ? num(disarmed) : null;
  const ser = cleanSerial(serial);
  const lastSer = ser ? serialLastDigit(ser) : null;
  const missing = [];
  if (!digits) missing.push('error number');
  if (D === null) missing.push('disarmed count');
  if (A === null) missing.push('armed count');
  if (!ser) missing.push('serial');

  const steps = [];
  let total = digits ? digits.reduce((a, b) => a + b, 0) : null;
  steps.push({ text: digits ? `Sum of the digits ${digits.join(' + ')}` : 'Sum of the four digits', delta: total, applies: digits ? true : null, start: true });

  // a rule whose facts are known: delta is what it adds when it applies
  const add = (text, applies, delta) => {
    steps.push({ text, delta, applies });
    if (applies && total !== null && delta !== null) total += delta;
  };
  let known = !!digits;
  // 1. armed even → + first digit, else − last digit (one of the two always applies)
  if (A === null) { known = false; steps.push({ text: 'Armed modules even → + first digit, otherwise − last digit', delta: null, applies: null }); }
  else if (A % 2 === 0) add(`${A} armed (even) → + first digit`, true, digits ? digits[0] : null);
  else add(`${A} armed (odd) → − last digit`, true, digits ? -digits[3] : null);
  // 2. vowel in the serial
  if (!ser) { known = false; steps.push({ text: 'Serial has a vowel → + 4', delta: 4, applies: null }); }
  else add(`Serial ${ser} ${serialHasVowel(ser) ? 'has a vowel' : 'has no vowel'} → + 4`, serialHasVowel(ser), 4);
  // 3. last digit of the serial odd
  if (!ser) { known = false; steps.push({ text: 'Serial\'s last digit odd → − 2', delta: -2, applies: null }); }
  else if (lastSer === null) add(`Serial ${ser} has no digit → − 2`, false, -2);
  else add(`Serial's last digit ${lastSer} is ${lastSer % 2 ? 'odd' : 'even'} → − 2`, lastSer % 2 === 1, -2);
  // 4. more disarmed than armed
  if (A === null || D === null) { known = false; steps.push({ text: 'More disarmed than armed → + third digit', delta: null, applies: null }); }
  else add(`${D} disarmed ${D > A ? '>' : '≤'} ${A} armed → + third digit`, D > A, digits ? digits[2] : null);

  if (!known) total = null;
  let count = total;
  let wraps = 0;
  if (count !== null && D > 0 && count <= 0) {
    wraps = Math.ceil((1 - count) / D);
    count += wraps * D;
  }
  let position = null;
  if (D === 1) position = 1;
  else if (count !== null && D > 0) position = ((count - 1) % D) + 1;
  return {
    steps, total, count, wraps, position, missing,
    disarmed: D, armed: A,
    noneDisarmed: D === 0,
    onlyOne: D === 1,
    ok: position !== null
  };
}

/**
 * The bomb's modules in reading order (a level's list) → the ones that can be disarmed: needy
 * modules and unrecognised cards left out. [{ name, slot, copy, copies }]: slot = place on the board
 * (1-based, counting every card), copy = which copy of that name (Piano #2).
 */
export function countableModules(names) {
  const list = (names || []).map((name, i) => ({ name, slot: i + 1 })).filter(m => m.name && !NEEDY_MODULES.has(m.name) && m.name !== 'Timer');
  const seen = {};
  const copies = {};
  list.forEach(m => { copies[m.name] = (copies[m.name] || 0) + 1; });
  return list.map(m => { seen[m.name] = (seen[m.name] || 0) + 1; return { ...m, copy: seen[m.name], copies: copies[m.name] }; });
}

/** "Piano", or "Piano #2" when the bomb has more than one Piano. */
export const moduleLabel = (m) => (m.copies > 1 ? `${m.name} #${m.copy}` : m.name);
