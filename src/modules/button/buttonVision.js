// The Button — screenshot reader.
//  1. flood-fill the button from the image centre (everything that differs from the dark panel)
//  2. physical colour = dominant colour bucket of the button pixels
//  3. label = OCR of the pixels that contrast with the button colour, snapped to the label vocabulary
//  4. stage = the dots under the button (green = done, other lit colour = current)

import { ensureOCRWorker } from '../search/searchOCR.js';
import { matchWord } from '../wof/wofSolver.js';

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

/** Colour bucket name for one pixel. */
export function colorBucket(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (v < 0.22) return 'black';
  if (s < 0.2) return v > 0.62 ? 'white' : 'gray';
  if (h < 14 || h >= 340) return 'red';
  if (h < 40) return 'orange';
  if (h < 68) return 'yellow';
  if (h < 165) return 'green';
  if (h < 255) return 'blue';
  return 'purple';
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function analyzeButtonImage(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sc = Math.min(1, 600 / Math.max(iw, ih));
  const W = Math.max(1, Math.round(iw * sc)), H = Math.max(1, Math.round(ih * sc));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

  // Panel background: most common dark-ish colour in a ring around the centre
  const tally = new Map();
  for (let y = Math.floor(H * 0.2); y < H * 0.85; y += 3) {
    for (const x of [Math.floor(W * 0.12), Math.floor(W * 0.88)]) {
      const p = px(x, y); const k = p.map(v => v >> 3).join(',');
      tally.set(k, (tally.get(k) || 0) + 1);
    }
  }
  let bgKey = null, bgN = -1;
  tally.forEach((n, k) => { if (n > bgN) { bgN = n; bgKey = k; } });
  const bg = bgKey ? bgKey.split(',').map(v => Number(v) * 8 + 4) : [31, 34, 40];

  // Flood fill from the centre over "not background" pixels
  const x0 = Math.floor(W * 0.06), x1 = Math.ceil(W * 0.94), y0 = Math.floor(H * 0.18), y1 = Math.ceil(H * 0.9);
  const isFg = (x, y) => dist(px(x, y), bg) > 38;
  let sx = Math.floor(W / 2), sy = Math.floor(H / 2);
  if (!isFg(sx, sy)) {
    // search a small neighbourhood for a seed
    let found = false;
    for (let r = 2; r < Math.min(W, H) * 0.15 && !found; r += 2) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        if (isFg(sx + dx, sy + dy)) { sx += dx; sy += dy; found = true; break; }
      }
    }
    if (!found) return { ok: false, reason: 'Could not find the button in the screenshot.' };
  }
  const seen = new Uint8Array(W * H);
  const stack = [sy * W + sx]; seen[sy * W + sx] = 1;
  let bx0 = W, by0 = H, bx1 = 0, by1 = 0, area = 0;
  const buckets = {};
  while (stack.length) {
    const k = stack.pop(), x = k % W, y = (k / W) | 0;
    area++;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    const p = px(x, y), bk = colorBucket(...p);
    (buckets[bk] = buckets[bk] || { n: 0, r: 0, g: 0, b: 0 });
    buckets[bk].n++; buckets[bk].r += p[0]; buckets[bk].g += p[1]; buckets[bk].b += p[2];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
      const q = ny * W + nx;
      if (!seen[q] && isFg(nx, ny)) { seen[q] = 1; stack.push(q); }
    }
  }
  if (area < W * H * 0.02) return { ok: false, reason: 'Button region too small — crop the screenshot to the module.' };

  const ranked = Object.entries(buckets).sort((a, b) => b[1].n - a[1].n);
  const [color, cb] = ranked[0];
  const btnRGB = [cb.r / cb.n, cb.g / cb.n, cb.b / cb.n];
  const confidence = cb.n / area;

  // Text mask: inside the button box, pixels far from the button colour
  const ix = Math.round((bx1 - bx0) * 0.07), iy = Math.round((by1 - by0) * 0.12);
  const tx0 = bx0 + ix, ty0 = by0 + iy, tw = Math.max(1, bx1 - bx0 - 2 * ix), th = Math.max(1, by1 - by0 - 2 * iy);
  const f = Math.max(2, Math.round(90 / th));
  const tc = document.createElement('canvas');
  const P = 24;
  tc.width = tw * f + 2 * P; tc.height = th * f + 2 * P;
  const tctx = tc.getContext('2d');
  tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, tc.width, tc.height);
  const small = document.createElement('canvas'); small.width = tw; small.height = th;
  const sctx = small.getContext('2d');
  const out = sctx.createImageData(tw, th);
  let ink = 0;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const p = px(tx0 + x, ty0 + y), o = (y * tw + x) * 4;
    const on = dist(p, btnRGB) > 80;
    if (on) ink++;
    const v = on ? 0 : 255;
    out.data[o] = out.data[o + 1] = out.data[o + 2] = v; out.data[o + 3] = 255;
  }
  sctx.putImageData(out, 0, 0);
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(small, P, P, tw * f, th * f);
  // re-threshold after smoothing so Tesseract gets crisp strokes
  const td = tctx.getImageData(0, 0, tc.width, tc.height);
  for (let i = 0; i < td.data.length; i += 4) { const v = td.data[i] < 140 ? 0 : 255; td.data[i] = td.data[i + 1] = td.data[i + 2] = v; }
  tctx.putImageData(td, 0, 0);

  // Stage dots under the button
  const dots = [];
  const dy0 = Math.min(H - 1, by1 + 4), dy1 = Math.min(H, Math.round(H * 0.97));
  const dseen = new Uint8Array(W * H);
  for (let y = dy0; y < dy1; y++) for (let x = x0; x < x1; x++) {
    const k = y * W + x;
    if (dseen[k]) continue;
    // any blob that stands out from the panel: lit (green/peach) or unlit (grey) dots
    const isDot = (xx, yy) => dist(px(xx, yy), bg) > 22;
    if (!isDot(x, y)) continue;
    const st = [k]; dseen[k] = 1; let n = 0, ax = 0, ar = 0, ag = 0, ab = 0, minx = x, maxx = x, miny = y, maxy = y;
    while (st.length) {
      const q = st.pop(), qx = q % W, qy = (q / W) | 0; const pp = px(qx, qy);
      n++; ax += qx; ar += pp[0]; ag += pp[1]; ab += pp[2];
      if (qx < minx) minx = qx; if (qx > maxx) maxx = qx; if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
      for (const [nx, ny] of [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]]) {
        if (nx < x0 || nx >= x1 || ny < dy0 || ny >= dy1) continue;
        const r2 = ny * W + nx; if (dseen[r2]) continue;
        if (isDot(nx, ny)) { dseen[r2] = 1; st.push(r2); }
      }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (n >= 12 && bw < W * 0.08 && bh < H * 0.08 && bw / bh > 0.6 && bw / bh < 1.6) {
      dots.push({ x: ax / n, bucket: colorBucket(ar / n, ag / n, ab / n) });
    }
  }
  dots.sort((a, b) => a.x - b.x);
  let stage = null;
  if (dots.length >= 2 && dots.length <= 6) {
    // green = defused, the other lit dot = current, grey/dark = still to come
    const done = dots.filter(dt => dt.bucket === 'green').length;
    stage = { total: dots.length, current: Math.min(dots.length, done + 1), done };
  }

  return { ok: true, color, confidence, labelCanvas: tc, hasInk: ink > tw * th * 0.01, stage, box: [bx0, by0, bx1, by1] };
}

/** Full read: colour + stage synchronously, label via OCR (snapped to `vocab`). */
export async function readButtonImage(img, vocab, onStatus = () => {}) {
  const res = analyzeButtonImage(img);
  if (!res.ok) return res;
  let label = '', labelRaw = '', labelSure = false;
  if (res.hasInk) {
    try {
      onStatus('Reading the label…');
      const worker = await ensureOCRWorker();
      let best = { w: '', d: 99, amb: true };
      for (const psm of ['8', '7']) {
        await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', tessedit_pageseg_mode: psm, user_defined_dpi: '300' });
        const { data } = await worker.recognize(res.labelCanvas);
        const txt = String(data.text || '').trim();
        const r = matchWord(txt, vocab);
        if (r.d < best.d) { best = r; labelRaw = txt; }
        if (best.d === 0) break;
      }
      const ok = best.w && best.d <= Math.max(1, Math.floor((best.len || 1) * 0.34));
      label = ok ? best.w : '';
      labelSure = ok && best.d === 0 && !best.amb;
    } catch (e) {
      res.ocrError = e.message;
    }
  }
  return { ...res, label, labelRaw, labelSure };
}
