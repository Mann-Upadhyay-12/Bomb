// Battleship — where to fire next.
//
// The manual lists the enemy fleet ("3-cell ship, afloat", "2-cell ship, afloat"). Ships lie
// straight (across or down) and never overlap. The board is the bomb's module grid (A–F × 1–6 so far).
// Each shot costs 20 seconds (the bomb blows up if the next one comes sooner), so the fewer shots the
// better.
//
// Strategy: count every way the whole fleet could still be placed so that it covers every hit and no
// miss (and, when the fleet list says a ship is sunk, lies wholly on hits). A cell's chance of holding
// a ship = the share of those layouts that use it. Fire at the most likely untried cell. With no hits
// this spreads the shots over the middle of the board in a checkerboard-like pattern; after a hit it
// goes along the line the ship can still lie on. It is exact (every layout counted), not a rule of thumb.

import { discordPlain } from '../../utils/discordText.js';
export const colLetter = c => String.fromCharCode(65 + c);
export const cellName = (i, cols) => `${colLetter(i % cols)}${Math.floor(i / cols) + 1}`;

/** "C3" / "c 3" → index, or -1. */
export function parseCell(s, cols, rows) {
  const m = String(s || '').trim().match(/^([A-Za-z])\s*(\d{1,2})$/);
  if (!m) return -1;
  const c = m[1].toUpperCase().charCodeAt(0) - 65, r = Number(m[2]) - 1;
  return c >= 0 && c < cols && r >= 0 && r < rows ? r * cols + c : -1;
}

/**
 * Reads the pasted manual / bot text.
 * → { ships: [{ len, status: 'afloat' | 'sunk' | null }], size: { cols, rows } | null, shots: [{ cell, result }] }
 */
export function parseBattleshipText(text) {
  const t = discordPlain(String(text || '')); // a phone copies Discord's **markup** too
  const ships = [];
  for (const raw of t.split(/\n|;|(?<=afloat|sunk|sank)\s*,/i)) {
    const line = raw.trim();
    const m = line.match(/(\d{1,2})\s*[-‑–]?\s*(?:cells?|squares?|long)\b/i) || line.match(/\bship\b[^0-9\n]{0,12}\(?\s*(\d{1,2})\s*\)?/i);
    if (!m || !/ship|cell|boat|carrier|destroyer|cruiser|submarine|battleship/i.test(line)) continue;
    if (/ships?\s+lie|never\s+overlap|wait\s+\d+\s*s/i.test(line)) continue;
    const len = Number(m[1]);
    if (len < 1 || len > 10) continue;
    const status = /\b(sunk|sank|destroyed|down)\b/i.test(line) ? 'sunk' : /\b(afloat|alive|intact|floating|damaged|hit)\b/i.test(line) ? 'afloat' : null;
    ships.push({ len, status });
  }
  let size = null;
  const sm = t.match(/(\d{1,2})\s*[x×]\s*(\d{1,2})/);
  if (sm && Number(sm[1]) >= 3 && Number(sm[1]) <= 10 && Number(sm[2]) >= 3 && Number(sm[2]) <= 10) size = { cols: Number(sm[1]), rows: Number(sm[2]) };
  // shot results, if the text lists any: "C3 hit", "C3: miss", "miss at B4", "hit on E2"
  const shots = [];
  for (const m of t.matchAll(/\b([A-J])\s?(10|[1-9])\b[^A-Za-z0-9\n]{0,4}\s*(hit|miss(?:ed)?|splash|sunk|sank)\b/gi)) shots.push({ cell: `${m[1].toUpperCase()}${m[2]}`, result: /miss|splash/i.test(m[3]) ? 'miss' : 'hit' });
  for (const m of t.matchAll(/\b(hit|miss(?:ed)?)\s+(?:at|on)\s+([A-J])\s?(10|[1-9])\b/gi)) shots.push({ cell: `${m[2].toUpperCase()}${m[3]}`, result: /miss/i.test(m[1]) ? 'miss' : 'hit' });
  return { ships, size, shots };
}

