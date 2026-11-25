// Laundry — the helper manual changes from game to game (the load formulas did: Load 1 had
// remaining + 5 / solved + needy + 2 / digit + total + 1, Load 2 remaining + 3 / + 5 / + 3), so the
// rules are read from the manual's text (pasted, or OCR of its pictures), never built in:
//
//   Use the module's captured counts. Subtract 6 until each result is 0 to 5.
//   Item = remaining + 3            ← formulas: counts, serial digit, numbers
//   Item → Iron / Special care      ← tables: one row per name, in order (0 = first)
//   Corset: 150°C / Bleach
//   Wash → material. Dry → color. Iron → item.
//   • Leather or Jade Cluster: Wash 30°C.          ← overrides
//   Special care: first match wins                 ← care rules
//   Clouded Pearl → Non-chlorine bleach
//   Corset or Corduroy → material care
//   Material shares a letter with serial → color care
//   Otherwise → item care
//
// The symbols each control can show are fixed (the symbol sheet): every value read is snapped to one
// of them, which also mends OCR slips ("150*C", "Non-chiorine bleach").

// Each control's options in the order of the symbol sheet. The module starts load 1 on the first
// of each (30°C, High heat, 150°C, Bleach), so a press is taken to step to the next one in this
// order — the press counts rest on that.
export const WASH = ['30°C', '40°C', '50°C', '95°C', 'Hand wash', 'Do not wash'];
export const DRY = ['High heat', 'Dry flat', 'Tumble dry', 'No tumble dry', 'Low heat', 'Medium heat'];
export const IRON = ['150°C', 'No steam', 'Iron', '200°C', '110°C'];
export const CARE = ['Bleach', 'No tetra solvent', 'Reduced moisture', 'Short cycle', 'Do not bleach', 'No dry cleaning',
  'Petroleum only', 'Low heat', 'Wet cleaning', 'Any solvent', 'No steam finish', 'Non-chlorine bleach'];
export const CONTROLS = [['wash', 'Wash', WASH], ['dry', 'Dry', DRY], ['iron', 'Iron', IRON], ['care', 'Special care', CARE]];
const LISTS = { wash: WASH, dry: DRY, iron: IRON, care: CARE };
export const TABLES = ['item', 'material', 'color'];
const TABLE_LABEL = { item: 'Item', material: 'Material', color: 'Color' };

const cleanSerial = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Last digit anywhere in the serial, 0 when it has none. */
export function lastSerialDigit(serial) {
  const d = cleanSerial(serial).match(/\d/g);
  return d ? Number(d[d.length - 1]) : 0;
}
function firstSerialDigit(serial) {
  const d = cleanSerial(serial).match(/\d/);
  return d ? Number(d[0]) : 0;
}

