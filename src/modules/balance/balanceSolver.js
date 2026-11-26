// Balance — chemical equation parser and exact balancer.
// Coefficients are found as the integer null-space vector of the element matrix,
// using exact BigInt fractions, then reduced to simplest form.

export const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr '
  + 'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg '
  + 'Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' '));

const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SUP = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g;
const ARROW_RE = /\s*(?:<=>|<->|⇌|⇄|⟶|⟹|→|⇒|➔|➜|➝|-+>|=+>|—+>|–+>|—|–|=)\s*/;

// Elements a balancing puzzle won't use (lanthanides, actinides, rare metals). A picture read with one
// of them is a misread letter ("Nd" for "Na"): such a reading isn't taken, only offered as doubtful.
// Typing them by hand still works.
export const RARE_ELEMENTS = new Set(('Sc Ga Ge Y Zr Nb Tc Ru Rh Pd Cd In Te La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta Re Os Ir Tl Po At Fr Ac '
  + 'Th Pa Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' '));

export const SAMPLE_EQUATION = 'KNO3 → KNO2 + O2';

/** Normalise typed/OCR'd text: unicode subscripts, arrows, stray spaces. */
export function normalizeEquation(text) {
  return String(text || '')
    .replace(/[₀-₉]/g, c => SUB[c])
    .replace(SUP, '')
    .replace(/[·•∙*]/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeCounts(into, from, mult) {
  for (const [el, n] of Object.entries(from)) into[el] = (into[el] || 0) + n * mult;
}

/**
 * Parse one formula (e.g. "Ca(OH)2", "CuSO4.5H2O", "2H2O") into element counts.
 * A leading coefficient is returned separately and ignored for balancing.
 */
export function parseFormula(raw) {
  let s = raw.trim();
  const lead = s.match(/^(\d+)\s*(?=[A-Z(\[])/);
  let given = 1;
  if (lead) { given = Number(lead[1]); s = s.slice(lead[0].length); }
  if (!s) throw new Error(`empty formula "${raw}"`);

  const parts = s.split('.');
  const total = {};
  for (let part of parts) {
    let mult = 1;
    const hm = part.match(/^(\d+)(?=[A-Z(\[])/);
    if (hm) { mult = Number(hm[1]); part = part.slice(hm[0].length); }
    let i = 0;
    const group = () => {
      const counts = {};
      while (i < part.length) {
        const ch = part[i];
        if (ch === '(' || ch === '[' || ch === '{') {
          i++;
          const inner = group();
          if (!/[)\]}]/.test(part[i] || '')) throw new Error(`missing ")" in "${raw}"`);
          i++;
          const n = readNum();
          mergeCounts(counts, inner, n);
        } else if (ch === ')' || ch === ']' || ch === '}') {
          return counts;
        } else if (/[A-Z]/.test(ch)) {
          let sym = ch; i++;
          if (/[a-z]/.test(part[i] || '') && ELEMENTS.has(ch + part[i])) { sym += part[i]; i++; }
          else if (/[a-z]/.test(part[i] || '') && !ELEMENTS.has(sym)) { sym += part[i]; i++; }
          if (!ELEMENTS.has(sym)) throw new Error(`unknown element "${sym}" in "${raw}"`);
          const n = readNum();
          counts[sym] = (counts[sym] || 0) + n;
        } else if (/\s/.test(ch)) {
          i++;
        } else {
          throw new Error(`unexpected "${ch}" in "${raw}"`);
        }
      }
      return counts;
    };
    const readNum = () => {
      const m = part.slice(i).match(/^\d+/);
      if (!m) return 1;
      i += m[0].length;
      return Number(m[0]);
    };
    const c = group();
    if (i < part.length) throw new Error(`unexpected "${part[i]}" in "${raw}"`);
    mergeCounts(total, c, mult);
  }
  if (!Object.keys(total).length) throw new Error(`no elements in "${raw}"`);
  return { formula: s, counts: total, given };
}

/** Split an equation into reactant and product formula strings. */
export function splitEquation(text) {
  const t = normalizeEquation(text);
  const m = t.match(ARROW_RE);
  if (!m) throw new Error('no arrow found (use → or ->)');
  const left = t.slice(0, m.index), right = t.slice(m.index + m[0].length);
  const side = s => s.split(/\s+\+\s+|\s*\+\s*(?=\d*\s*[A-Z(\[])/).map(x => x.trim()).filter(Boolean);
  const reactants = side(left), products = side(right);
  if (!reactants.length || !products.length) throw new Error('need species on both sides of the arrow');
  return { reactants, products };
}

// ── exact rational arithmetic with BigInt ──
const babs = (a) => (a < 0n ? -a : a);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const frac = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = bgcd(n, d) || 1n; return [n / g, d / g]; };
const fsub = (a, b) => frac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const fmul = (a, b) => frac(a[0] * b[0], a[1] * b[1]);
const fdiv = (a, b) => frac(a[0] * b[1], a[1] * b[0]);

/** Null space basis of an integer matrix (rows × cols) via exact RREF. */
function nullSpace(M, cols) {
  const A = M.map(r => r.map(v => frac(BigInt(v))));
  const rows = A.length;
  const pivots = [];
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let p = -1;
    for (let k = r; k < rows; k++) if (A[k][c][0] !== 0n) { p = k; break; }
    if (p < 0) continue;
    [A[r], A[p]] = [A[p], A[r]];
    const pv = A[r][c];
    A[r] = A[r].map(x => fdiv(x, pv));
    for (let k = 0; k < rows; k++) {
      if (k === r || A[k][c][0] === 0n) continue;
      const f = A[k][c];
      A[k] = A[k].map((x, j) => fsub(x, fmul(f, A[r][j])));
    }
    pivots.push(c);
    r++;
  }
  const free = [];
  for (let c = 0; c < cols; c++) if (!pivots.includes(c)) free.push(c);
  return free.map(fc => {
    const v = Array.from({ length: cols }, () => frac(0n));
    v[fc] = frac(1n);
    pivots.forEach((pc, i) => { v[pc] = frac(-A[i][fc][0], A[i][fc][1]); });
    return v;
  });
}

function toIntegers(v) {
  let l = 1n;
  v.forEach(([, d]) => { l = (l * d) / bgcd(l, d); });
  let ints = v.map(([n, d]) => (n * l) / d);
  const g = ints.reduce((a, b) => bgcd(a, b), 0n) || 1n;
  ints = ints.map(x => x / g);
  if (ints.every(x => x <= 0n)) ints = ints.map(x => -x);
  return ints;
}

/**
 * Balance an equation string.
 * @returns {{ ok, coefficients:number[], species, elements, balanced:string, answer:string, error? }}
 */
export function balanceEquation(text) {
  let reactants, products;
  try {
    ({ reactants, products } = splitEquation(text));
  } catch (e) {
    return { ok: false, error: e.message };
  }
  let species;
  try {
    species = [...reactants.map(f => ({ ...parseFormula(f), side: 'L' })), ...products.map(f => ({ ...parseFormula(f), side: 'R' }))];
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const elements = Array.from(new Set(species.flatMap(s => Object.keys(s.counts))));
  const leftEls = new Set(species.filter(s => s.side === 'L').flatMap(s => Object.keys(s.counts)));
  const rightEls = new Set(species.filter(s => s.side === 'R').flatMap(s => Object.keys(s.counts)));
  const oneSided = elements.filter(e => !leftEls.has(e) || !rightEls.has(e));
  if (oneSided.length) return { ok: false, species, elements, error: `${oneSided.join(', ')} only appears on one side — check the equation` };

  const M = elements.map(el => species.map(s => (s.side === 'L' ? 1 : -1) * (s.counts[el] || 0)));
  const basis = nullSpace(M, species.length);
  if (!basis.length) return { ok: false, species, elements, error: 'this equation cannot be balanced' };

  let ints = null;
  if (basis.length === 1) {
    ints = toIntegers(basis[0]);
  } else {
    // Several independent reactions mixed together: take the smallest all-positive combination we can find
    let sum = basis[0].map(() => frac(0n));
    basis.forEach(b => { sum = sum.map((x, i) => frac(x[0] * b[i][1] + b[i][0] * x[1], x[1] * b[i][1])); });
    ints = toIntegers(sum);
  }
  if (ints.some(x => x <= 0n)) return { ok: false, species, elements, error: 'no all-positive solution — check the formulas' };

  const coefficients = ints.map(Number);
  const fmt = (s, i) => `${coefficients[i]} ${s.formula}`;
  const L = species.map((s, i) => (s.side === 'L' ? fmt(s, i) : null)).filter(Boolean);
  const R = species.map((s, i) => (s.side === 'R' ? fmt(s, i) : null)).filter(Boolean);
  const tallies = elements.map(el => ({
    el,
    left: species.reduce((a, s, i) => a + (s.side === 'L' ? (s.counts[el] || 0) * coefficients[i] : 0), 0),
    right: species.reduce((a, s, i) => a + (s.side === 'R' ? (s.counts[el] || 0) * coefficients[i] : 0), 0)
  }));
  return {
    ok: true,
    coefficients,
    species,
    elements,
    tallies,
    ambiguous: basis.length > 1,
    balanced: `${L.join(' + ')} → ${R.join(' + ')}`,
    answer: coefficients.join(' ')
  };
}

/**
 * Clean up OCR text of one side of an equation, e.g. "KN03" → "KNO3", "02" → "O2",
 * "CI2" → "Cl2". Uses the periodic table to decide.
 */
export function fixOcrFormulaSide(text, { keepUnknown = false } = {}) {
  // keepUnknown: leave "?" (a glyph OCR couldn't read) in place for repairEquation to fill
  let s = String(text || '').replace(/[₀-₉]/g, c => SUB[c]).replace(keepUnknown ? /[^A-Za-z0-9()+\[\]. ?]/g : /[^A-Za-z0-9()+\[\]. ]/g, '').trim();
  // "0" not preceded by a digit is the letter O (subscripts never start with 0)
  s = s.replace(/(^|[^0-9])0/g, '$1O');
  // no element symbol has a lowercase z, and a capital Z only starts Zn / Zr: it's a "2" ("Oz" → "O2")
  s = s.replace(/z/g, '2').replace(/Z(?![nr])/g, '2');
  // "I" / "1" before a lowercase letter it can't take is an "L" whose foot was cut off ("Ii" → "Li")
  s = s.replace(/(^|[^A-Za-z])[Il1|]([a-z])/g, (m, pre, b) => (!ELEMENTS.has('I' + b) && ELEMENTS.has('L' + b) ? pre + 'L' + b : m));
  // "I"/"l"/"1" confusion after an uppercase letter: prefer a real two-letter element
  s = s.replace(/([A-Z])[Il|]/g, (m, a) => (ELEMENTS.has(a + 'l') && !ELEMENTS.has(a + 'I'.toLowerCase()) ? a + 'l' : m));
  // Pipe characters are almost always a "1" or "l"
  s = s.replace(/\|/g, 'l');
  // a lowercase "l" can only follow an uppercase letter (Cl, Al…); on its own it is iodine "I"
  s = s.replace(/(^|[^A-Za-z])l/g, '$1I');
  // a symbol has at most two letters: a lowercase letter after a whole two-letter one starts the next
  // ("Srcl2" → "SrCl2", "Cuo" → "CuO"; an "l" there is the capital I: "Nal" → "NaI"). Not s / g / z /
  // b / q: after a symbol those are mostly a small digit misread ("Nas" = "Na₃"), left for the repair.
  s = s.replace(/([A-Z][a-z])([a-z])/g, (m, ab, c) => (ELEMENTS.has(ab) && !'sgzbq'.includes(c) ? ab + (c === 'l' ? 'I' : c.toUpperCase()) : m));
  // Wrong case on the 2nd letter: "FE" → "Fe", "NA" → "Na" (E/A aren't elements, Fe/Na are)
  // (each pair on its own: in "HCL" the "HC" pair must not hide the "CL" one)
  s = [...s].map((ch, i, arr) => {
    const a = arr[i - 1], next = arr[i + 1];
    const pair = /[A-Z]/.test(ch) && a && /[A-Z]/.test(a) && !(next && /[a-z]/.test(next));
    return pair && !ELEMENTS.has(ch) && ELEMENTS.has(a + ch.toLowerCase()) ? ch.toLowerCase() : ch;
  }).join('');
  // an "i" whose dot was lost reads as "r": "Tr" / "Nr" aren't elements, Ti / Ni are (Lr is, but no puzzle has it)
  s = s.replace(/([A-Z])r/g, (m, a) => ((!ELEMENTS.has(a + 'r') || RARE_ELEMENTS.has(a + 'r')) && ELEMENTS.has(a + 'i') ? a + 'i' : m));
  // spaces inside a formula: "KNO 3" → "KNO3"; keep " + " separators
  s = s.replace(/\s*\+\s*/g, ' + ').replace(/([A-Za-z0-9)\]])\s+(?=[0-9a-z)])/g, '$1');
  return s;
}

/**
 * A reading of a picture that balances — and could be printed. OCR noise can balance too: a written
 * subscript 1 ("HCl1", "CH1": a 1 is never written, it was another digit or a stray stroke), a
 * count of 3+ digits ("Al45043"), or coefficients no puzzle has (huge counts balance only that way).
 */
export function readsBalanced(text) {
  return printable(text, balanceEquation(text));
}
function printable(text, r) {
  if (!r.ok) return false;
  const t = normalizeEquation(text);
  if (/[A-Za-z)\]]1(?![0-9])/.test(t) || /[0-9]{3,}/.test(t)) return false;
  // a count never starts with 0, and puzzles stay well under 40 of an atom ("SO44": a wide "₄" split in two)
  if (/[A-Za-z)\]]0/.test(t) || /(^|[\s+→])0/.test(t) || (t.match(/[A-Za-z)\]][0-9]+/g) || []).some(m => Number(m.slice(1)) > 40)) return false;
  // one symbol twice running, then a count: "OO2" (an extra "O" read off the edge of a "₂")
  if (/([A-Z][a-z]?)\1(?![a-z])[0-9]/.test(t)) return false;
  // brackets hold a group of elements (NO₃, SO₄, OH), never one element: "PbN(O3)2" was "Pb(NO₃)₂"
  if (/\([A-Z][a-z]?[0-9]*\)/.test(t)) return false;
  // past 12, only C / H / O come in such numbers (C₁₂H₂₂O₁₁): "Al20O3" was "Al₂O₃" with a stray stroke
  if (r.species.some(sp => Object.entries(sp.counts).some(([el, n]) => n > 12 && !['C', 'H', 'O'].includes(el)))) return false;
  // an element no balancing puzzle uses is a misread letter: "Nd" for "Na", "Cd" for "Ca"
  if (r.elements.some(e => RARE_ELEMENTS.has(e))) return false;
  // an element on its own comes as H₂, O₃, P₄, S₈ — "Cl12" was "Cl₂" with a stray stroke
  if (r.species.some(sp => { const els = Object.keys(sp.counts); return els.length === 1 && ![1, 2, 3, 4, 8].includes(sp.counts[els[0]]); })) return false;
  return r.coefficients.every(c => c <= 99);
}

