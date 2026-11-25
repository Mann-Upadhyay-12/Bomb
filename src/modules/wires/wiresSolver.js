// Wires: 3–6 coloured wires. The Helper's manual has an ordered rule list for each wire count; the
// first rule that matches says which ONE wire to cut ("the second wire", "the last wire", "the last
// red wire"). Some rules test the serial's last digit (its rightmost digit, letters after it or not).
// The lists change between games, so they are parsed from the pasted manual.
import { compileClause } from '../button/buttonSolver.js';

export const WIRE_COLORS = ['red', 'white', 'blue', 'yellow', 'black'];
export const WIRE_SWATCH = { red: '#e0393b', white: '#f2f2f2', blue: '#2f7fe0', yellow: '#f2c230', black: '#1b1b1f' };

// The guide's example begins the three-wire list with "no yellow wires → the second wire"; the rest
// is a stand-in in the same style.
export const SAMPLE_MANUAL = `3 wires:
If there are no yellow wires, cut the second wire.
Otherwise, if the last wire is white, cut the last wire.
Otherwise, if there is more than one blue wire, cut the last blue wire.
Otherwise, cut the last wire.

4 wires:
If there is more than one red wire and the last digit of the serial number is odd, cut the last red wire.
Otherwise, if the last wire is yellow and there are no red wires, cut the first wire.
Otherwise, if there is exactly one blue wire, cut the first wire.
Otherwise, if there is more than one yellow wire, cut the last wire.
Otherwise, cut the second wire.

5 wires:
If the last wire is black and the last digit of the serial number is odd, cut the fourth wire.
Otherwise, if there is exactly one red wire and there is more than one yellow wire, cut the first wire.
Otherwise, if there are no black wires, cut the second wire.
Otherwise, cut the first wire.

6 wires:
If there are no yellow wires and the last digit of the serial number is odd, cut the third wire.
Otherwise, if there is exactly one yellow wire and there is more than one white wire, cut the fourth wire.
Otherwise, if there are no red wires, cut the last wire.
Otherwise, cut the fourth wire.`;

const NUM_WORDS = { zero: 0, no: 0, none: 0, one: 1, a: 1, an: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const ORD = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, sixth: 6, '6th': 6 };
const COL = '(red|white|blue|yellow|black)';
const toNum = (w) => (/^\d+$/.test(w) ? Number(w) : NUM_WORDS[w]);
const ordOf = (w) => (w === 'last' ? 'last' : ORD[w] || (/^\d+$/.test(w) ? Number(w) : null));
const ordWord = (n) => (n === 'last' ? 'last' : ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][n] || `${n}th`);

