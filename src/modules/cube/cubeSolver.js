// Pure Rubik's Cube state solver & IDA* move search engine

export const FACES = 'URFDLB';
export const SOLVED = 'WRGYOB';

const rot = (n, v) => {
  const c = [n[1] * v[2] - n[2] * v[1], n[2] * v[0] - n[0] * v[2], n[0] * v[1] - n[1] * v[0]];
  const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  return v.map((_, i) => -c[i] + n[i] * d);
};

const DEF = {
  U: (r, c) => [[c - 1, 1, r - 1], [0, 1, 0]],
  R: (r, c) => [[1, 1 - r, 1 - c], [1, 0, 0]],
  F: (r, c) => [[c - 1, 1 - r, 1], [0, 0, 1]],
  D: (r, c) => [[c - 1, -1, 1 - r], [0, -1, 0]],
  L: (r, c) => [[-1, 1 - r, c - 1], [-1, 0, 0]],
  B: (r, c) => [[1 - c, 1 - r, -1], [0, 0, -1]]
};

const FL = [], IDX = {};
for (const f of FACES) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      FL.push(DEF[f](r, c));
    }
  }
}
FL.forEach(([p, n], i) => (IDX[p + '|' + n] = i));

const PERMS = [], PINV = [];
FACES.split('').forEach(f => {
  const n = DEF[f](1, 1)[1];
  const p = FL.map(([pos, nm], i) =>
    pos[0] * n[0] + pos[1] * n[1] + pos[2] * n[2] > 0
      ? IDX[rot(n, pos) + '|' + rot(n, nm)]
      : i
  );
  const p3 = p.map((_, i) => p[p[p[i]]]);
  PERMS.push(p, p3);
});

PERMS.forEach(P => {
  const q = [];
  P.forEach((v, i) => (q[v] = i));
  PINV.push(q);
});

const MN = [];
FACES.split('').forEach(f => MN.push(f, f + "'"));
const OPP = [3, 4, 5, 0, 1, 2];

export async function searchCube(obs, maxD, tick) {
  const vis = [], want = [];
  obs.forEach((c, i) => {
    if (c) {
      vis.push(i);
      want.push(SOLVED.indexOf(c));
    }
  });

  const start = new Uint8Array(54);
  for (let i = 0; i < 54; i++) start[i] = (i / 9) | 0;

  const bufs = [start];
  for (let i = 1; i <= maxD; i++) bufs.push(new Uint8Array(54));
  const seq = [];
  let hits, seen, L;
  const nv = vis.length;

  const dfs = (d, only) => {
    const s = bufs[d];
    for (let m = 0; m < 12; m++) {
      if (d === 0 && only >= 0 && m !== only) continue;
      if (d > 0) {
        const pm = seq[d - 1];
        if ((m ^ 1) === pm) continue;
        if (d > 1 && pm === m && seq[d - 2] === m) continue;
        const fp = pm >> 1, fm = m >> 1;
        if (OPP[fp] === fm && fm < fp) continue;
      }
      seq[d] = m;
      if (d === L - 1) {
        const Q = PINV[m];
        let ok = true;
        for (let k = 0; k < nv; k++) {
          if (s[Q[vis[k]]] !== want[k]) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const P = PERMS[m], t = bufs[d + 1];
          for (let i = 0; i < 54; i++) t[P[i]] = s[i];
          const key = t.join('');
          if (!seen.has(key)) {
            seen.add(key);
            hits.push(seq.slice(0, L));
          }
        }
      } else {
        const P = PERMS[m], t = bufs[d + 1];
        for (let i = 0; i < 54; i++) t[P[i]] = s[i];
        dfs(d + 1, -1);
      }
      if (hits.length >= 40) return;
    }
  };

  const startTime = Date.now();
  for (L = 0; L <= maxD; L++) {
    hits = [];
    seen = new Set();
    if (L === 0) {
      if (vis.every((i, k) => start[i] === want[k])) return { len: 0, sols: [''] };
      continue;
    }
    // Yield each depth level to let the browser breathe
    await new Promise(r => setTimeout(r, 0));
    if (Date.now() - startTime > 4000) {
      return { timeout: true, len: L, sols: [] };
    }
    for (let f = 0; f < 12; f++) {
      dfs(0, f);
      if (tick && (await tick(L, f)) === false) return { cancelled: true, len: L };
      if (hits.length >= 40) break;
    }
    if (hits.length) {
      return {
        len: L,
        sols: hits.map(h => h.slice().reverse().map(m => MN[m ^ 1]).join(' '))
      };
    }
  }
  return null;
}
