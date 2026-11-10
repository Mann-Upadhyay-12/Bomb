// The Button — checklist parser + rule evaluator.
//
// The checklist changes every round, so instead of hard-coding rules we parse each
// pasted line of the form "<conditions>: <N>s" (with or without "**" and "1." numbering)
// into clauses, and evaluate them against the bomb facts. "Use the first matching rule".

export const BUTTON_COLORS = ['white', 'blue', 'yellow', 'red', 'green', 'black', 'purple', 'orange'];
export const DEFAULT_LABELS = ['BLUE', 'WHITE', 'RED', 'YELLOW', 'GREEN', 'HOLD', 'PUNCH', 'PRESS', 'ABORT', 'DETONATE', 'TAP', 'PURPLE', 'ORANGE', 'BLACK'];

export const SAMPLE_CHECKLIST = `Defuse 3 buttons in order. The physical color and written label are separate. Ask for both, plus the serial, total modules, non-needy modules, needy modules, and Button modules.

Use the first matching rule. Count from the top each time.

button is white and label says Blue: 3s
there is exactly 1 needy module, button is blue, and label says Hold: 11s
there are at least 2 needy modules, button is yellow, and label says Punch: 3s
rightmost serial digit is odd and button is white: 12s
serial digit sum is odd and label says Punch: 10s
serial repeats a character and button is white: 2s
serial has at least 2 vowels and button is green: 7s
serial has fewer than 2 vowels and label says Green: 4s
total module count is even and button is red: 6s
Otherwise: 7s

Serial: E1ZQGHV1`;