/** A wire condition → { desc, eval(ctx) → true/false/null }, or a serial one from the Button parser. */
export function compileWireClause(raw) {
  const t = raw.trim().toLowerCase().replace(/[“”"'*]/g, '').replace(/\.$/, '').replace(/^(?:if|when)\s+/, '').replace(/^the\s+/, '');
  let m;
  if (!t) return null;
  if (/^(?:otherwise|else|in all other cases|any other case|none of the above)/.test(t)) return { desc: 'otherwise', eval: () => true };
  const count = (c, col) => c.wires.filter(w => w === col).length;
  const n = '(no|none|zero|one|a|an|single|two|three|four|five|six|\\d+)';
  // "there are no yellow wires", "no red wires", "there is exactly one blue wire", "there is one red wire"
  if ((m = t.match(new RegExp(`^(?:there\\s+(?:are|is)\\s+)?(exactly\\s+|only\\s+)?${n}\\s+${COL}\\s+wires?(?:\\s+(?:present|on\\s+the\\s+module))?$`)))) {
    const k = toNum(m[2]), col = m[3];
    return { desc: k === 0 ? `no ${col} wires` : `exactly ${k} ${col}`, eval: c => count(c, col) === k };
  }
  // "more than one", "at least two", "at most one", "fewer / less than two"
  if ((m = t.match(new RegExp(`^(?:there\\s+(?:are|is)\\s+)?(more\\s+than|at\\s+least|at\\s+most|fewer\\s+than|less\\s+than|over|under)\\s+${n}\\s+${COL}\\s+wires?$`)))) {
    const k = toNum(m[2]), col = m[3], op = m[1].replace(/\s+/g, ' ');
    const test = { 'more than': (a) => a > k, over: (a) => a > k, 'at least': (a) => a >= k, 'at most': (a) => a <= k, 'fewer than': (a) => a < k, 'less than': (a) => a < k, under: (a) => a < k }[op];
    return { desc: `${op} ${k} ${col}`, eval: c => test(count(c, col)) };
  }
  // "there are no red or blue wires"? rare; "the number of red wires is even / odd"
  if ((m = t.match(new RegExp(`^(?:number|count)\\s+of\\s+${COL}\\s+wires\\s+is\\s+(odd|even)$`)))) {
    const col = m[1], odd = m[2] === 'odd';
    return { desc: `${col} count ${m[2]}`, eval: c => (count(c, col) % 2 === 1) === odd };
  }
  // "more red wires than blue wires"
  if ((m = t.match(new RegExp(`^(?:there\\s+are\\s+)?(more|fewer|less)\\s+${COL}\\s+wires\\s+than\\s+${COL}(?:\\s+wires)?$`)))) {
    const a = m[2], b = m[3], more = m[1] === 'more';
    return { desc: `${more ? 'more' : 'fewer'} ${a} than ${b}`, eval: c => (more ? count(c, a) > count(c, b) : count(c, a) < count(c, b)) };
  }
  // "the last wire is white", "the first wire is not red", "the second wire is red or blue"
  if ((m = t.match(new RegExp(`^(first|second|third|fourth|fifth|sixth|last|\\d)(?:st|nd|rd|th)?\\s+wire\\s+is\\s+(not\\s+)?(?:a\\s+)?${COL}((?:\\s*(?:,|or)\\s*${COL})*)(?:\\s+wire)?$`)))) {
    const pos = ordOf(m[1]), neg = !!m[2], cols = [m[3], ...(m[4].match(/red|white|blue|yellow|black/g) || [])];
    return { desc: `${ordWord(pos)} wire ${neg ? '≠' : '='} ${cols.join(' / ')}`, eval: c => { const w = c.wires[pos === 'last' ? c.wires.length - 1 : pos - 1]; return w ? cols.includes(w) !== neg : false; } };
  }
  // anything about the serial (the Button checklist's parser knows them all)
  const sc = compileClause(t);
  if (sc && sc.kind === 'serial') return { desc: sc.desc, serial: true, eval: c => sc.eval({ serial: c.serial }) };
  return { desc: raw.trim(), unknown: true, eval: () => null };
}

/** "cut the second wire" / "cut the last red wire" / "cut wire 3" → { desc, pick(wires) → 0-based index | -1 } */
export function compileCut(raw) {
  const t = raw.trim().toLowerCase().replace(/[“”"'*]/g, '').replace(/\.$/, '');
  let m;
  if ((m = t.match(new RegExp(`(?:cut|snip)\\s+(?:the\\s+)?(first|second|third|fourth|fifth|sixth|last|\\d)(?:st|nd|rd|th)?\\s+${COL}\\s+wire`)))) {
    const which = ordOf(m[1]), col = m[2];
    return { desc: `${ordWord(which)} ${col} wire`, pick: (ws) => { const idx = ws.map((w, i) => (w === col ? i : -1)).filter(i => i >= 0); return idx.length ? (which === 'last' ? idx[idx.length - 1] : idx[which - 1] ?? -1) : -1; } };
  }
  if ((m = t.match(/(?:cut|snip)\s+(?:the\s+)?(first|second|third|fourth|fifth|sixth|last|\d)(?:st|nd|rd|th)?\s+wire/)) || (m = t.match(/(?:cut|snip)\s+wire\s+(?:number\s+|#)?(\d)/))) {
    const which = ordOf(m[1]);
    return { desc: `${ordWord(which)} wire`, pick: (ws) => (which === 'last' ? ws.length - 1 : which - 1 < ws.length ? which - 1 : -1) };
  }
  return null;
}

/**
 * The pasted manual → { sections: { 3: [rule], 4: …, 5: …, 6: … }, unclear: [line] }.
 * rule: { n, text, clauses, cut }. Headers: "3 wires:", "Three wires", "4-wire", "For 5 wires".
 */
export function parseWiresManual(text) {
  const sections = {};
  const unclear = [];
  let cur = null;
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  for (let raw of lines) {
    let line = raw.replace(/[*_`#>]/g, '').replace(/^\s*(?:[-•–]|\d+[.)])\s+/, '').trim();
    if (!line) continue;
    const head = line.match(/^(?:for\s+|if\s+there\s+are\s+|section\s*:?\s*)?(3|4|5|6|three|four|five|six)[\s-]*wires?\b(?:\s+(?:module|section|rules))?\s*[:.\-–—]?\s*(.*)$/i);
    if (head) {
      cur = toNum(head[1].toLowerCase());
      sections[cur] = sections[cur] || [];
      line = head[2].trim();
      if (!line) continue;
    }
    if (!cur) continue;
    // split into condition(s) and the cut
    const body = line.replace(/^otherwise\s*[,:]?\s*(?=if\b|when\b)/i, '');
    let cond = null, cut = null, m;
    if ((m = body.match(/^(?:if|when)\s+(.+?)\s*(?:,|:|→|->|=>|\s-\s|\bthen\b)\s*(?:then\s+)?((?:cut|snip)\b.+)$/i))) { cond = m[1]; cut = m[2]; }
    else if ((m = body.match(/^((?:cut|snip)\b.+?)\s+(?:if|when)\s+(.+)$/i))) { cut = m[1]; cond = m[2]; }
    else if ((m = body.match(/^(?:otherwise|else|in all other cases)\s*[,:]?\s*((?:cut|snip)\b.+)$/i))) { cond = 'otherwise'; cut = m[1]; }
    else if ((m = body.match(/^(.+?)\s*(?::|→|->|=>)\s*((?:cut|snip)\b.+)$/i))) { cond = m[1]; cut = m[2]; }
    else { unclear.push(raw.trim()); continue; }
    const clauses = cond.split(/\s*,?\s+and\s+|\s*;\s*/i).map(compileWireClause).filter(Boolean);
    const c = compileCut(cut);
    const rule = { n: sections[cur].length + 1, text: line, clauses, cut: c };
    sections[cur].push(rule);
    if (!c || clauses.some(x => x.unknown)) unclear.push(raw.trim());
  }
  return { sections, unclear };
}

/**
 * wires: colours left → right. → { rows, match, blocked, cut (0-based) }
 * rows: per rule { rule, vals (per clause true/false/null), result true/false/null }.
 * match: the first rule that is true while every rule above it is false; blocked: the first rule
 * that can't be decided (a fact missing, a clause not understood).
 */
export function solveWires(parsed, wires, serial) {
  const list = (parsed && parsed.sections && parsed.sections[wires.length]) || [];
  const ctx = { wires, serial };
  const rows = [];
  let match = null, blocked = null;
  for (const rule of list) {
    const vals = rule.clauses.map(c => c.eval(ctx));
    const result = vals.some(v => v === false) ? false : vals.every(v => v === true) ? true : null;
    rows.push({ rule, vals, result });
    if (match || blocked) continue;
    if (result === true) match = rule;
    else if (result === null) blocked = rule;
  }
  const cut = match && match.cut ? match.cut.pick(wires) : -1;
  return { rows, match, blocked, cut, section: list.length ? wires.length : null };
}
