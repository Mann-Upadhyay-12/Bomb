// Release audit 2026-11-21: Switches, Who's On First, Simon, Piano, Password, Word Search, Maze solvers
import test from 'node:test';
import assert from 'node:assert/strict';
const S = '../src/modules/';
const { swBFS, swNorm } = await import(S + 'switches/switchesSolver.js');
const { DEFAULT_RULES, parseRules, solveCore, matchWord, POS_NAMES } = await import(S + 'wof/wofSolver.js');
const { siToFlashes } = await import(S + 'simons/simonsSolver.js');
const { pnNote, pnParseCodes, PN_DEFAULT_CODES, PN_INT } = await import(S + 'piano/pianoSolver.js');
const { filterPasswordCandidates, MASTER_PASSWORDS } = await import(S + 'password/passwordSolver.js');
const { solveWordSearch } = await import(S + 'search/searchSolver.js');
const { solveMazeBFS } = await import(S + 'maze/mazeSolver.js');

const all = []; for (let i = 0; i < 32; i++) all.push([...Array(5)].map((_, j) => (i >> j) & 1 ? 'D' : 'U').join(''));
const ham = (a, b) => [...a].filter((c, i) => c !== b[i]).length;

test('switches: unblocked path length = Hamming distance for all 1024 pairs', () => {
  for (const a of all) for (const b of all) {
    const p = swBFS(a, b, []);
    assert.equal(p.length - 1, ham(a, b));
    for (let i = 1; i < p.length; i++) assert.equal(ham(p[i - 1], p[i]), 1);
  }
});
test('switches: forbidden states never visited; shortest under constraints (vs brute BFS)', () => {
  let rng = 7; const rnd = () => (rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let t = 0; t < 400; t++) {
    const forb = all.filter(() => rnd() < 0.3);
    const a = all[Math.floor(rnd() * 32)], b = all[Math.floor(rnd() * 32)];
    const p = swBFS(a, b, forb);
    // reference BFS distance
    const dist = new Map([[a, 0]]), q = [a];
    if (!forb.includes(a)) while (q.length) { const s = q.shift(); for (let i = 0; i < 5; i++) { const n = s.slice(0, i) + (s[i] === 'U' ? 'D' : 'U') + s.slice(i + 1); if (!dist.has(n) && !forb.includes(n)) { dist.set(n, dist.get(s) + 1); q.push(n); } } }
    if (forb.includes(a) || forb.includes(b) || !dist.has(b)) assert.equal(p, null, `${a}->${b}`);
    else { assert.equal(p.length - 1, dist.get(b)); assert.ok(p.every(s => !forb.includes(s))); }
  }
});
test('switches: swNorm pads short input with U (documents current behaviour)', () => {
  assert.equal(swNorm('DD'), 'DDUUU');
});

test('wof: default rules parse to 6 positions and every display word maps', () => {
  const R = parseRules(DEFAULT_RULES);
  assert.equal(R.positions, 6);
  assert.equal(R.posOfWord['(BLANK)'], 5);
  assert.equal(R.posOfWord['YOU ARE'], 1);
  assert.equal(R.posOfWord['MIDDLE LEFT'], 1);
  // every step-2 list ends with its own label (standard WOF), so an answer always exists when the label is present
  for (const [k, list] of Object.entries(R.step2)) assert.equal(list[list.length - 1], k, k);
});
test('wof: solve picks first list word present', () => {
  const R = parseRules(DEFAULT_RULES);
  // display YOU → top left label. buttons: [READY, FIRST, ...]; READY list: FIRST, READY → FIRST
  const btns = ['READY', 'FIRST', 'NOT', 'WAIT', 'HOLD', 'IT'];
  const r = solveCore(R, 'YOU', btns);
  assert.equal(r.ok, true); assert.equal(r.ans, 'FIRST'); assert.equal(r.hit, 1);
  assert.equal(solveCore(R, 'YOU', ['READY', '', 'NOT', 'WAIT', 'HOLD', 'IT']).ok, false);
  assert.equal(solveCore(R, 'NOPE', btns).ok, false);
});
test('wof: fuzzy match keeps apostrophes and question marks', () => {
  const R = parseRules(DEFAULT_RULES);
  assert.equal(matchWord("you're", R.buttonLabels).w, "YOU'RE");
  assert.equal(matchWord('WHAT?', R.buttonLabels).w, 'WHAT?');
  assert.equal(matchWord('YOU ARE', R.buttonLabels).w, 'YOU ARE');
});

test('simon: repeated flashes split by a gap', () => {
  assert.deepEqual(siToFlashes(['R', 'R', null, 'R', 'B', null, null, 'B', 'G']).map(f => f.c), ['R', 'R', 'B', 'B', 'G']);
});

test('piano: staff position → note', () => {
  assert.equal(pnNote('treble', 0, 0).name, 'E4'); // bottom line treble
  assert.equal(pnNote('treble', 8, 0).name, 'F5'); // top line
  assert.equal(pnNote('bass', 0, 0).name, 'G2');
  assert.equal(pnNote('bass', 8, 0).name, 'A3');
  assert.equal(pnNote('treble', -2, 0).name, 'C4'); // middle C below staff
  assert.equal(pnNote('treble', 0, 1).semi - pnNote('treble', 0, 0).semi, 1);
  const c = pnParseCodes(PN_DEFAULT_CODES);
  for (let st = 1; st <= 12; st++) assert.ok(c[PN_INT[st].toLowerCase()], PN_INT[st]);
});

test('password: the only non-5-letter entry in the default list is CANCEL (it can never match)', () => {
  const six = MASTER_PASSWORDS.filter(w => w.length !== 5);
  assert.deepEqual(six, ['CANCEL']);
  const r = filterPasswordCandidates(['BXXXX', 'XEXXX', 'XXLXX', 'XXXOX', 'XXXXW'], MASTER_PASSWORDS.join(' '));
  assert.deepEqual(r.matches, ['BELOW']);
  // each letter from a different row still counts (column sets)
  assert.equal(filterPasswordCandidates([], 'BELOW').matches.length, 0);
});

test('search: words of 3–5 letters in all directions; 2-letter words are not searched', () => {
  const g = ['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST', 'UVWXY'].map(r => r.split(''));
  assert.deepEqual(solveWordSearch(g, 'AB ABC').uniqueWords, ['ABC']);
  assert.deepEqual(solveWordSearch(g, 'YTO').uniqueWords, ['YTO']); // up
  assert.deepEqual(solveWordSearch(g, 'AGM').uniqueWords, ['AGM']); // diag
});

test('maze: open 8x8 → Manhattan distance; walled-off → null', () => {
  const g = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => ({ u: r === 0, d: r === 7, l: c === 0, r: c === 7 })));
  assert.equal(solveMazeBFS(g, { r: 0, c: 0 }, { r: 7, c: 7 }).length, 14);
  assert.deepEqual(solveMazeBFS(g, { r: 3, c: 3 }, { r: 3, c: 3 }), []);
  for (let c = 0; c < 8; c++) { g[3][c].d = true; g[4][c].u = true; }
  assert.equal(solveMazeBFS(g, { r: 0, c: 0 }, { r: 7, c: 7 }), null);
});