// ── OCR repair: what a misread character may really be ──
// Small bold subscripts come back as letters (₃ → "S", "s", "g"), digits swap with look-alikes and
// a glyph OCR couldn't read at all is "?".
const OCR_ALTERNATIVES = {
  S: '35', s: '35', g: '39', B: '83', Z: '2', z: '2', G: '6', b: '6', q: '9', A: '4', T: '7',
  O: '0', o: '0', D: 'OP', Q: 'O', I: '1l', l: '1I', 1: 'lI', t: 'l', 3: '8', 8: '3', 6: '8', 5: '3', '?': '23456789',
  d: 'a', // a bold "a" read as "d": "Nd" / "Cd" for Na / Ca
  0: 'O', // "H20" after a subscript: fixOcrFormulaSide keeps a 0 that follows a digit (C10H22 is real)
};

/** Elements in one side ("AlCl3 + Na3PO4" → "Al,Cl,Na,O,P"), or null when a formula doesn't parse. */
function sideElements(side) {
  try {
    const terms = side.split(/\s*\+\s*/).map(t => t.trim()).filter(Boolean);
    if (!terms.length) return null;
    const els = new Set();
    for (const t of terms) Object.keys(parseFormula(t).counts).forEach(e => els.add(e));
    return [...els].sort().join(',');
  } catch (e) {
    return null;
  }
}

