// Release audit 2026-11-21: Balance (textbook equations), Circuit (checked with Python fractions), Queens, Wire Sequences, Complex Wires
import test from 'node:test';
import assert from 'node:assert/strict';
const S = '../src/modules/';
const { balanceEquation, fixOcrFormulaSide } = await import(S + 'balance/balanceSolver.js');
const { solveCircuit, parseCircuitManual, CIRCUIT_DEFAULT_MANUAL } = await import(S + 'circuit/circuitSolver.js');
const { solveQueensPuzzle } = await import(S + 'queens/queensSolver.js');
const { wsParseManual, WS_DEFAULT_MANUAL, wsSolveAll, wsParseQuick } = await import(S + 'wireseq/wireseqRules.js');
const { CW_PRESETS, cwKey, cwRuleFor } = await import(S + 'complexwires/complexwiresConstants.js');

// textbook balances (independent known answers)
const known = [
  ['H2 + O2 → H2O', '2 1 2'],
  ['CH4 + O2 → CO2 + H2O', '1 2 1 2'],
  ['C3H8 + O2 → CO2 + H2O', '1 5 3 4'],
  ['Fe + O2 → Fe2O3', '4 3 2'],
  ['KNO3 → KNO2 + O2', '2 2 1'],
  ['Al + HCl → AlCl3 + H2', '2 6 2 3'],
  ['C6H12O6 + O2 → CO2 + H2O', '1 6 6 6'],
  ['C12H22O11 + O2 → CO2 + H2O', '1 12 12 11'],
  ['Ca(OH)2 + H3PO4 → Ca3(PO4)2 + H2O', '3 2 1 6'],
  ['KMnO4 + HCl → KCl + MnCl2 + H2O + Cl2', '2 16 2 2 8 5'],
  ['CuSO4.5H2O → CuSO4 + H2O', '1 1 5'],
  ['NH3 + O2 -> NO + H2O', '4 5 4 6'],
  ['2H2 + O2 = 2H2O', '2 1 2'],
];
test('balance: textbook equations', () => {
  for (const [eq, want] of known) { const r = balanceEquation(eq); assert.equal(r.ok, true, eq + ' ' + r.error); assert.equal(r.answer, want, eq); }
});
test('balance: invalid inputs are errors, not answers', () => {
  for (const eq of ['', 'H2O', 'H2 + O2 →', 'Xx + O2 → XxO', 'H2 → O2', 'NaCl → Na + Cl2 + Q']) assert.equal(balanceEquation(eq).ok, false, eq);
});
test('balance: OCR fixes', () => {
  assert.equal(fixOcrFormulaSide('KN03'), 'KNO3');
  assert.equal(fixOcrFormulaSide('CI2'), 'Cl2');
  assert.equal(fixOcrFormulaSide('02'), 'O2');
});

const M = parseCircuitManual(CIRCUIT_DEFAULT_MANUAL);
test('circuit: series, parallel, bridge, open', () => {
  assert.equal(solveCircuit([{ a: 0, b: 1, color: 'red' }, { a: 1, b: 2, color: 'blue' }], 0, 2, M).ohms.exact, '6');
  assert.equal(solveCircuit([{ a: 0, b: 1, color: 'red' }, { a: 0, b: 1, color: 'red' }], 0, 1, M).ohms.exact, '1');
  assert.equal(solveCircuit([{ a: 0, b: 1, color: 'orange' }, { a: 0, b: 1, color: 'gray' }], 0, 1, M).ohms.exact, '4');
  // balanced Wheatstone: 2,2 / 2,2 with bridge 6 → 2
  const br = [{ a: 0, b: 1, color: 'red' }, { a: 1, b: 3, color: 'red' }, { a: 0, b: 2, color: 'red' }, { a: 2, b: 3, color: 'red' }, { a: 1, b: 2, color: 'orange' }];
  assert.equal(solveCircuit(br, 0, 3, M).ohms.exact, '2');
  // unbalanced bridge R1=2,R2=4,R3=4,R4=2,R5=6 → known 3
  const ub = [{ a: 0, b: 1, color: 'red' }, { a: 1, b: 3, color: 'blue' }, { a: 0, b: 2, color: 'blue' }, { a: 2, b: 3, color: 'red' }, { a: 1, b: 2, color: 'orange' }];
  // by Y-Δ / nodal: R = 3.  computed independently below
  assert.equal(solveCircuit(ub, 0, 3, M).ohms.exact, '26/9'); // checked with Python fractions
  assert.equal(solveCircuit([{ a: 0, b: 1, color: 'red' }], 0, 2, M).ok, false);
  assert.equal(solveCircuit([{ a: 0, b: 1, color: 'pink' }], 0, 1, M).ok, false);
  assert.equal(solveCircuit([{ a: 0, b: 1, color: 'red' }, { a: 1, b: 2, color: 'blue' }, { a: 0, b: 2, color: 'yellow' }], 0, 2, M).ohms.decimal, String(Math.round(6 * 16 / 22 * 100) / 100));
});
test('circuit: a 0-ohm value in the manual gives an error, not a wrong number', () => {
  const r = solveCircuit([{ a: 0, b: 1, color: 'red' }, { a: 1, b: 2, color: 'blue' }], 0, 2, { red: '0', blue: '4' });
  assert.equal(r.ok, false);
});

