// Computer vision for Piano staff and musical notes

export function pnAnalyze(d, w, h) {
  const N = w * h, L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const srt = L.slice().sort(), bg = srt[N >> 1], mx = srt[Math.floor(N * 0.995)];
  const lt = bg + 28, a0 = Math.floor(w * 0.2), a1 = Math.floor(w * 0.8), rows = [];
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = a0; x < a1; x++) if (L[y * w + x] > lt) c++;
    rows.push(c > (a1 - a0) * 0.5);
  }
  const cl = [];
  for (let y = 0; y < h; y++) {
    if (rows[y]) {
      const a = y;
      while (y + 1 < h && rows[y + 1]) y++;
      cl.push((a + y) / 2);
    }
  }
  if (cl.length < 5) return null;
  let best = null, bv = 1e9;
  for (let i = 0; i + 5 <= cl.length; i++) {
    const g = [1, 2, 3, 4].map(k => cl[i + k] - cl[i + k - 1]), m = (g[0] + g[1] + g[2] + g[3]) / 4, v = g.reduce((a, b) => a + (b - m) ** 2, 0);
    if (v < bv) { bv = v; best = cl.slice(i, i + 5); }
  }
  const top = best[0], bot = best[4], s = (bot - top) / 4, ty = Math.round(top);
  let xL = w, xR = 0;
  for (let x = Math.floor(w * 0.05); x < w * 0.95; x++) {
    if (L[ty * w + x] > lt) { xL = Math.min(xL, x); xR = Math.max(xR, x); }
  }
  const ya = Math.max(0, Math.floor(top - 4 * s)), yb = Math.min(h - 1, Math.ceil(bot + 4 * s)), bt = bg + 0.55 * (mx - bg);
  const seen = new Uint8Array(N), comps = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xL; x <= xR; x++) {
      const i = y * w + x;
      if (seen[i] || L[i] <= bt) continue;
      const st = [i], px = [];
      seen[i] = 1;
      while (st.length) {
        const j = st.pop();
        px.push(j);
        const jx = j % w, jy = (j - jx) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = jx + dx, ny = jy + dy;
          if (nx < xL || nx > xR || ny < ya || ny > yb) continue;
          const k = ny * w + nx;
          if (!seen[k] && L[k] > bt) { seen[k] = 1; st.push(k); }
        }
      }
      if (px.length >= 6) comps.push(px);
    }
  }
  const info = comps.map(px => {
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    const ry = {};
    for (const j of px) {
      const x = j % w, y = (j - x) / w;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      const r = ry[y] || (ry[y] = { a: x, b: x, n: 0 });
      r.a = Math.min(r.a, x); r.b = Math.max(r.b, x); r.n++;
    }
    return { x0, x1, y0, y1, ry, px, n: px.length };
  }).sort((p, q) => p.x0 - q.x0);

  const ci = info.findIndex(c => c.n > s * s * 0.5 && c.y1 - c.y0 > s);
  if (ci < 0) return null;
  const cf = info[ci];
  const sm = info.filter(q => q !== cf && q.x0 >= cf.x0 - 2 && q.x0 <= cf.x1 + 0.8 * s && q.x1 - q.x0 < 0.5 * s && q.y1 - q.y0 < 0.5 * s && q.y0 > top - 0.2 * s && q.y1 < bot + 0.2 * s);
  const dots = sm.some((p, i) => sm.some((q, j) => j > i && Math.abs(p.x0 - q.x0) <= 3 && Math.abs((p.y0 + p.y1) / 2 - (q.y0 + q.y1) / 2) > 0.4 * s && Math.abs((p.y0 + p.y1) / 2 - (q.y0 + q.y1) / 2) < 1.1 * s));
  const clef = (cf.y0 < top - 0.6 * s && cf.y1 > bot + 0.6 * s) || !dots ? 'treble' : 'bass';
  const heads = [], accs = [];

  for (const c of info) {
    if (c.x0 <= cf.x1) continue;
    const ys = Object.keys(c.ry).map(Number), ext = ys.map(y => c.ry[y].b - c.ry[y].a + 1), me = Math.max(...ext);
    const ix = ys.map((y, i) => i).filter(i => ext[i] >= 0.75 * me);
    const fill = ix.reduce((a, i) => a + c.ry[ys[i]].n / ext[i], 0) / ix.length, w2 = c.x1 - c.x0 + 1, h2 = c.y1 - c.y0 + 1;
    if (me >= 0.6 * s && me <= 2 * s && ix.length >= 0.4 * s && fill >= 0.8) {
      const hy = ix.map(i => ys[i]);
      heads.push({ pos: Math.round((bot - hy.reduce((a, b) => a + b) / hy.length) / (s / 2)), x: c.x0, y: hy.reduce((a, b) => a + b) / hy.length, acc: 0 });
    } else if (h2 >= 0.85 * s && w2 <= 1.4 * s) {
      let rt = 0, rb = 0, lo = 1e9, ro = 1e9;
      for (const j of c.px) {
        const x = j % w, y = (j - x) / w, fx = (x - c.x0) / w2, fy = (y - c.y0) / h2;
        if (fx > 0.5) { fy < 0.5 ? rt++ : rb++; }
        if (fx < 0.35) lo = Math.min(lo, fy);
        if (fx > 0.65) ro = Math.min(ro, fy);
      }
      const acc = rt < 0.25 * rb ? -1 : (ro < 0.15 ? 1 : 0);
      accs.push({ x1: c.x1, y: (c.y0 + c.y1) / 2, acc, used: false });
    }
  }

  heads.sort((p, q) => p.x - q.x);
  for (const a of accs) {
    let b = null;
    for (const hd of heads) {
      if (hd.x >= a.x1 - 2 && hd.x - a.x1 < 2.5 * s && Math.abs(a.y - hd.y) < 1.6 * s) { b = hd; break; }
    }
    if (b) { b.acc = a.acc; a.used = true; }
  }

  const notes = heads, stray = accs.filter(a => !a.used).length;
  return { clef, notes, spacing: s, stray };
}