/** Readings of one side within `maxEdits` changes: swapped characters, a "?" filled or dropped, a missing bracket. */
function sideVariants(side, maxEdits) {
  const out = new Map();
  const add = (t, e) => { if (!out.has(t) || out.get(t) > e) out.set(t, e); };
  const walk = (t, from, e) => {
    add(t, e);
    if (e >= maxEdits) return;
    for (let i = from; i < t.length; i++) {
      const alts = OCR_ALTERNATIVES[t[i]];
      if (!alts) continue;
      for (const a of alts) walk(t.slice(0, i) + a + t.slice(i + 1), i + 1, e + 1);
      if (t[i] === '?') walk(t.slice(0, i) + t.slice(i + 1), i, e + 1);
    }
  };
  walk(side, 0, 0);
  // a bracket OCR lost: "AlNO3)3" → "Al(NO3)3" (an extra "(" anywhere before an unmatched ")", or the reverse)
  for (const [t, e] of [...out]) {
    if (e >= maxEdits) continue;
    let depth = 0, open = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') { depth++; open = i; }
      else if (t[i] === ')') {
        if (depth) { depth--; continue; }
        const start = t.lastIndexOf('+', i) + 1;
        // at the start of a formula it's real but rarer ("(NH4)2SO4"): it costs two changes there,
        // so "Al(NO3)3" beats "(AlNO3)3", which balances too
        for (let k = start; k < i; k++) {
          if (!/[A-Z]/.test(t[k])) continue;
          const cost = /^\s*$/.test(t.slice(start, k)) ? 2 : 1;
          if (e + cost <= maxEdits) add(t.slice(0, k) + '(' + t.slice(k), e + cost);
        }
        break;
      }
    }
    if (depth === 1 && open >= 0) {
      const end = t.indexOf('+', open) < 0 ? t.length : t.indexOf('+', open);
      for (let k = open + 2; k <= end; k++) add(t.slice(0, k).replace(/\s+$/, '') + ')' + t.slice(k), e + 1);
    }
  }
  return out;
}