const NUM_WORDS = { zero: 0, no: 0, none: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toNum = (t) => (t in NUM_WORDS ? NUM_WORDS[t] : Number(t));
const NUM = '(\\d+|zero|no|none|one|a|an|two|three|four|five|six|seven|eight|nine|ten)';

/**
 * Parse a quantity phrase into a predicate on a number.
 * Handles: odd, even, N, exactly N, at least N, N or more, more/greater than N, over N,
 * fewer/less than N, under N, at most N, N or fewer/less, no/none/zero, a/an/any/some (≥1),
 * divisible by N, a multiple of N.
 */
export function parseQuantity(text) {
  const t = text.trim().toLowerCase().replace(/^(?:is|are|equals?|=)\s+/, '');
  let m;
  if (/^odd\b/.test(t)) return { test: n => Math.abs(n) % 2 === 1, desc: 'odd' };
  if (/^even\b/.test(t)) return { test: n => n % 2 === 0, desc: 'even' };
  if (/^(?:any|some|at least one|a|an)$/.test(t)) return { test: n => n >= 1, desc: '≥ 1' };
  if ((m = t.match(new RegExp(`^(?:divisible by|a multiple of)\\s+${NUM}$`)))) { const k = toNum(m[1]); return { test: n => k !== 0 && n % k === 0, desc: `multiple of ${k}` }; }
  if ((m = t.match(new RegExp(`^(?:at least|no fewer than|no less than|minimum of)\\s+${NUM}$`))) || (m = t.match(new RegExp(`^${NUM}\\s+or\\s+more$`)))) { const k = toNum(m[1]); return { test: n => n >= k, desc: `≥ ${k}` }; }
  if ((m = t.match(new RegExp(`^(?:more than|greater than|over|above|higher than)\\s+${NUM}$`)))) { const k = toNum(m[1]); return { test: n => n > k, desc: `> ${k}` }; }
  if ((m = t.match(new RegExp(`^(?:fewer than|less than|under|below|lower than)\\s+${NUM}$`)))) { const k = toNum(m[1]); return { test: n => n < k, desc: `< ${k}` }; }
  if ((m = t.match(new RegExp(`^(?:at most|no more than|maximum of)\\s+${NUM}$`))) || (m = t.match(new RegExp(`^${NUM}\\s+or\\s+(?:fewer|less)$`)))) { const k = toNum(m[1]); return { test: n => n <= k, desc: `≤ ${k}` }; }
  if ((m = t.match(new RegExp(`^(?:exactly|only|precisely)?\\s*${NUM}$`)))) { const k = toNum(m[1]); return { test: n => n === k, desc: `= ${k}` }; }
  if ((m = t.match(new RegExp(`^not\\s+${NUM}$`)))) { const k = toNum(m[1]); return { test: n => n !== k, desc: `≠ ${k}` }; }
  return null;
}

const serialDigits = (s) => (s.match(/\d/g) || []).map(Number);
const serialVowels = (s) => (s.toUpperCase().match(/[AEIOU]/g) || []).length;
const serialConsonants = (s) => (s.toUpperCase().match(/[B-DF-HJ-NP-TV-Z]/g) || []).length;
const serialLetters = (s) => (s.toUpperCase().match(/[A-Z]/g) || []).length;
const hasRepeat = (s) => { const c = s.toUpperCase().replace(/[^A-Z0-9]/g, ''); return new Set(c).size !== c.length; };

// Which bomb fact a "count" subject refers to (order matters: non-needy before needy)
function countSubject(t) {
  if (/non[-\s]?needy/.test(t)) return 'nonNeedy';
  if (/needy/.test(t)) return 'needy';
  if (/button/.test(t)) return 'buttonMods';
  if (/batter/.test(t)) return 'batteries';
  if (/modules?|module count/.test(t)) return 'total';
  return null;
}

export const FACT_LABELS = {
  nonNeedy: 'non-needy modules', needy: 'needy modules', buttonMods: 'Button modules',
  total: 'total modules', batteries: 'batteries'
};

/**
 * Compile one clause (e.g. "label says Punch") into { kind, desc, eval(ctx) → true|false|null }.
 * eval returns null when the needed fact hasn't been entered yet.
 */
export function compileClause(raw) {
  const t = raw.trim().toLowerCase().replace(/[“”"']/g, '').replace(/\.$/, '').replace(/^(?:if|when)\s+/, '').replace(/^the\s+/, '');
  let m;
  if (!t) return null;
  if (/^(?:otherwise|else|default|any other case|in all other cases|none of the above)/.test(t)) {
    return { kind: 'always', desc: 'otherwise', eval: () => true };
  }

  // Physical colour: "button is white", "button is not red", "button colour is blue", "the button is a green one"
  if ((m = t.match(/^button(?:'s)?\s+(?:colou?r\s+)?(?:is|=)\s+(not\s+)?(?:a\s+)?(\w+)(?:\s+button)?$/)) && (BUTTON_COLORS.includes(m[2]) || /^(?:colou?red\s+)?\w+$/.test(m[2]))) {
    const neg = !!m[1], col = m[2];
    return { kind: 'color', desc: `button ${neg ? '≠' : '='} ${col}`, eval: c => (c.color ? (c.color === col) !== neg : null) };
  }
  if ((m = t.match(/^(\w+)\s+button$/)) && BUTTON_COLORS.includes(m[1])) {
    const col = m[1];
    return { kind: 'color', desc: `button = ${col}`, eval: c => (c.color ? c.color === col : null) };
  }

  // Label: "label says Hold", "label reads Abort", "label is not Press", "label does not say Blue"
  if ((m = t.match(/^(?:button\s+)?(?:label|text|word)\s+(?:(does\s+not|doesnt|doesn't)\s+(?:say|read)|says|reads|is|=)\s+(not\s+)?(.+)$/))) {
    const neg = !!(m[1] || m[2]), word = m[3].trim().toUpperCase();
    return { kind: 'label', word, desc: `label ${neg ? '≠' : '='} ${word}`, eval: c => (c.label ? (c.label.toUpperCase() === word) !== neg : null) };
  }

  // Serial digit position: "rightmost serial digit is odd", "last digit of the serial is even", "first serial digit is 5"
  if ((m = t.match(/^(rightmost|last|final|leftmost|first|largest|highest|biggest|smallest|lowest)\s+(?:serial(?:\s+number)?\s+digit|digit\s+(?:of|in)\s+(?:the\s+)?serial(?:\s+number)?)\s+(?:is\s+)?(.+)$/))) {
    const pos = m[1], q = parseQuantity(m[2]);
    if (q) {
      const pick = (d) => (/right|last|final/.test(pos) ? d[d.length - 1] : /left|first/.test(pos) ? d[0] : /large|high|big/.test(pos) ? Math.max(...d) : Math.min(...d));
      return { kind: 'serial', desc: `${pos} serial digit ${q.desc}`, eval: c => { if (!c.serial) return null; const d = serialDigits(c.serial); return d.length ? q.test(pick(d)) : false; } };
    }
  }
  if ((m = t.match(/^serial(?:\s+number)?\s+ends\s+(?:with|in)\s+(?:an?\s+)?(odd|even)(?:\s+(?:digit|number))?$/))) {
    const q = parseQuantity(m[1]);
    return { kind: 'serial', desc: `last serial digit ${q.desc}`, eval: c => { if (!c.serial) return null; const d = serialDigits(c.serial); return d.length ? q.test(d[d.length - 1]) : false; } };
  }

  // Digit sum: "serial digit sum is odd", "sum of the serial digits is at least 10"
  if ((m = t.match(/^(?:serial(?:\s+number)?\s+digit\s+sum|sum\s+of\s+(?:the\s+)?(?:serial(?:\s+number)?\s+)?digits(?:\s+(?:in|of)\s+(?:the\s+)?serial(?:\s+number)?)?)\s+(?:is\s+)?(.+)$/))) {
    const q = parseQuantity(m[1]);
    if (q) return { kind: 'serial', desc: `serial digit sum ${q.desc}`, eval: c => (c.serial ? q.test(serialDigits(c.serial).reduce((a, b) => a + b, 0)) : null) };
  }

  // Repeated characters
  if (/^serial(?:\s+number)?\s+(?:repeats\s+(?:a|any)\s+(?:character|letter|digit|symbol)|has\s+(?:a\s+|any\s+)?(?:repeated|repeating|duplicate|duplicated)\s+(?:character|letter|digit|symbol)s?|contains\s+(?:a\s+)?(?:repeated|duplicate)\s+(?:character|letter|digit)s?)$/.test(t)) {
    return { kind: 'serial', desc: 'serial repeats a character', eval: c => (c.serial ? hasRepeat(c.serial) : null) };
  }
  if (/^serial(?:\s+number)?\s+(?:does\s+not|doesnt|doesn't)\s+repeat\s+(?:a|any)\s+(?:character|letter|digit)s?$|^serial(?:\s+number)?\s+has\s+no\s+(?:repeated|repeating|duplicate)\s+(?:character|letter|digit)s?$/.test(t)) {
    return { kind: 'serial', desc: 'serial has no repeats', eval: c => (c.serial ? !hasRepeat(c.serial) : null) };
  }

  // Vowels / consonants / letters / digits: "serial has at least 2 vowels", "serial contains a vowel", "serial has no vowels"
  if ((m = t.match(/^serial(?:\s+number)?\s+(?:has|contains|includes)\s+(.+?)\s+(vowels?|consonants?|letters?|digits?|numbers?)$/))) {
    const q = parseQuantity(m[1]), what = m[2];
    if (q) {
      const fn = /vowel/.test(what) ? serialVowels : /consonant/.test(what) ? serialConsonants : /letter/.test(what) ? serialLetters : (s) => serialDigits(s).length;
      return { kind: 'serial', desc: `serial ${what.replace(/s$/, '')}s ${q.desc}`, eval: c => (c.serial ? q.test(fn(c.serial)) : null) };
    }
  }
  if ((m = t.match(/^serial(?:\s+number)?\s+(?:does\s+not|doesnt|doesn't)\s+(?:have|contain)\s+(?:a|any)\s+vowels?$/))) {
    return { kind: 'serial', desc: 'serial vowels = 0', eval: c => (c.serial ? serialVowels(c.serial) === 0 : null) };
  }
  // "serial contains (the letter|character) X"
  if ((m = t.match(/^serial(?:\s+number)?\s+(?:contains|has|includes)\s+(?:the\s+)?(?:letter|character|digit|number)?\s*([a-z0-9])$/))) {
    const ch = m[1].toUpperCase();
    return { kind: 'serial', desc: `serial contains ${ch}`, eval: c => (c.serial ? c.serial.toUpperCase().includes(ch) : null) };
  }

  // Module counts: "there is exactly 1 needy module", "there are at least 2 needy modules",
  // "total module count is even", "number of Button modules is 3", "no needy modules"
  if ((m = t.match(/^there\s+(?:is|are)\s+(.+?)\s+((?:non[-\s]?needy|needy|button|total|batter\w*)?\s*(?:modules?|batteries|battery)(?:\s+(?:on the bomb|in total))?)$/))
    || (m = t.match(/^(no|zero|exactly\s+\S+|at least\s+\S+|at most\s+\S+|more than\s+\S+|fewer than\s+\S+|less than\s+\S+|\d+|\S+\s+or\s+(?:more|fewer|less))\s+((?:non[-\s]?needy|needy|button|total)\s*modules?)$/))) {
    const q = parseQuantity(m[1]), subj = countSubject(m[2]);
    if (q && subj) return { kind: 'count', fact: subj, desc: `${FACT_LABELS[subj]} ${q.desc}`, eval: c => (Number.isFinite(c[subj]) ? q.test(c[subj]) : null) };
  }
  if ((m = t.match(/^(?:(?:the\s+)?(?:number|count|amount)\s+of\s+)?(.+?)(?:\s+count|\s+total)?\s+is\s+(.+)$/))) {
    const subj = countSubject(m[1]), q = parseQuantity(m[2]);
    if (subj && q) return { kind: 'count', fact: subj, desc: `${FACT_LABELS[subj]} ${q.desc}`, eval: c => (Number.isFinite(c[subj]) ? q.test(c[subj]) : null) };
  }

  return { kind: 'unknown', desc: raw.trim(), eval: () => null, unknown: true };
}

// Split "A, B, and C" / "A and B" into clauses
function splitClauses(cond) {
  return cond
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
    .map(s => s.trim())
    .filter(Boolean);
}

const RULE_RE = /^\s*(?:[-*•]\s*)?(?:\(?\d+[.)]\s*)?\**\s*(.+?)\s*\**\s*[:=–—-]+\s*\**\s*(\d+(?:\.\d+)?)\s*\**\s*(?:s|sec|secs|seconds?)\b\**\.?\s*$/i;

/**
 * Parse the pasted checklist.
 * @returns {{ rules: Array<{n, text, seconds, clauses}>, facts: object }}
 *   facts holds anything recognised in "Key: value" lines (serial, module counts).
 */
export function parseChecklist(text) {
  const rules = [];
  const facts = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/\*\*/g, '').replace(/ /g, ' ').trim();
    if (!line) continue;

    const fm = line.match(/^(serial(?:\s+number)?|total\s+modules?|modules?|non[-\s]?needy(?:\s+modules?)?|needy(?:\s+modules?)?|button\s+modules?|batter(?:y|ies))\s*[:=]\s*([A-Za-z0-9-]+)\s*$/i);
    if (fm) {
      const key = fm[1].toLowerCase();
      const val = fm[2];
      if (/serial/.test(key)) facts.serial = val.toUpperCase();
      else {
        const subj = /^modules?$/.test(key) ? 'total' : countSubject(key);
        if (subj && /^\d+$/.test(val)) facts[subj] = Number(val);
      }
      continue;
    }

    const rm = line.match(RULE_RE);
    if (!rm) continue;
    const cond = rm[1].replace(/^(?:if|when)\s+/i, '');
    const clauses = splitClauses(cond).map(compileClause).filter(Boolean);
    if (!clauses.length) continue;
    rules.push({ n: rules.length + 1, text: cond, seconds: Number(rm[2]), clauses });
  }
  return { rules, facts };
}

/**
 * Evaluate rules in order. A rule matches when every clause is true.
 * Returns per-rule status ('match' | 'no' | 'unknown') and the first match.
 * If an undecidable rule comes before the first match, `blocked` names it.
 */
export function evaluateRules(rules, ctx) {
  const rows = rules.map(r => {
    const vals = r.clauses.map(c => c.eval(ctx));
    let status;
    if (vals.some(v => v === false)) status = 'no';
    else if (vals.every(v => v === true)) status = 'match';
    else status = 'unknown';
    return { ...r, vals, status };
  });
  const firstMatch = rows.find(r => r.status === 'match') || null;
  const blocked = rows.find(r => r.status === 'unknown' && (!firstMatch || r.n < firstMatch.n)) || null;
  return { rows, match: blocked ? null : firstMatch, blocked, candidate: firstMatch };
}

/** Words the label could be: every "label says X" in the checklist + common defaults. */
export function labelVocab(rules) {
  const set = new Set(DEFAULT_LABELS);
  rules.forEach(r => r.clauses.forEach(c => { if (c.kind === 'label' && c.word) set.add(c.word); }));
  return Array.from(set);
}
