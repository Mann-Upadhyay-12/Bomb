// Batteries — which modules to disarm in which order, from this game's rules table and the bomb's
// batteries. The game's rules (from its manual):
//   Every row whose condition is true for the bomb's batteries applies — check them all. Disarming a
//   module against any matching row detonates the bomb.
//   Digit: only disarm that module while the digit is anywhere on the timer (a 2 counts at 2:xx,
//          x:2x and x:x2).
//   ANY:   disarm it whenever.
//   FIRST and THEN (joined by an arrow, same colour): disarm FIRST before THEN.
//   Empty: no rule for that module.

import { KNOWN_MODULE_NAMES } from '../../core/sectionsData.js';

// ── battery kinds ──
// The label colour is the kind (the table's icons use the same colours). Sizes are only a fallback
// for batteries typed in by hand; a picture gives real sizes.
export const BATTERY_KINDS = {
  yellow: { label: 'Yellow', volts: 1.5, round: true, size: 1 },
  orange: { label: 'Orange', volts: 1.5, round: true, size: 2 },
  red: { label: 'Red', volts: 1.5, round: true, size: 3 },
  blue: { label: 'Blue', volts: 1.5, round: true, size: 4 },
  green: { label: 'Green', volts: 1.5, round: true, size: 2.5 },
  purple: { label: '9V', volts: 9, round: false, size: 3.5 }
};

export const fmtVolts = (v) => `${Math.round(v * 100) / 100}V`;
/** [3] → "3", [3, 4] → "3 and 4" */
export const digitsLabel = (d) => (d.length === 1 ? `${d[0]}` : d.slice(0, -1).join(', ') + ' and ' + d[d.length - 1]);