/**
 * OCR readings of each side (most trusted first) → the reading that balances with the fewest
 * changes (at most `maxEdits` over both sides), or null. Sides from different readings can be
 * paired: one may get the left side right and another the right side. Only one clear balance
 * counts (not a mix of reactions), and both sides must hold the same elements. When different
 * answers tie (as few changes, from readings as trusted) it's a guess, not a reading
 * (C?H? + O2 → CO2 + H2O balances for any digits), so nothing is returned.
 * `accept(equation)`: the caller's own check (the reader's: no subscript it saw went missing).
 * → { equation, edits }
 */
export function repairEquation(lefts, rights, maxEdits = 2, accept = () => true) {
  const collect = (list) => {
    const m = new Map();
    list.filter(Boolean).forEach((side, rank) => {
      for (const [t, e] of sideVariants(side, maxEdits)) {
        const prev = m.get(t);
        if (prev && (prev.e < e || (prev.e === e && prev.rank <= rank))) continue;
        const key = sideElements(t);
        if (key) m.set(t, { t, e, rank, key });
      }
    });
    return [...m.values()];
  };
  const L = collect(lefts), R = collect(rights);
  const byKey = new Map();
  for (const r of R) { if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key).push(r); }
  const pairs = [];
  for (const l of L) for (const r of byKey.get(l.key) || []) if (l.e + r.e <= maxEdits) pairs.push([l, r]);
  pairs.sort((a, b) => (a[0].e + a[1].e) - (b[0].e + b[1].e) || (a[0].rank + a[1].rank) - (b[0].rank + b[1].rank));
  let found = null;
  for (const [l, r] of pairs) {
    const edits = l.e + r.e, rank = l.rank + r.rank;
    if (found && (edits > found.edits || rank > found.rank)) break;
    const equation = `${l.t.replace(/\s*\+\s*/g, ' + ')} → ${r.t.replace(/\s*\+\s*/g, ' + ')}`;
    const res = balanceEquation(equation);
    if (!printable(equation, res) || res.ambiguous || !accept(equation)) continue;
    if (!found) found = { equation, edits, rank };
    else if (found.equation !== equation) return null; // two different answers just as likely
  }
  return found && { equation: found.equation, edits: found.edits };
}
