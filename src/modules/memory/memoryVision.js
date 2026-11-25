// Reads a Memory module picture: the green display digit, the four white button labels (left →
// right) and the stage dots between them. Locating is plain pixel work; the digits (1–4 only) are
// read with the shared Tesseract pool.

/** 8-connected pieces of a mask → [{ x0, y0, x1, y1, n }] */
export function pieces(mask, W, H) {
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H), out = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    let top = 0, n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const p = stack[--top], x = p % W, y = (p - x) / W; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; }
      }
    }
    out.push({ x0, y0, x1, y1, n, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}

const union = (ps) => [Math.min(...ps.map(p => p.x0)), Math.min(...ps.map(p => p.y0)), Math.max(...ps.map(p => p.x1)), Math.max(...ps.map(p => p.y1))];

/** { data, width, height } → { display: box, buttons: [box ×4], dots: { total, lit } } or { reason } */
export function locateMemory({ data, width: W, height: H }) {
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  const green = new Uint8Array(W * H), white = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = px(i);
    if (g > 140 && g - r > 60 && g - b > 30) green[i] = 1;
    if (Math.min(r, g, b) > 200) white[i] = 1;
  }
  const gp = pieces(green, W, H).filter(p => p.h >= H * 0.05 && p.y1 < H * 0.65);
  if (!gp.length) return { reason: 'No green display number found — is this the Memory module?' };
  const dispPiece = gp.sort((a, b) => b.n - a.n)[0];
  const display = [dispPiece.x0, dispPiece.y0, dispPiece.x1, dispPiece.y1];
  // labels: white pieces below the display, about as tall as each other
  const wp = pieces(white, W, H).filter(p => p.y0 > dispPiece.y1 + H * 0.05 && p.h >= H * 0.035 && p.h <= H * 0.2);
  let row = [];
  for (const p of wp) {
    const r = wp.filter(o => Math.min(o.y1, p.y1) - Math.max(o.y0, p.y0) >= Math.min(o.h, p.h) * 0.5);
    if (r.length > row.length) row = r;
  }
  row.sort((a, b) => a.x0 - b.x0);
  // a label in two pieces (a "4" with a gap): join pieces that overlap in x
  const labels = [];
  for (const p of row) {
    const last = labels[labels.length - 1];
    if (last && p.x0 <= last[2] + W * 0.01) { last[0] = Math.min(last[0], p.x0); last[1] = Math.min(last[1], p.y0); last[2] = Math.max(last[2], p.x1); last[3] = Math.max(last[3], p.y1); }
    else labels.push([p.x0, p.y0, p.x1, p.y1]);
  }
  // stage dots: small round pieces between the display and the labels that aren't panel colour
  const bandTop = dispPiece.y1 + Math.round(H * 0.03), bandBot = labels.length ? Math.min(...labels.map(l => l[1])) - Math.round(H * 0.06) : Math.round(H * 0.65);
  const dotMask = new Uint8Array(W * H), litMask = new Uint8Array(W * H);
  for (let y = Math.max(0, bandTop); y < Math.min(H, bandBot); y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, [r, g, b] = px(i);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx >= 47 && mx - mn < 40 && mx < 90) dotMask[i] = 1; // unlit grey (the panel is #1f2228)
    if (mx > 110 && mx - mn > 50) { dotMask[i] = 1; litMask[i] = 1; } // a coloured (lit) dot
  }
  const dots = pieces(dotMask, W, H).filter(p => p.w >= W * 0.015 && p.w <= W * 0.06 && Math.abs(p.w - p.h) <= Math.max(2, p.w * 0.35));
  const lit = dots.filter(d => { let n = 0; for (let y = d.y0; y <= d.y1; y++) for (let x = d.x0; x <= d.x1; x++) n += litMask[y * W + x]; return n > d.w * d.h * 0.3; }).length;
  if (labels.length !== 4) return { display, labels, dots: { total: dots.length, lit }, reason: `Found ${labels.length} button labels instead of 4 — type them below.` };
  return { display, labels, dots: { total: dots.length, lit } };
}

function inkCanvas(src, [x0, y0, x1, y1], test, h = 64) {
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, pad = Math.round(bh * 0.35);
  const k = h / bh;
  const c = document.createElement('canvas');
  c.width = Math.round((bw + pad * 2) * k); c.height = Math.round((bh + pad * 2) * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  const out = g.getImageData(0, 0, c.width, c.height);
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const sx = Math.round(x / k) - pad + x0, sy = Math.round(y / k) - pad + y0;
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
    const i = (sy * src.width + sx) * 4;
    if (test(src.data[i], src.data[i + 1], src.data[i + 2])) { const o = (y * c.width + x) * 4; out.data[o] = out.data[o + 1] = out.data[o + 2] = 0; }
  }
  g.putImageData(out, 0, 0);
  return c;
}

/** Picture → { ok, display, labels: [n ×4], dots, sure } or { ok: false, reason } */
export async function readMemoryImage(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const id = ctx.getImageData(0, 0, W, H);
  const loc = locateMemory(id);
  if (!loc.display) return { ok: false, reason: loc.reason };
  const { ensureOCRWorker } = await import('../search/searchOCR.js');
  const worker = await ensureOCRWorker();
  const isGreen = (r, g, b) => g > 140 && g - r > 60 && g - b > 30;
  const isWhite = (r, g, b) => Math.min(r, g, b) > 170;
  const read1 = async (box, test) => {
    // of 1–4 only "1" is narrow (about 0.4 of its height; the others 0.7–0.8): alone, OCR reads it as l or |
    if ((box[2] - box[0] + 1) / (box[3] - box[1] + 1) < 0.55) return 1;
    await worker.setParameters({ tessedit_char_whitelist: '1234', tessedit_pageseg_mode: '10' });
    const t = (await worker.recognize(inkCanvas(id, box, test))).data.text.replace(/[^1-4]/g, '');
    return t ? Number(t[0]) : null;
  };
  const display = await read1(loc.display, isGreen);
  let labels = [];
  if (loc.labels.length === 4) {
    await worker.setParameters({ tessedit_char_whitelist: '1234', tessedit_pageseg_mode: '7' });
    const line = (await worker.recognize(inkCanvas(id, union(loc.labels.map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }))), isWhite))).data.text.replace(/[^1-4]/g, '');
    const perm = (a) => a.length === 4 && new Set(a).size === 4;
    if (perm(line.split(''))) labels = line.split('').map(Number);
    else {
      for (const box of loc.labels) labels.push(await read1(box, isWhite));
      // labels are 1–4 once each: one unread or repeated label is the one missing
      const known = labels.filter((v, i) => v && labels.indexOf(v) === i);
      if (known.length === 3) { const miss = [1, 2, 3, 4].find(n => !known.includes(n)); labels = labels.map((v, i) => (v && labels.indexOf(v) === i ? v : miss)); }
    }
  }
  const sure = display !== null && labels.length === 4 && new Set(labels).size === 4 && labels.every(Boolean);
  return { ok: display !== null, display, labels, dots: loc.dots, sure, reason: loc.reason || (display === null ? 'Could not read the display number — type it below.' : '') };
}
