// Reads the wires from a Wires module picture: each wire hangs between two grey caps. The top caps
// give the wires' places (left → right); along each wire the pixel that differs most from the panel
// (#1f2228) is classed red / yellow / blue / white / black and the colours vote.

const dist = (r, g, b, R, G, B) => Math.hypot(r - R, g - G, b - B);

export function classifyWirePixel(r, g, b) {
  if (r > 140 && r - g > 70 && r - b > 70) return 'red';
  if (r > 160 && g > 130 && b < 130 && r - b > 70) return 'yellow';
  if (b > 140 && b - r > 60 && b - g > 15) return 'blue';
  if (Math.min(r, g, b) > 185) return 'white';
  if (Math.max(r, g, b) < 75 && Math.max(r, g, b) - Math.min(r, g, b) <= 8) return 'black';
  return null;
}

/** { data, width, height } → { wires: [colour], places: [x], sure } or { reason } */
export function readWiresPixels({ data, width: W, height: H }) {
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  // the panel colour: the commonest dark colour in the middle band
  const hist = new Map();
  for (let y = Math.round(H * 0.4); y < H * 0.7; y += 3) for (let x = Math.round(W * 0.1); x < W * 0.9; x += 3) {
    const [r, g, b] = px(x, y); const k = `${r >> 2},${g >> 2},${b >> 2}`; hist.set(k, (hist.get(k) || 0) + 1);
  }
  const [bgKey] = [...hist.entries()].sort((a, b) => b[1] - a[1])[0];
  const [BR, BG, BB] = bgKey.split(',').map(v => Number(v) * 4 + 2);

  // the caps: columns of the top band with ink that isn't panel
  const yA = Math.round(H * 0.15), yB = Math.round(H * 0.4);
  const ink = new Int32Array(W);
  for (let x = Math.round(W * 0.06); x < W * 0.94; x++) for (let y = yA; y < yB; y++) { const [r, g, b] = px(x, y); if (dist(r, g, b, BR, BG, BB) > 25) ink[x]++; }
  const runs = [];
  let cur = null;
  for (let x = 0; x < W; x++) {
    if (ink[x] >= 3) { if (!cur) cur = { x0: x, x1: x }; cur.x1 = x; }
    else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  // a cap is about 6% of the picture wide; drop slivers (an edge, a screw) and anything far wider
  const caps = runs.filter(r => r.x1 - r.x0 + 1 >= W * 0.03 && r.x1 - r.x0 + 1 <= W * 0.12);
  if (caps.length < 3 || caps.length > 6) return { reason: `Found ${caps.length} wire${caps.length === 1 ? '' : 's'} — is this the Wires module? Tap the colours below.` };

  // each wire's colour, voted along its length
  const wires = [], votes = [];
  for (const c of caps) {
    const xc = (c.x0 + c.x1) / 2, half = (c.x1 - c.x0 + 1) * 0.6;
    const tally = {};
    let n = 0;
    for (let y = Math.round(H * 0.4); y < H * 0.72; y += 2) {
      let best = null, bd = 0;
      for (let x = Math.max(0, Math.round(xc - half)); x <= Math.min(W - 1, Math.round(xc + half)); x++) {
        const [r, g, b] = px(x, y); const d = dist(r, g, b, BR, BG, BB);
        if (d > bd) { bd = d; best = [r, g, b]; }
      }
      if (!best || bd < 10) continue;
      const k = classifyWirePixel(...best);
      if (k) { tally[k] = (tally[k] || 0) + 1; n++; }
    }
    const [top, cnt] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] || [null, 0];
    wires.push(top);
    votes.push(n ? cnt / n : 0);
  }
  return { wires, places: caps.map(c => Math.round((c.x0 + c.x1) / 2)), sure: wires.every(Boolean) && votes.every(v => v >= 0.6), votes };
}

/** An <img> / canvas → readWiresPixels' result */
export function readWiresImage(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  return readWiresPixels(g.getImageData(0, 0, W, H));
}
