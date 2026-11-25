// Circuit — equivalent resistance between the two orange terminals.
// The manual maps resistor colours to ohms ("Red = 2 Ω" …). The circuit is solved by nodal analysis
// with exact fractions, so series, parallel, shorted corners and bridges all work the same way.

// An earlier game's table — the values change every game (read from the legend picture); the tests use it
import { discordPlain } from '../../utils/discordText.js';
export const CIRCUIT_DEFAULT_MANUAL = `Red = 2 Ω
Orange = 6 Ω
Yellow = 16 Ω
Green = 20 Ω
Blue = 4 Ω
Violet = 8 Ω
White = 10 Ω
Gray = 12 Ω`;

export const CIRCUIT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'white', 'gray'];
const ALIAS = { purple: 'violet', grey: 'gray', silver: 'gray' };

/** "Red = 2 Ω …" → { red: '2', … } (values kept as decimal strings for exact maths) */
export function parseCircuitManual(text) {
  text = discordPlain(text); // a phone copies Discord's **markup** too
  const out = {};
  const re = /\b([a-z]+)\s*[=:–-]\s*(\d+(?:\.\d+)?)/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const c = ALIAS[m[1].toLowerCase()] || m[1].toLowerCase();
    if (CIRCUIT_COLORS.includes(c)) out[c] = m[2];
  }
  return out;
}

// ---- exact fractions (BigInt) ----
const babs = a => (a < 0n ? -a : a);
const gcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a || 1n; };
const F = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); return [n / g, d / g]; };
const add = (a, b) => F(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a, b) => F(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a, b) => F(a[0] * b[0], a[1] * b[1]);
const div = (a, b) => F(a[0] * b[1], a[1] * b[0]);
const fromDecimal = (s) => {
  const [i, f = ''] = String(s).split('.');
  return F(BigInt(i + f), 10n ** BigInt(f.length));
};

/** Show a fraction: "32", "34/3 ≈ 11.33" */
export function formatOhms(fr) {
  const [n, d] = fr;
  const dec = Number(n) / Number(d);
  const short = String(Math.round(dec * 100) / 100);
  return { exact: d === 1n ? String(n) : `${n}/${d}`, decimal: short, isInteger: d === 1n, value: dec };
}

/**
 * @param resistors [{ a, b, color }]  a/b = node ids
 * @param A, B terminal node ids
 * @param manual { color: '8' }
 * @returns { ok, ohms: {exact, decimal, …}, error?, values: [ohms per resistor] }
 */
export function solveCircuit(resistors, A, B, manual) {
  const values = resistors.map(r => (manual[r.color] != null ? manual[r.color] : null));
  const missing = [...new Set(resistors.filter((r, i) => values[i] == null).map(r => r.color))];
  if (missing.length) return { ok: false, values, error: `No value for ${missing.join(', ')} in the manual` };
  if (A == null || B == null) return { ok: false, values, error: 'Need two orange terminals' };
  if (A === B) return { ok: true, values, ohms: formatOhms([0n, 1n]), note: 'terminals are shorted' };

  // only the part of the circuit connected to A matters
  const adj = new Map();
  const link = (x, y) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); };
  resistors.forEach(r => { link(r.a, r.b); link(r.b, r.a); });
  const seen = new Set([A]), stack = [A];
  while (stack.length) for (const y of adj.get(stack.pop()) || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
  if (!seen.has(B)) return { ok: false, values, error: 'The terminals are not connected (open circuit)' };

  // nodal analysis: ground B, push 1 A into A, R_eq = V(A)
  const nodes = [...seen].filter(n => n !== B);
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const N = nodes.length;
  const M = Array.from({ length: N }, () => Array.from({ length: N + 1 }, () => [0n, 1n]));
  resistors.forEach((r, k) => {
    if (!seen.has(r.a) || r.a === r.b) return;
    const g = div([1n, 1n], fromDecimal(values[k]));
    const ia = idx.get(r.a), ib = idx.get(r.b);
    if (ia != null) M[ia][ia] = add(M[ia][ia], g);
    if (ib != null) M[ib][ib] = add(M[ib][ib], g);
    if (ia != null && ib != null) { M[ia][ib] = sub(M[ia][ib], g); M[ib][ia] = sub(M[ib][ia], g); }
  });
  M[idx.get(A)][N] = [1n, 1n];
  for (let c = 0; c < N; c++) {
    let p = c;
    while (p < N && M[p][c][0] === 0n) p++;
    if (p === N) return { ok: false, values, error: 'Could not solve the circuit' };
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < N; r++) {
      if (r === c || M[r][c][0] === 0n) continue;
      const f = div(M[r][c], M[c][c]);
      for (let k = c; k <= N; k++) M[r][k] = sub(M[r][k], mul(f, M[c][k]));
    }
  }
  const a = idx.get(A);
  return { ok: true, values, ohms: formatOhms(div(M[a][N], M[a][a])) };
}