test('queens: every solution satisfies the rules; random region puzzles from a planted solution', () => {
  let s = 3; const rnd = n => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s % n; };
  for (let t = 0; t < 60; t++) {
    // plant a non-touching permutation
    let q; do { q = [...Array(8).keys()]; for (let i = 7; i > 0; i--) { const j = rnd(i + 1); [q[i], q[j]] = [q[j], q[i]]; } } while (q.some((c, r) => r && Math.abs(q[r - 1] - c) <= 1));
    const g = Array.from({ length: 8 }, () => Array(8).fill(-1));
    q.forEach((c, r) => (g[r][c] = r));
    // grow regions randomly
    let left = 56;
    while (left) { const r = rnd(8), c = rnd(8); if (g[r][c] !== -1) continue; const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < 8 && b >= 0 && b < 8 && g[a][b] !== -1); if (nb.length) { const [a, b] = nb[rnd(nb.length)]; g[r][c] = g[a][b]; left--; } }
    const sols = solveQueensPuzzle(g);
    assert.ok(sols.some(x => x.join() === q.join()), 'planted solution found');
    for (const x of sols) { assert.equal(new Set(x).size, 8); assert.equal(new Set(x.map((c, r) => g[r][c])).size, 8); x.forEach((c, r) => r && assert.ok(Math.abs(x[r - 1] - c) > 1)); }
  }
});

test('wireseq: default manual has 27 rules; occurrence counts carry across stages', () => {
  const R = wsParseManual(WS_DEFAULT_MANUAL);
  assert.equal(Object.values(R).reduce((a, o) => a + Object.keys(o).length, 0), 27);
  const st = [[{ c: 'red', d: 'C' }, { c: 'red', d: 'A' }, { c: 'blue', d: 'B' }], [{ c: 'red', d: 'C' }, { c: 'red', d: 'B' }, { c: null, d: null }]];
  const out = wsSolveAll(st, R);
  assert.deepEqual(out[0].map(r => r.state), ['cut', 'cut', 'skip']); // red1 ABC: C cut, red2 A: A cut, blue1 A: B keep
  assert.deepEqual(out[1].map(r => r.state), ['skip', 'skip', 'empty']); // red3 B: C keep, red4 C: B keep
  // the universal table, row by row (image manual)
  const row = (c) => Object.keys(R[c]).sort((a, b) => a - b).map(n => [...R[c][n]].sort().join('')).join(' ');
  assert.equal(row('red'), 'ABC A B C ABC BC BC AB C');
  assert.equal(row('blue'), 'A AC AB B C AC B AB AB');
  assert.equal(row('black'), 'AB B A B AB ABC ABC AC C');
  assert.deepEqual(wsParseQuick('1RA 2BKC 3BB').panel, [{ c: 'red', d: 'A' }, { c: 'black', d: 'C' }, { c: 'blue', d: 'B' }]);
  assert.deepEqual(wsParseQuick('1 red to a, 2 blue to c').panel.filter(Boolean).length, 0); // spaced words are split into separate tokens
});

test('complex wires: every preset covers all 16 regions with a valid letter', () => {
  for (const [k, p] of Object.entries(CW_PRESETS)) { assert.equal(Object.keys(p).length, 16, k); for (const v of Object.values(p)) assert.ok('CDSPB'.includes(v)); }
  assert.equal(cwKey({ color: 'striped', star: true, led: true }), 'Red+Blue+Star+LED');
  assert.equal(cwRuleFor('S', { even: true }).cut, true);
});