// every straight spot a ship of `len` fits on the board: arrays of cell indexes
function placementsOf(len, cols, rows) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c + len <= cols; c++) out.push(Array.from({ length: len }, (_, k) => r * cols + c + k));
  if (len > 1) for (let c = 0; c < cols; c++) for (let r = 0; r + len <= rows; r++) out.push(Array.from({ length: len }, (_, k) => (r + k) * cols + c));
  return out;
}

const popcount = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };

/**
 * @param {{ cols, rows, ships: [{len, status}], shots: {[cellIndex]: 'hit'|'miss'}, trustAfloat?: boolean }} s
 *   trustAfloat: the fleet list is up to date (no hit since it was pasted), so an "afloat" ship is not
 *   lying wholly on hits.
 * → { ok, reason, total, prob: number[], best: [cellIndex], bestP, ties: [cellIndex], certain: [cellIndex],
 *     done, hits, misses, mode: 'hunt'|'target', exact }
 */
export function analyzeBattleship({ cols = 6, rows = 6, ships = [], shots = {}, trustAfloat = false, budget = 4e6 }) {
  const N = cols * rows;
  const hitSet = new Set(), missSet = new Set();
  for (const [k, v] of Object.entries(shots)) { const i = Number(k); if (i >= 0 && i < N) (v === 'hit' ? hitSet : v === 'miss' ? missSet : null)?.add(i); }
  const base = { cols, rows, hits: hitSet.size, misses: missSet.size, prob: Array(N).fill(0), best: [], ties: [], certain: [], bestP: 0, total: 0, exact: true, done: false };
  if (!ships.length) return { ...base, ok: false, reason: 'No fleet yet — paste the manual text (the "Enemy fleet" list).' };
  const cells = ships.reduce((a, s) => a + s.len, 0);
  if (cells > N) return { ...base, ok: false, reason: `The fleet (${cells} cells) does not fit a ${cols}×${rows} board.` };
  if (ships.every(s => s.status === 'sunk')) return { ...base, ok: true, done: true, mode: 'done' };
  if (hitSet.size >= cells) return { ...base, ok: true, done: true, mode: 'done' };

  const WN = Math.ceil(N / 32);
  const maskOf = (cs) => { const m = new Uint32Array(WN); for (const i of cs) m[i >> 5] |= 1 << (i & 31); return m; };
  const hitMask = maskOf(hitSet);

  // ships in search order: sunk ones first (few spots), then longest first
  const order = ships.map((s, i) => ({ ...s, i })).sort((a, b) => (b.status === 'sunk') - (a.status === 'sunk') || b.len - a.len);
  const cand = order.map(s => placementsOf(s.len, cols, rows).filter(p => {
    if (p.some(i => missSet.has(i))) return false;
    const allHit = p.every(i => hitSet.has(i));
    if (s.status === 'sunk') return allHit;
    if (s.status === 'afloat' && trustAfloat && allHit) return false;
    return true;
  }).map(p => ({ cells: p, mask: maskOf(p) })));
  if (cand.some(c => !c.length)) return { ...base, ok: false, reason: 'No way to fit the fleet around these shots — check the marks and the fleet list.' };
  // identical ships are interchangeable: count each layout once (spot index increasing)
  const sameAsPrev = order.map((s, k) => k > 0 && order[k - 1].len === s.len && order[k - 1].status === s.status);
  const restLen = order.map((_, k) => order.slice(k).reduce((a, s) => a + s.len, 0));

  const counts = cand.map(c => new Float64Array(c.length));
  const pick = new Int32Array(order.length);
  const occ = Array.from({ length: order.length + 1 }, () => new Uint32Array(WN));
  let total = 0, nodes = 0, aborted = false;
  const dfs = (k) => {
    if (aborted) return;
    if (++nodes > budget) { aborted = true; return; }
    const o = occ[k];
    // the hits not yet covered must fit in the ships still to place
    let open = 0;
    for (let w = 0; w < WN; w++) open += popcount(hitMask[w] & ~o[w]);
    if (open > (k < order.length ? restLen[k] : 0)) return;
    if (k === order.length) {
      total++;
      for (let j = 0; j < order.length; j++) counts[j][pick[j]]++;
      return;
    }
    const start = sameAsPrev[k] ? pick[k - 1] + 1 : 0;
    const list = cand[k], next = occ[k + 1];
    for (let p = start; p < list.length; p++) {
      const m = list[p].mask;
      let clash = false;
      for (let w = 0; w < WN; w++) if (o[w] & m[w]) { clash = true; break; }
      if (clash) continue;
      for (let w = 0; w < WN; w++) next[w] = o[w] | m[w];
      pick[k] = p;
      dfs(k + 1);
    }
  };
  dfs(0);

  let cellCount = new Float64Array(N);
  let exact = true;
  if (aborted) {
    // too many layouts to count: fall back to each ship on its own (the usual density map)
    exact = false;
    total = 1;
    cellCount = new Float64Array(N);
    order.forEach((s, k) => {
      const ok = cand[k];
      for (const p of ok) for (const i of p.cells) cellCount[i] += 1 / ok.length;
    });
  } else {
    if (!total) return { ...base, ok: false, reason: 'No way to fit the fleet around these shots — check the marks and the fleet list.' };
    counts.forEach((cs, k) => cs.forEach((n, p) => { if (n) for (const i of cand[k][p].cells) cellCount[i] += n; }));
  }
  const prob = Array.from(cellCount, n => Math.min(1, n / total));
  const open = [];
  for (let i = 0; i < N; i++) if (!hitSet.has(i) && !missSet.has(i)) open.push(i);
  // every ship cell already found?
  if (exact && open.every(i => prob[i] === 0)) return { ...base, ok: true, done: true, mode: 'done', total, prob };
  open.sort((a, b) => prob[b] - prob[a] || a - b);
  const bestP = prob[open[0]];
  const ties = open.filter(i => prob[i] >= bestP - 1e-9);
  const certain = exact ? open.filter(i => prob[i] >= 1 - 1e-9) : [];
  const sunkLen = ships.filter(s => s.status === 'sunk').reduce((a, s) => a + s.len, 0);
  return {
    ...base, ok: true, total, prob, exact,
    best: open.slice(0, 3), bestP, ties, certain,
    mode: hitSet.size > sunkLen ? 'target' : 'hunt'
  };
}

