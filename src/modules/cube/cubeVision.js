// Computer vision for Rubik's cube sticker detection and perspective geometry

export const COLS = { W: '#f4f3ee', R: '#c8221b', G: '#0a9b4a', Y: '#f0c800', O: '#ff7a14', B: '#1f5fd1' };
export const COLOR_NAMES = { W: 'White', R: 'Red', G: 'Green', Y: 'Yellow', O: 'Orange', B: 'Blue' };

export function cls(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d / (mx || 1) < 0.25) return 'W';
  let h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 13 || h > 340 ? 'R' : h < 38 ? 'O' : h < 85 ? 'Y' : h < 190 ? 'G' : 'B';
}

export const at = (g, a, b, c) => [
  g.V[0] + (a * g.p[0] + b * g.q[0] + c * g.d[0]) / 3,
  g.V[1] + (a * g.p[1] + b * g.q[1] + c * g.d[1]) / 3
];

export const POS = {
  U: (g, r, c) => at(g, 2.5 - c, 2.5 - r, 0),
  F: (g, r, c) => at(g, 2.5 - c, 0, 0.5 + r),
  R: (g, r, c) => at(g, 0, 0.5 + c, 0.5 + r)
};

export function detectCubeStickers(img, data) {
  if (!img || !data) return null;
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, d = data.data;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
    m[i] = mx > 89 && (s > 0.45 || (s < 0.2 && mx > 153)) ? 1 : 0;
  }
  const lab = new Uint8Array(W * H), comps = [], st = [];
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || lab[i]) continue;
    let a = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    st.length = 0;
    st.push(i);
    lab[i] = 1;
    while (st.length) {
      const k = st.pop(), x = k % W, y = (k / W) | 0;
      a++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && m[k - 1] && !lab[k - 1]) { lab[k - 1] = 1; st.push(k - 1); }
      if (x < W - 1 && m[k + 1] && !lab[k + 1]) { lab[k + 1] = 1; st.push(k + 1); }
      if (y > 0 && m[k - W] && !lab[k - W]) { lab[k - W] = 1; st.push(k - W); }
      if (y < H - 1 && m[k + W] && !lab[k + W]) { lab[k + W] = 1; st.push(k + W); }
    }
    if (a > 150) comps.push({ a, x0, y0, x1, y1 });
  }
  comps.sort((p, q) => p.a - q.a);
  let best = null;
  for (let i = 0; i < comps.length; i++) {
    let j = i;
    while (j + 1 < comps.length && comps[j + 1].a <= comps[i].a * 1.3) j++;
    const n = j - i + 1;
    if (n >= 27 && n <= 30 && (!best || n < best[1] - best[0] + 1)) best = [i, j];
  }
  if (!best) return null;
  const c = comps.slice(best[0], best[1] + 1);
  return {
    x0: Math.min(...c.map(o => o.x0)),
    x1: Math.max(...c.map(o => o.x1)),
    y0: Math.min(...c.map(o => o.y0)),
    y1: Math.max(...c.map(o => o.y1))
  };
}

export function sampleMedianRGB(img, data, x, y, sc) {
  if (!data) return [0, 0, 0];
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const h = Math.max(2, Math.round(sc * 3)), a = [];
  for (let j = -h; j <= h; j++) {
    for (let i = -h; i <= h; i++) {
      const X = Math.round(x + i), Y = Math.round(y + j);
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const k = (Y * W + X) * 4;
      a.push([data.data[k], data.data[k + 1], data.data[k + 2]]);
    }
  }
  a.sort((p, q) => p[0] + p[1] + p[2] - q[0] - q[1] - q[2]);
  return a[a.length >> 1] || [0, 0, 0];
}
