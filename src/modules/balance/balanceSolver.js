// Balance — chemical equation parser and exact balancer.
// Coefficients are found as the integer null-space vector of the element matrix,
// using exact BigInt fractions, then reduced to simplest form.

export const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr '
  + 'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg '
  + 'Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' '));

const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SUP = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g;
const ARROW_RE = /\s*(?:<=>|<->|⇌|⇄|⟶|⟹|→|⇒|➔|➜|➝|-+>|=+>|—+>|–+>|—|–|=)\s*/;

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
export function fixOcrFormulaSide(text) {
  let s = String(text || '').replace(/[₀-₉]/g, c => SUB[c]).replace(/[^A-Za-z0-9()+\[\]. ]/g, '').trim();
  // "0" not preceded by a digit is the letter O (subscripts never start with 0)
  s = s.replace(/(^|[^0-9])0/g, '$1O');
  // "I"/"l"/"1" confusion after an uppercase letter: prefer a real two-letter element
  s = s.replace(/([A-Z])[Il|]/g, (m, a) => (ELEMENTS.has(a + 'l') && !ELEMENTS.has(a + 'I'.toLowerCase()) ? a + 'l' : m));
  // Pipe characters are almost always a "1" or "l"
  s = s.replace(/\|/g, 'l');
  // Wrong case on the 2nd letter: "FE" → "Fe", "NA" → "Na" (E/A aren't elements, Fe/Na are)
  s = s.replace(/([A-Z])([A-Z])(?![a-z])/g, (m, a, b) => (!ELEMENTS.has(b) && ELEMENTS.has(a + b.toLowerCase()) ? a + b.toLowerCase() : m));
  // spaces inside a formula: "KNO 3" → "KNO3"; keep " + " separators
  s = s.replace(/\s*\+\s*/g, ' + ').replace(/([A-Za-z0-9)\]])\s+(?=[0-9a-z)])/g, '$1');
  return s;
}