/** Plays one hidden layout with the strategy; returns the number of shots needed (for tests / tuning). */
export function playGame(layout, ships, cols, rows, { reportSunk = true } = {}) {
  // layout: array of cell arrays, one per ship (same order as ships)
  const shots = {};
  const owner = new Map();
  layout.forEach((cs, k) => cs.forEach(i => owner.set(i, k)));
  const state = ships.map(s => ({ len: s.len, status: reportSunk ? 'afloat' : null }));
  for (let n = 1; n <= cols * rows; n++) {
    const a = analyzeBattleship({ cols, rows, ships: state, shots, trustAfloat: reportSunk });
    if (!a.ok) throw new Error(a.reason);
    if (a.done) return n - 1;
    const i = a.best[0];
    shots[i] = owner.has(i) ? 'hit' : 'miss';
    if (reportSunk && owner.has(i)) {
      const k = owner.get(i);
      if (layout[k].every(c => shots[c] === 'hit')) state[k].status = 'sunk';
    }
  }
  return cols * rows;
}

export const SAMPLE_MANUAL = `On the subject of Battleship
Ships lie straight, across or down, and never overlap. Tell the Defuser where to fire. After each shot they must wait 20 seconds or the bomb detonates. A shot knocks the module in that slot offline for 20 seconds. Sink every ship to disarm this module.

Enemy fleet:
• 3-cell ship, afloat
• 2-cell ship, afloat`;