/** Letters the name and the serial have in common (upper-case). */
export function sharedLetters(name, serial) {
  const s = new Set(cleanSerial(serial).replace(/\d/g, ''));
  return Array.from(new Set(String(name).toUpperCase().replace(/[^A-Z]/g, ''))).filter(ch => s.has(ch));
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** The closest of `options` to `raw` (OCR slips allowed) → { value, d } or null. */
function closestD(raw, options) {
  const r = norm(raw);
  if (!r) return null;
  let best = null, bestD = Infinity;
  for (const o of options) {
    const d = lev(r, norm(o));
    if (d < bestD) { bestD = d; best = o; }
  }
  return best && bestD <= Math.max(1, Math.floor(norm(best).length * 0.3)) ? { value: best, d: bestD } : null;
}
const closest = (raw, options) => { const c = closestD(raw, options); return c ? c.value : null; };

// Names seen in every manual so far: a care rule can name them even when the picture with their
// table was not pasted.
const USUAL_NAMES = ['Corset', 'Shirt', 'Skirt', 'Skort', 'Shorts', 'Scarf', 'Polyester', 'Cotton', 'Wool', 'Nylon',
  'Corduroy', 'Leather', 'Ruby Fountain', 'Star Lemon Quartz', 'Sapphire Springs', 'Jade Cluster', 'Clouded Pearl', 'Malinite'];

/** A value read for `control`, snapped to the symbol it names ("150*C" → "150°C"), or null. */
export function pickSymbol(control, raw) {
  const list = LISTS[control];
  const s = String(raw || '').trim().replace(/\.$/, '');
  const temps = list.filter(x => /^\d+°C$/.test(x));
  const digits = s.replace(/\D/g, '');
  // a temperature: the digits, then perhaps a degree sign read as 0 / o / * and the C
  if (digits.length >= 2 && /^[\d\s°º*o0]+c?$/i.test(s.replace(/\s/g, ''))) {
    const hit = temps.map(t => t.replace(/\D/g, '')).filter(t => digits.startsWith(t)).sort((a, b) => b.length - a.length)[0];
    if (hit) return `${hit}°C`;
  }
  return closest(s, list.filter(x => !temps.includes(x)));
}

const ARROW = /\s*(?:→|->|=>|—>|–>|⇒|➔|►)\s*|\s+(?:—|–|-|>|\+|=)\s+/;
// "Item" comes back from OCR as "Iltem" / "ltem" now and then
const TW = '(?:[il1|]{1,2}tem|material|colou?r)';
const tableKey = w => (/^colou?r$/i.test(w) ? 'color' : /^[il1|]{1,2}tem$/i.test(w) ? 'item' : /^material$/i.test(w) ? 'material' : null);
const controlKey = w => (/^wash$/i.test(w) ? 'wash' : /^dry$/i.test(w) ? 'dry' : /^iron$/i.test(w) ? 'iron' : /^special\s*care$/i.test(w) ? 'care' : null);

function parseFormula(rhs) {
  const text = rhs.replace(/\(.*?\)/g, '').trim();
  const terms = [];
  for (const part of text.split(/(?=[+-])/)) {
    const sign = part.trim().startsWith('-') ? -1 : 1;
    const t = part.replace(/^[\s+-]+/, '').trim().toLowerCase();
    if (!t) continue;
    if (/^\d+$/.test(t)) terms.push({ sign, kind: 'num', n: Number(t) });
    else if (/remaining/.test(t)) terms.push({ sign, kind: 'count', key: 'remaining' });
    else if (/solved/.test(t)) terms.push({ sign, kind: 'count', key: 'solved' });
    else if (/needy/.test(t)) terms.push({ sign, kind: 'count', key: 'needy' });
    else if (/total/.test(t)) terms.push({ sign, kind: 'count', key: 'total' });
    else if (/first.*digit/.test(t)) terms.push({ sign, kind: 'digit', which: 'first' });
    else if (/digit/.test(t)) terms.push({ sign, kind: 'digit', which: 'last' });
    else return { text: rhs.trim(), terms, unknown: t };
  }
  return { text: text.replace(/\s+/g, ' '), terms };
}

/**
 * The manual's text → { load, modulus, formulas, tables, columns, controlFrom, overrides, care, unread }
 * (each part only when the text has it — page 1 and page 2 can come separately).
 */
export function parseLaundryManual(text) {
  const out = { load: null, modulus: null, formulas: {}, tables: {}, columns: {}, controlFrom: {}, overrides: [], care: [], unread: [] };
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let table = null, inCare = false;
  const names = () => TABLES.flatMap(k => (out.tables[k] || []).map(r => r.name));
  const pendingRules = [];
  for (const raw of lines) {
    const l = raw.replace(/^[•·*e+»]\s+/, '').replace(/^[-–]\s+/, '');
    let m;
    if ((m = l.match(/^load\s*#?\s*(\d+)/i))) { out.load = Number(m[1]); continue; }
    if ((m = l.match(/subtract\s+(\d+)/i))) { out.modulus = Number(m[1]); continue; }
    if ((m = l.match(new RegExp(`^(${TW})\\s*(?:=|:|—|–|-)\\s*(.+)$`, 'i'))) && !/\//.test(m[2]) && /\d|remaining|solved|needy|total|digit/i.test(m[2])) {
      out.formulas[tableKey(m[1])] = parseFormula(m[2]);
      table = null;
      continue;
    }
    // table header: "Item → Iron / Special care" (arrow may be lost in OCR)
    if ((m = l.match(new RegExp(`^(${TW})\\b\\W*\\s*(wash|dry|iron)\\s*[/|l1I]\\s*special\\s*care\\.?$`, 'i')))) {
      table = tableKey(m[1]);
      out.tables[table] = [];
      out.columns[table] = [controlKey(m[2]), 'care'];
      inCare = false;
      continue;
    }
    if (/first\s+match/i.test(l)) { inCare = true; table = null; continue; }
    // table row: "Corset: 150°C / Bleach"
    const looksOverride = /^.+?:\s*(?:wash|dry|iron|special care)\s+\S/i.test(l) && !/[/|]/.test(l);
    if (table && !looksOverride && (m = l.match(/^([A-Za-z][A-Za-z' ]*?)\s*[:;]\s*(.+?)\.?$/))) {
      const [c1, c2] = out.columns[table];
      const name = m[1].trim(), rest = m[2];
      let pair = null;
      const slash = rest.match(/^(.+?)\s*[/|]\s*(.+)$/);
      if (slash) pair = [pickSymbol(c1, slash[1]), pickSymbol(c2, slash[2])];
      if (!pair || !pair[0] || !pair[1]) {
        // the slash was misread ("l", "1") or lost: the split where both halves are symbols
        const words = rest.split(' ');
        for (let i = 1; i < words.length && (!pair || !pair[0] || !pair[1]); i++) {
          const a = pickSymbol(c1, words.slice(0, i).join(' ').replace(/\s*[/|l1I]$/, '')), b = pickSymbol(c2, words.slice(i).join(' ').replace(/^[/|l1I]\s*/, ''));
          if (a && b) pair = [a, b];
        }
      }
      out.tables[table].push({ name, values: { [c1]: pair ? pair[0] : null, [c2]: pair ? pair[1] : null }, text: raw });
      continue;
    }
    // "Wash → material. Dry → color. Iron → item."
    const maps = Array.from(l.matchAll(new RegExp(`\\b(wash|dry|iron)\\b\\W{0,4}\\s*(${TW})\\b`, 'gi')));
    if (maps.length && !/\//.test(l)) {
      maps.forEach(x => { out.controlFrom[controlKey(x[1])] = tableKey(x[2]); });
      table = null;
      continue;
    }
    // override: "Leather or Jade Cluster: Wash 30°C."
    if ((m = l.match(/^(.+?)\s*:\s*(wash|dry|iron|special care)\s+(.+?)\.?$/i))) {
      const control = controlKey(m[2]);
      const value = pickSymbol(control, m[3]);
      const who = m[1].split(/\s+or\s+|\s*,\s*/i).map(s => s.trim()).filter(Boolean);
      if (value && who.length) { out.overrides.push({ who, control, value, text: raw }); table = null; continue; }
    }
    if (inCare) { pendingRules.push(raw); continue; }
    if (table) continue; // a table row we could not split: skipped (shows as a short table)
    if (!/subject of|^top\b|find the load|use the module|set the controls|check every/i.test(l)) out.unread.push(raw);
  }
  // care rules once the names are known (names in a rule can come from any table)
  const known = Array.from(new Set([...names(), ...USUAL_NAMES]));
  for (const raw of pendingRules) out.care.push(parseCareRule(raw, known));
  return out;
}

// each returns { …, d } — how far the OCR text was from what it was read as (0 = exact)
function parseCareThen(s) {
  const t = s.trim().replace(/\.$/, '');
  const m = t.match(new RegExp(`^(${TW})\\s+care$`, 'i'));
  if (m) return { kind: 'care', table: tableKey(m[1]), d: 0 };
  const v = closestD(t, CARE);
  return v ? { kind: 'value', value: v.value, d: v.d } : null;
}
function parseCareWhen(s, known) {
  const t = s.trim();
  if (/^otherwise$/i.test(t)) return { kind: 'always', d: 0 };
  const m = t.match(new RegExp(`^(${TW})\\s+shares\\s+(?:a\\s+)?letter\\s+with\\s+(?:the\\s+)?serial`, 'i'));
  if (m) return { kind: 'shares', table: tableKey(m[1]), d: 0 };
  const parts = t.split(/\s+or\s+|\s*,\s*/i).map(x => x.trim()).filter(Boolean);
  const hits = parts.map(p => closestD(p, known));
  if (parts.length && hits.every(Boolean)) return { kind: 'names', who: hits.map(h => h.value), d: hits.reduce((a, h) => a + h.d, 0) };
  return null;
}
const strip = ({ d, ...rest }) => rest;
function parseCareRule(raw, known) {
  const l = raw.replace(/^[•·*e+»]\s+/, '');
  const parts = l.split(ARROW);
  if (parts.length >= 2) {
    const when = parseCareWhen(parts[0], known), then = parseCareThen(parts.slice(1).join(' '));
    if (when && then) return { when: strip(when), then: strip(then), text: raw };
  }
  // the arrow was lost: the split between words where both sides read best
  const words = l.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const when = parseCareWhen(words.slice(0, i).join(' '), known), then = parseCareThen(words.slice(i).join(' '));
    if (when && then && (!best || when.d + then.d < best.d)) best = { when: strip(when), then: strip(then), d: when.d + then.d };
  }
  if (best) return { when: best.when, then: best.then, text: raw };
  return { when: { kind: 'unknown' }, then: null, text: raw };
}

/** Is there anything Laundry-manual in this parse? */
export const manualHasAny = m => Boolean(m && (Object.keys(m.formulas).length || Object.keys(m.tables).length || m.overrides.length || m.care.length));

// The 23 Nov game's manual (Load 1), as pasted. Only its tables and rules stand in when a pasted
// manual lacks them (they were the same in both manuals seen) — never its formulas.
export const SAMPLE_MANUAL_TEXT = `On the subject of Laundry
Load 1 • Check every 60s. Wrong settings explode. Reopen for each new load.
Top: Wash | Dry. Bottom: Iron | Special care.

Find the load

Use the module's captured counts. Subtract 6 until each result is 0 to 5.
Item = remaining + 5
Material = solved + needy + 2
Color = last serial digit + total + 1 (no digit: use 0)

Item → Iron / Special care
Corset: 150°C / Bleach
Shirt: No steam / No tetra solvent
Skirt: Iron / Reduced moisture
Skort: 200°C / Short cycle
Shorts: 150°C / Do not bleach
Scarf: 110°C / No dry cleaning

Material → Wash / Special care
Polyester: 50°C / Petroleum only
Cotton: 95°C / No dry cleaning
Wool: Hand wash / Reduced moisture
Nylon: 30°C / Low heat
Corduroy: 40°C / Wet cleaning
Leather: Do not wash / No tetra solvent

Color → Dry / Special care
Ruby Fountain: High heat / Any solvent
Star Lemon Quartz: Dry flat / Low heat
Sapphire Springs: Tumble dry / Short cycle
Jade Cluster: No tumble dry / No steam finish
Clouded Pearl: Low heat / Low heat
Malinite: Medium heat / Non-chlorine bleach

Set the controls

Wash → material. Dry → color. Iron → item.
• Leather or Jade Cluster: Wash 30°C.
• Wool or Star Lemon Quartz: Dry High heat.

Special care: first match wins
Clouded Pearl → Non-chlorine bleach
Corset or Corduroy → material care
Material shares a letter with serial → color care
Otherwise → item care`;
const USUAL = parseLaundryManual(SAMPLE_MANUAL_TEXT);

const fmtFormula = (f) => f.terms.map((t, i) => `${i ? (t.sign < 0 ? ' − ' : ' + ') : t.sign < 0 ? '−' : ''}${t.kind === 'num' ? t.n : t.kind === 'count' ? t.key : `${t.which} serial digit`}`).join('');
export const describeFormula = (key, f) => (f ? `${TABLE_LABEL[key]} = ${f.unknown ? f.text : fmtFormula(f)}` : `${TABLE_LABEL[key]} = ?`);

/**
 * manual: parseLaundryManual result; counts: { remaining, solved, needy, total }; serial: string.
 * → { ready, missing, reason, item, material, color, set, why, copy, borrowed }
 *   `borrowed` lists the parts taken from the usual rules because the pasted manual lacks them.
 */
export function solveLaundry(manual, counts, serial) {
  if (!manual || !Object.keys(manual.formulas).length) return { ready: false, missing: ['manual'], reason: "Paste this game's Laundry manual (its formulas change every game)." };
  const c = {
    remaining: num(counts && counts.remaining), solved: num(counts && counts.solved),
    needy: num(counts && counts.needy), total: num(counts && counts.total)
  };
  const ser = cleanSerial(serial);
  const missingF = TABLES.filter(k => !manual.formulas[k]);
  if (missingF.length) return { ready: false, missing: missingF.map(k => `${k} formula`), reason: `The manual's ${missingF.join(' / ')} formula wasn't read — fix it in the manual text.` };
  const odd = TABLES.find(k => manual.formulas[k].unknown);
  if (odd) return { ready: false, missing: [], reason: `Not understood in the ${odd} formula: "${manual.formulas[odd].unknown}" — fix it in the manual text.` };
  // only the counts / serial the formulas use are needed
  const used = new Set(TABLES.flatMap(k => manual.formulas[k].terms.map(t => (t.kind === 'count' ? t.key : t.kind === 'digit' ? 'serial' : null))).filter(Boolean));
  const missing = ['remaining', 'solved', 'needy', 'total'].filter(k => used.has(k) && c[k] === null);
  const careNeedsSerial = (manual.care.length ? manual.care : USUAL.care).some(r => r.when.kind === 'shares');
  if (!ser && (used.has('serial') || careNeedsSerial)) missing.push('serial');
  if (missing.length) return { ready: false, missing };

  const modulus = manual.modulus || 6;
  const borrowed = [];
  const tables = {}, columns = {};
  for (const k of TABLES) {
    const t = manual.tables[k];
    if (!t || !t.length) { tables[k] = USUAL.tables[k]; columns[k] = USUAL.columns[k]; borrowed.push(`${k} table`); continue; }
    // a table with rows lost (OCR) would pick the wrong row: stop rather than guess
    if (t.length !== modulus) return { ready: false, missing: [], reason: `The manual's ${k} table has ${t.length} rows, not ${modulus} — fix it in the manual text.` };
    const bad = t.find(r => Object.values(r.values).some(v => !v));
    if (bad) return { ready: false, missing: [], reason: `Manual row not understood: "${bad.text}" — fix it in the manual text.` };
    tables[k] = t; columns[k] = manual.columns[k];
  }
  const controlFrom = { ...USUAL.controlFrom };
  if (Object.keys(manual.controlFrom).length) Object.assign(controlFrom, manual.controlFrom);
  else {
    // the table headers say it too: "Item → Iron / Special care"
    let fromHeads = 0;
    for (const k of TABLES) if (manual.columns[k]) { controlFrom[manual.columns[k][0]] = k; fromHeads++; }
    if (!fromHeads) borrowed.push('which table sets wash / dry / iron');
  }
  const overrides = manual.overrides.length || manual.care.length ? manual.overrides : (borrowed.push('the wash / dry exceptions'), USUAL.overrides);
  const care = manual.care.length ? manual.care : (borrowed.push('the special-care rules'), USUAL.care);

  const value = (t) => (t.kind === 'num' ? t.n : t.kind === 'count' ? c[t.key] : t.which === 'first' ? firstSerialDigit(ser) : lastSerialDigit(ser));
  const pick = {}, why = {};
  for (const k of TABLES) {
    const f = manual.formulas[k];
    const sum = f.terms.reduce((a, t) => a + t.sign * value(t), 0);
    const idx = ((sum % modulus) + modulus) % modulus;
    pick[k] = tables[k][idx];
    const parts = f.terms.map((t, i) => `${i ? (t.sign < 0 ? ' − ' : ' + ') : t.sign < 0 ? '−' : ''}${t.kind === 'num' ? t.n : t.kind === 'count' ? `${c[t.key]} ${t.key}` : `${t.which} digit ${value(t)}`}`);
    const noDigit = f.terms.some(t => t.kind === 'digit') && !/\d/.test(ser) ? ' (no serial digit: 0)' : '';
    why[k] = `${parts.join('')}${noDigit} = ${sum} → ${idx}`;
  }
  const isPicked = (name) => TABLES.some(k => norm(pick[k].name) === norm(name));
  const set = {};
  for (const control of ['wash', 'dry', 'iron']) {
    const from = controlFrom[control];
    set[control] = pick[from].values[control] || null;
    why[control] = pick[from].name;
  }
  for (const o of overrides) {
    if (o.control === 'care') continue;
    const hit = o.who.find(isPicked);
    if (hit) { set[o.control] = o.value; why[o.control] = `${hit} → ${o.value}`; }
  }
  // special care: first match wins
  set.care = null;
  for (const r of care) {
    const w = r.when;
    if (w.kind === 'unknown') {
      return { ready: false, missing: [], reason: `Special-care rule not understood: "${r.text}" — fix it in the manual text.`, item: pick.item, material: pick.material, color: pick.color, why };
    }
    let hit = false, label = '';
    if (w.kind === 'always') { hit = true; label = 'no rule above'; }
    else if (w.kind === 'names') { const h = w.who.find(isPicked); if (h) { hit = true; label = h; } }
    else if (w.kind === 'shares') {
      const shared = sharedLetters(pick[w.table].name, ser);
      if (shared.length) { hit = true; label = `${pick[w.table].name} shares ${shared.join(', ')} with the serial`; }
    }
    if (!hit) continue;
    if (r.then.kind === 'value') { set.care = r.then.value; why.care = `${label} → ${r.then.value}`; }
    else { set.care = pick[r.then.table].values.care || null; why.care = `${label} → ${r.then.table} care (${pick[r.then.table].name})`; }
    break;
  }
  const unset = CONTROLS.filter(([k]) => !set[k]).map(([, label]) => label);
  if (unset.length) return { ready: false, missing: [], reason: `No ${unset.join(' / ')} setting came out of the manual — check its text.`, item: pick.item, material: pick.material, color: pick.color, why };
  return {
    ready: true, missing: [], item: pick.item, material: pick.material, color: pick.color, set, why, borrowed, modulus,
    copy: `Wash ${set.wash} · Dry ${set.dry} · Iron ${set.iron} · Care ${set.care}`
  };
}

/** Presses of each button to get from `current` to `set` (null where the current symbol is unknown). */
export function pressesFor(set, current) {
  const out = {};
  for (const [key, , list] of CONTROLS) {
    const to = list.indexOf(set[key]);
    const from = current && current[key] != null ? list.indexOf(current[key]) : -1;
    out[key] = to < 0 || from < 0 ? null : (to - from + list.length) % list.length;
  }
  return out;
}

/**
 * The bot's message (copied text, or text read off a screenshot) → { load, remaining, solved, needy,
 * total, serial, checkIn } with null for what isn't there.
 */
export function parseLaundryText(text) {
  const t = String(text || '').replace(/[*_`]/g, '').replace(/\s+/g, ' ');
  const grab = (re) => { const m = t.match(re); return m ? Number(m[1]) : null; };
  const serialM = t.match(/serial\s*(?:number)?\s*[:：]?\s*([A-Z0-9]{4,12})\b/i);
  return {
    load: grab(/\bload\s*#?\s*(\d+)/i),
    remaining: grab(/(\d+)\s*remaining/i),
    solved: grab(/(\d+)\s*solved/i),
    needy: grab(/(\d+)\s*needy/i),
    total: grab(/(\d+)\s*total/i),
    serial: serialM ? serialM[1].toUpperCase() : null,
    checkIn: grab(/check\s+in\s+(\d+)\s*s/i)
  };
}

/** Does this text look like the bot's load message (not the manual)? */
export const isLoadMessage = t => /captured\s+counts\s*:\s*\**\s*\d|\d+\**\s*remaining/i.test(String(t || ''));
