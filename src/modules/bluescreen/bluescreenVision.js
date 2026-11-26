// Reads the error number from a Bluescreen crash picture: the big white digits at the bottom of the
// blue screen, right of the square code. Locating is plain pixel work (testable in node); the digits
// are read with the shared Tesseract pool.

const isBlue = (r, g, b) => b > 140 && b - r > 90 && b - g > 50;

/**
 * { data, width, height } (ImageData-like) → { panel, glyphs, box } or { reason }.
 * panel: the blue screen [x0, y0, x1, y1]; glyphs: each digit's box, left to right; box: all of them.
 */
export function locateErrorNumber({ data, width: W, height: H }) {
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  // the blue screen: the rows and columns that are mostly blue
  const rows = new Int32Array(H), cols = new Int32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = px(x, y); if (isBlue(r, g, b)) { rows[y]++; cols[x]++; } }
  const maxR = Math.max(...rows), maxC = Math.max(...cols);
  if (maxR < W * 0.2 || maxC < H * 0.2) return { reason: 'No blue screen in this picture — is the Bluescreen crashed?' };
  const span = (arr, max) => { let a = 0, b = arr.length - 1; while (arr[a] < max * 0.3) a++; while (arr[b] < max * 0.3) b--; return [a, b]; };
  const [x0, x1] = span(cols, maxC), [y0, y1] = span(rows, maxR);
  const pw = x1 - x0 + 1, ph = y1 - y0 + 1;

  // white ink inside the screen (text #f3f6fc, soft edges up to the blue)
  const mask = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const [r, g, b] = px(x0 + x, y0 + y); if (Math.min(r, g, b) > 175) mask[y * pw + x] = 1; }

  // connected pieces of ink (8-connected)
  const seen = new Uint8Array(pw * ph), stack = new Int32Array(pw * ph), parts = [];
  for (let s = 0; s < pw * ph; s++) {
    if (!mask[s] || seen[s]) continue;
    let n = 0, top = 0, bx0 = pw, by0 = ph, bx1 = -1, by1 = -1;
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const p = stack[--top], x = p % pw, y = (p - x) / pw; n++;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= pw || ny >= ph) continue;
        const q = ny * pw + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; }
      }
    }
    parts.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, n, w: bx1 - bx0 + 1, h: by1 - by0 + 1 });
  }
  // digits: tall (the number is the biggest text), in the lower half, not the solid squares of the code
  const digits = parts.filter(p => p.h >= ph * 0.08 && p.h <= ph * 0.3 && (p.y0 + p.y1) / 2 > ph * 0.5
    && p.w <= p.h * 1.1 && p.n / (p.w * p.h) < 0.8);
  if (!digits.length) return { reason: 'Found the blue screen but no error number on it.' };
  // the row with the most digits of one height
  let best = null;
  for (const d of digits) {
    const row = digits.filter(o => Math.min(o.y1, d.y1) - Math.max(o.y0, d.y0) >= Math.min(o.h, d.h) * 0.6 && Math.abs(o.h - d.h) <= d.h * 0.25);
    if (!best || row.length > best.length) best = row;
  }
  best.sort((a, b) => a.x0 - b.x0);
  const glyphs = best.map(p => [x0 + p.x0, y0 + p.y0, x0 + p.x1, y0 + p.y1]);
  const box = [Math.min(...glyphs.map(g => g[0])), Math.min(...glyphs.map(g => g[1])), Math.max(...glyphs.map(g => g[2])), Math.max(...glyphs.map(g => g[3]))];
  return { panel: [x0, y0, x1, y1], glyphs, box };
}

// dark ink on white, `h` px tall, for Tesseract
function inkCanvas(img, [bx0, by0, bx1, by1], h = 64) {
  const pad = Math.round((by1 - by0 + 1) * 0.3);
  const sx = Math.max(0, bx0 - pad), sy = Math.max(0, by0 - pad);
  const sw = Math.min(img.width - sx, bx1 - bx0 + 1 + pad * 2), sh = Math.min(img.height - sy, by1 - by0 + 1 + pad * 2);
  const k = h / (by1 - by0 + 1);
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(img.canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.min(d.data[i], d.data[i + 1], d.data[i + 2]);
    const ink = v > 175 ? 0 : 255; // white text → black ink
    d.data[i] = d.data[i + 1] = d.data[i + 2] = ink; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}

/**
 * Picture (img / canvas) → { ok, error, sure } or { ok: false, reason }.
 * sure: false when the line didn't read as 4 digits, or the picture doesn't show 4 digit shapes.
 */
export async function readBluescreenImage(img, onStatus = () => {}) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const id = g.getImageData(0, 0, W, H);
  const loc = locateErrorNumber(id);
  if (!loc.glyphs) return { ok: false, reason: loc.reason };
  onStatus('Reading the error number…');
  const { ensureOCRWorker } = await import('../search/searchOCR.js');
  const worker = await ensureOCRWorker();
  const src = { canvas: cv, width: W, height: H };
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '7' });
  const line = (await worker.recognize(inkCanvas(src, loc.box))).data.text.replace(/\D/g, '');
  const four = (s) => /^\d{4}$/.test(s);
  // the whole line reads best; digit by digit only when it didn't give four (alone, a bold 0 can read as 1)
  let each = '';
  if (!four(line)) {
    await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '10' });
    for (const box of loc.glyphs) each += ((await worker.recognize(inkCanvas(src, box))).data.text.replace(/\D/g, '') || '?')[0];
  }
  const error = four(line) ? line : four(each) ? each : (line || each);
  return { ok: four(error), error, sure: four(line) && loc.glyphs.length === 4, line, each, reason: four(error) ? '' : `Read "${error}" — type the 4-digit error number below.` };
}