// ── module names ──
const ALIASES = {
  "who's on first": "Who's On First", 'whos on first': "Who's On First", 'wof': "Who's On First",
  'morse': 'Morse Code', 'simon': 'Simon Says', 'button': 'The Button', 'wire sequence': 'Wire Sequences',
  'wire seq': 'Wire Sequences', 'rubiks cube': "Rubik's Cube", 'cube': "Rubik's Cube", 'knob': 'Knobs'
};
const NAMES = Object.keys(KNOWN_MODULE_NAMES);
const squash = (s) => String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Read header text → { name, sure } (closest known module; `sure` false when it's a guess). */
export function matchModuleName(text) {
  const t = squash(text);
  if (!t) return { name: '', sure: false };
  const cands = [...NAMES.map(n => [squash(n), n]), ...Object.entries(ALIASES)];
  let best = null;
  for (const [k, name] of cands) {
    const kk = k.replace(/'/g, ''), tt = t.replace(/'/g, '');
    const d = lev(tt, kk) / Math.max(kk.length, tt.length);
    if (!best || d < best.d) best = { d, name };
  }
  return best && best.d <= 0.45 ? { name: best.name, sure: best.d <= 0.25 } : { name: text.trim(), sure: false };
}

// ── conditions ──
const NUM = '(\\d+(?:[.,]\\d+)?)';

// OCR often runs the words together ("Under9Vtotal", "Biggestround:"): split the text back into
// words, longest known word first, numbers with their V ("9v", "4.5v") kept as one word.
const WORDS = ['batteries', 'battery', 'biggest', 'largest', 'smallest', 'tallest', 'shortest', 'exactly', 'without',
  'greater', 'minimum', 'maximum', 'higher', 'contains', 'fewer', 'total', 'under', 'below', 'above', 'round', 'least',
  'lower', 'volts', 'less', 'more', 'most', 'over', 'than', 'only', 'none', 'with', 'volt', 'has', 'and', 'any', 'or',
  'at', 'no'].sort((a, b) => b.length - a.length);
export function splitWords(text) {
  const s = String(text || '').toLowerCase().replace(/[’`]/g, "'").replace(/(\d)\s*,\s*(\d)/g, '$1.$2').replace(/\s+/g, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const num = s.slice(i).match(/^\d+(?:\.\d+)?(?:volts?|v)?/);
    if (num) { out.push(num[0].replace(/volts?$/, 'v')); i += num[0].length; continue; }
    const w = WORDS.find(x => s.startsWith(x, i));
    if (w) { out.push(w); i += w.length; continue; }
    // anything else: glue to the previous unknown run
    if (out.length && out[out.length - 1].startsWith('~')) out[out.length - 1] += s[i]; else out.push('~' + s[i]);
    i++;
  }
  return out.map(w => (w.startsWith('~') ? w.slice(1) : w)).join(' ').replace(/\s*:\s*/g, ' ').trim();
}

/**
 * A row's condition from its words (OCR or typed) and the colour of its battery icon (or null):
 *   { type: 'volts', op, v } | { type: 'count', op, n, color } | { type: 'biggest' | 'smallest', color, round }
 * or { type: 'unknown' }. Comparisons: '<' '>' '<=' '>=' '='.
 */
export function parseCondition(text, icon = null) {
  let t = splitWords(text);
  // common OCR slips on the digits of "9V", "4.5V"
  t = t.replace(/\b[o]v\b/g, '0v').replace(/\bsv\b/g, '5v');
  const op = /\b(under|below|less than|fewer than|lower than)\b/.test(t) ? '<'
    : /\b(over|above|more than|greater than|higher than)\b/.test(t) ? '>'
    : /\b(at least|or more|minimum)\b|\+/.test(t) ? '>='
    : /\b(at most|or less|or fewer|maximum)\b/.test(t) ? '<='
    : '=';
  const round = /\bround\b/.test(t);
  if (/\b(biggest|largest|tallest)\b/.test(t)) return { type: 'biggest', color: icon, round };
  if (/\b(smallest|shortest)\b/.test(t)) return { type: 'smallest', color: icon, round };
  const volts = t.match(new RegExp(NUM + 'v\\b'));
  if (volts) return { type: 'volts', op, v: Number(volts[1]) };
  const num = t.match(new RegExp('\\b' + NUM + '\\b'));
  if (/^(no|without|none)\b/.test(t) && icon) return { type: 'count', op: '=', n: 0, color: icon };
  if (num && (/batter/.test(t) || icon)) return { type: 'count', op, n: Number(num[1]), color: /batter/.test(t) && !icon ? null : icon };
  if (/^(has|with|contains|any)\b/.test(t) && icon) return { type: 'count', op: '>=', n: 1, color: icon };
  if (/^no\b/.test(t) && /batter/.test(t)) return { type: 'count', op: '=', n: 0, color: null };
  // a one-letter OCR slip in the short icon rows ("Hag", "N0"): the icon says which battery
  if (icon && /^[a-z0-9]{2,4}$/.test(t)) {
    const near = [['has', '>=', 1], ['no', '=', 0]].filter(([w]) => lev(t, w) <= 1 && t[0] === w[0]);
    if (near.length === 1) return { type: 'count', op: near[0][1], n: near[0][2], color: icon };
  }
  return { type: 'unknown' };
}

/**
 * Batteries are 1.5V and 9V, so every total is a multiple of 1.5 (1.5, 3, 4.5, …). A voltage in a
 * row that isn't one ("Under 8V", "4.6V") is most likely a misread — the row says to check it.
 */
export const oddVolts = (cond) => Boolean(cond && cond.type === 'volts' && Math.abs(cond.v / 1.5 - Math.round(cond.v / 1.5)) > 1e-6);

const cmp = (a, op, b) => (op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : op === '>=' ? a >= b : Math.abs(a - b) < 1e-9);
const opWord = { '<': 'under', '>': 'over', '<=': 'at most', '>=': 'at least', '=': 'exactly' };
export const kindLabel = (c) => (c ? (BATTERY_KINDS[c] ? BATTERY_KINDS[c].label : c) : '?');

/** Plain words for a parsed condition (shown next to the row). */
export function describeCondition(c) {
  if (!c || c.type === 'unknown') return 'not understood';
  if (c.type === 'volts') return `total ${opWord[c.op]} ${fmtVolts(c.v)}`;
  if (c.type === 'count') {
    const what = c.color ? `${kindLabel(c.color)} batter${c.n === 1 ? 'y' : 'ies'}` : `batter${c.n === 1 ? 'y' : 'ies'}`;
    if (c.op === '>=' && c.n === 1 && c.color) return `has a ${kindLabel(c.color)} battery`;
    if (c.op === '=' && c.n === 0) return `no ${c.color ? kindLabel(c.color) + ' ' : ''}batteries`;
    return `${opWord[c.op]} ${c.n} ${what}`;
  }
  return `${c.type} ${c.round ? 'round ' : ''}battery is ${kindLabel(c.color)}`;
}

/** true / false, or null when it can't be told (unknown condition, tie, no icon colour). */
export function evalCondition(c, batteries) {
  if (!c || c.type === 'unknown') return null;
  const list = batteries || [];
  if (c.type === 'volts') return cmp(list.reduce((a, b) => a + (Number(b.volts) || 0), 0), c.op, c.v);
  if (c.type === 'count') return cmp(c.color ? list.filter(b => b.color === c.color).length : list.length, c.op, c.n);
  if (!c.color) return null;
  const pool = c.round ? list.filter(b => b.round) : list;
  if (!pool.length) return false;
  // picture sizes are pixels; a battery added by hand has none, so then every battery is compared by
  // its kind (yellow < orange < red < blue)
  const measured = pool.every(b => b.size != null);
  const size = (b) => (measured ? b.size : (BATTERY_KINDS[b.color] || {}).size || 0);
  const sizes = pool.map(size);
  const target = c.type === 'biggest' ? Math.max(...sizes) : Math.min(...sizes);
  // batteries within 4 % of the biggest / smallest count as the same size
  const top = pool.filter((b, i) => Math.abs(sizes[i] - target) <= Math.abs(target) * 0.04);
  if (top.every(b => b.color === c.color)) return true;
  if (top.every(b => b.color !== c.color)) return false;
  return null;
}

/** "Symbols", "Who's On First", … — the table's column `i`, or "Column n" when unread. */
const colName = (table, i) => (table.modules[i] && table.modules[i].trim()) || `Column ${i + 1}`;

/**
 * The plan for this bomb. `overrides[i]` (true / false) replaces row i's own answer.
 * Returns { rows: [{ truth, auto, cond }], plan: [{ name, digits, any, before, after }],
 *   chains: [[[names at level 0], [level 1], …]], timer: [{ name, digits }], free: [names],
 *   cycle: [names] | null, unknownRows: [i], copy, ready }
 */
export function solveBatteries(table, batteries, overrides = {}) {
  const rows = (table && table.rows) || [];
  const n = (table && table.modules.length) || 0;
  const info = rows.map((r, i) => {
    const cond = r.cond || parseCondition(r.text, r.icon);
    const auto = evalCondition(cond, batteries);
    const truth = overrides[i] === true || overrides[i] === false ? overrides[i] : auto;
    return { cond, auto, truth };
  });
  const mods = Array.from({ length: n }, (_, i) => ({ i, name: colName(table, i), digits: new Set(), any: false, after: new Set(), before: new Set(), rows: [] }));
  info.forEach((ri, r) => {
    if (ri.truth !== true) return;
    const cells = rows[r].cells || [];
    const ends = {};
    cells.forEach((c, j) => {
      if (!c || j >= n) return;
      mods[j].rows.push(r);
      if (c.kind === 'digit' && c.digit != null) mods[j].digits.add(Number(c.digit));
      else if (c.kind === 'any') mods[j].any = true;
      else if (c.kind === 'first' || c.kind === 'then') {
        const k = c.pair || 'pair';
        (ends[k] = ends[k] || { first: [], then: [] })[c.kind].push(j);
      }
    });
    for (const { first, then } of Object.values(ends)) {
      for (const a of first) for (const b of then) if (a !== b) { mods[a].before.add(b); mods[b].after.add(a); }
    }
  });
  // order: Kahn's algorithm, levels = longest path from a module with nothing before it
  const inOrder = mods.filter(m => m.before.size || m.after.size);
  const indeg = new Map(inOrder.map(m => [m.i, m.after.size]));
  const level = new Map();
  const queue = inOrder.filter(m => !m.after.size).map(m => m.i);
  queue.forEach(i => level.set(i, 0));
  const done = [];
  while (queue.length) {
    const i = queue.shift();
    done.push(i);
    for (const j of mods[i].before) {
      level.set(j, Math.max(level.get(j) || 0, level.get(i) + 1));
      indeg.set(j, indeg.get(j) - 1);
      if (indeg.get(j) === 0) queue.push(j);
    }
  }
  const cycle = done.length < inOrder.length ? inOrder.filter(m => !done.includes(m.i)).map(m => m.name) : null;
  // separate chains (modules linked by arrows), each as levels
  const comp = new Map();
  let nc = 0;
  for (const m of inOrder) {
    if (comp.has(m.i)) continue;
    const st = [m.i];
    comp.set(m.i, nc);
    while (st.length) {
      const k = st.pop();
      for (const j of [...mods[k].before, ...mods[k].after]) if (!comp.has(j)) { comp.set(j, nc); st.push(j); }
    }
    nc++;
  }
  const chains = [];
  for (let c = 0; c < nc; c++) {
    const members = inOrder.filter(m => comp.get(m.i) === c && level.has(m.i));
    const lv = [];
    for (const m of members) (lv[level.get(m.i)] = lv[level.get(m.i)] || []).push(m.name);
    if (lv.length) chains.push(lv.filter(Boolean));
  }
  const timer = mods.filter(m => m.digits.size).map(m => ({ name: m.name, digits: [...m.digits].sort((a, b) => a - b) }));
  const free = mods.filter(m => !m.digits.size && !m.before.size && !m.after.size).map(m => m.name);
  const unknownRows = info.map((r, i) => (r.truth === null ? i : -1)).filter(i => i >= 0);
  const named = (name) => {
    const t = timer.find(x => x.name === name);
    return t ? `${name} (${digitsLabel(t.digits)} on timer)` : name;
  };
  const parts = chains.map(lv => lv.map(l => l.map(named).join(' + ')).join(' → '));
  const loose = timer.filter(t => !inOrder.some(m => m.name === t.name)).map(t => named(t.name));
  const copy = [...parts, ...loose, free.length ? `any time: ${free.join(', ')}` : ''].filter(Boolean).join(' · ');
  return {
    rows: info,
    plan: mods.map(m => ({ name: m.name, digits: [...m.digits].sort((a, b) => a - b), any: m.any, before: [...m.before].map(j => mods[j].name), after: [...m.after].map(j => mods[j].name), rows: m.rows })),
    chains, timer, free, cycle, unknownRows,
    copy: rows.length && batteries && batteries.length ? copy : '',
    ready: Boolean(rows.length && batteries && batteries.length)
  };
}


// ── sample (the 2026-11-23 game: tests/fixtures/batteries_table.png + batteries_bomb.png) ──
/** 'first:blue' / '4' / 'ANY' / '.' → a cell */
export function parseCell(t) {
  const s = String(t || '').trim().toLowerCase();
  if (!s || s === '.' || s === '-') return null;
  if (s === 'any') return { kind: 'any', digit: null, pair: null };
  if (/^\d$/.test(s)) return { kind: 'digit', digit: Number(s), pair: null };
  const m = s.match(/^(first|then):(\w+)$/);
  return m ? { kind: m[1], digit: null, pair: m[2] } : null;
}
/** a cell → its short text (inverse of parseCell) */
export const cellKey = (c) => (!c ? '' : c.kind === 'any' ? 'any' : c.kind === 'digit' ? String(c.digit ?? '') : `${c.kind}:${c.pair || 'blue'}`);

export const SAMPLE_TABLE = {
  modules: ["Who's On First", 'Search', 'Logic', 'Chess', "Rubik's Cube", 'Diagram', 'Symbols'],
  unsure: [],
  rows: [
    ['Under 9V total', null, 'first:blue 4 first:orange then:blue 1 then:orange .'],
    ['Biggest round:', 'orange', '4 ANY ANY . . . .'],
    ['Has', 'yellow', '. 1 5 . 0 . ANY'],
    ['Under 12V total', null, 'then:orange 0 first:blue . first:orange 4 then:blue'],
    ['Exactly 2 batteries', null, '. 2 . . ANY . .'],
    ['Has', 'blue', '. first:orange . . then:orange . 3'],
    ['Biggest round:', 'blue', '. then:orange . . . ANY first:orange'],
    ['Biggest round:', 'red', '0 then:orange then:blue first:blue . first:orange .'],
    ['Under 4.5V total', null, 'ANY . 2 . . . .'],
    ['No', 'blue', '5 . ANY . . ANY .']
  ].map(([text, icon, cells]) => ({ text, icon, cells: cells.split(' ').map(parseCell) }))
};
export const SAMPLE_BATTERIES = [
  { color: 'orange', volts: 1.5, round: true, size: 16456 },
  { color: 'blue', volts: 1.5, round: true, size: 34584 },
  { color: 'purple', volts: 9, round: false, size: 26400 }
];

// ── The bomb timer ──
// Confirmed in a practice run: the timer counts DOWN from 8:00. A digit "on the timer" can show in
// the minutes (d:59 → d:00, a whole minute, once — 8 only at the very start, 9 never), in the tens
// of seconds (x:d9 → x:d0, 10 s every minute — only 0–5, seconds stop at 59) or in the last digit
// (x:xd, 1 s every 10 s). Discord lag makes the 1-second moments risky; the longer ones are safer.
export const BOMB_START = 8 * 60;
export const fmtClock = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
/** Does the timer at `sec` seconds left show every one of `digits`? */
export const showsDigits = (sec, digits) => {
  const face = `${Math.floor(sec / 60)}${String(sec % 60).padStart(2, '0')}`;
  return digits.every(d => face.includes(String(d)));
};
/** Stretches of the countdown (from `from` down to 0) that show all `digits`: [{ start, end, len }], soonest first. */
export function timerWindows(digits, from = BOMB_START) {
  const out = [];
  let cur = null;
  for (let s = from; s >= 0; s--) {
    if (showsDigits(s, digits)) {
      if (cur && cur.end === s + 1) { cur.end = s; cur.len++; } else { cur = { start: s, end: s, len: 1 }; out.push(cur); }
    }
  }
  return out;
}
/** Where `digits` show on a countdown from 8:00, longest first, in words. */
export function describeWindows(digits) {
  if (digits.length === 1) {
    const d = digits[0], parts = [];
    if (d <= 7) parts.push(`${d}:59→${d}:00 (a whole minute${d === 7 ? ', right after the start' : ''})`);
    if (d === 8) parts.push('8:00 (only the first second)');
    if (d <= 5) parts.push(`x:${d}9→x:${d}0 every minute (10 s)`);
    parts.push(`x:x${d} every 10 s (1 s — risky with lag)`);
    return parts.join(' · ');
  }
  const ws = timerWindows(digits);
  if (!ws.length) return 'never on a timer counting down from 8:00 — check the table';
  const long = ws.filter(w => w.len >= 5).sort((a, b) => b.len - a.len).slice(0, 4).sort((a, b) => b.start - a.start);
  const short = ws.filter(w => w.len < 5);
  const txt = long.map(w => `${fmtClock(w.start)}→${fmtClock(w.end)} (${w.len} s)`);
  if (short.length) txt.push(`${short.length} short moment${short.length === 1 ? '' : 's'} like ${fmtClock(short[0].start)}${short[0].len > 1 ? `→${fmtClock(short[0].end)}` : ''}`);
  return txt.join(' · ');
}
