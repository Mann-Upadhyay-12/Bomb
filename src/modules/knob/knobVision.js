// Computer vision for the Knobs 12-LED panel (module picture: two rows of six round lamps above the
// knob; lit = yellow, unlit = dark grey). Read from the pixels — OCR only as a last resort, since a
// whitelist of X / O makes Tesseract read every round lamp, lit or not, as an "O".

import { ensureOCRWorker } from '../search/searchOCR.js';

const isLit = (r, g, b) => r > 180 && g > 120 && b < 120 && r - b > 100;
const UNLIT = [42, 47, 54];
const isUnlit = (r, g, b) => Math.abs(r - UNLIT[0]) + Math.abs(g - UNLIT[1]) + Math.abs(b - UNLIT[2]) <= 18;

// Lamp centres in the 440×440 module picture, as fractions (fallback when the blobs aren't clean)
const GRID_X = [0, 1, 2, 3, 4, 5].map(i => (90 + 52 * i) / 440);
const GRID_Y = [150 / 440, 210 / 440];

// round, lamp-sized blobs of one class (1 = lit, 2 = unlit)
function lampBlobs(cls, W, H) {
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H), out = [];
  const min = Math.min(W, H) * 0.04, max = Math.min(W, H) * 0.12;
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!cls[p0] || seen[p0]) continue;
    const k = cls[p0];
    let sp = 0, n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
    stack[sp++] = p0; seen[p0] = 1;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p - x) / W;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && cls[p - 1] === k && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < W - 1 && cls[p + 1] === k && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && cls[p - W] === k && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
      if (y < H - 1 && cls[p + W] === k && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw >= min && bw <= max && bh >= min && bh <= max && Math.abs(bw - bh) <= Math.max(bw, bh) * 0.3 && n >= bw * bh * 0.45) {
      out.push({ lit: k === 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, size: Math.max(bw, bh) });
    }
  }
  return out;
}

/**
 * Read the 12 lamps from RGBA pixels of a W×H module picture.
 * Returns { state: [12 × 0/1] (top row then bottom row, left → right), how: 'lamps' | 'grid' } or null.
 */
export function readKnobLeds(data, W, H) {
  const cls = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    cls[p] = isLit(r, g, b) ? 1 : isUnlit(r, g, b) ? 2 : 0;
  }
  // 1. find the lamps themselves: exactly two rows of six
  const blobs = lampBlobs(cls, W, H).sort((a, b) => a.cy - b.cy);
  if (blobs.length === 12) {
    const top = blobs.slice(0, 6).sort((a, b) => a.cx - b.cx), bot = blobs.slice(6).sort((a, b) => a.cx - b.cx);
    const size = blobs[0].size;
    const flat = row => row[5].cy - row[0].cy < size * 0.5 && Math.abs(row[0].cy - row[5].cy) < size;
    const sameRows = Math.min(...bot.map(b => b.cy)) - Math.max(...top.map(t => t.cy)) > size;
    if (flat(top) && flat(bot) && sameRows) {
      return { state: [...top, ...bot].map(b => (b.lit ? 1 : 0)), how: 'lamps' };
    }
  }
  // 2. fixed lamp spots of the module picture: every spot must look like a lamp (lit or unlit)
  const rad = Math.max(2, Math.round(Math.min(W, H) * 0.025));
  const state = [], lampLike = [];
  for (const fy of GRID_Y) for (const fx of GRID_X) {
    const cx = Math.round(fx * W), cy = Math.round(fy * H);
    let lit = 0, unlit = 0, n = 0;
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      n++;
      const c = cls[y * W + x];
      if (c === 1) lit++; else if (c === 2) unlit++;
    }
    state.push(lit > n * 0.3 ? 1 : 0);
    lampLike.push(lit + unlit > n * 0.5);
  }
  // ...and the gaps between neighbouring lamps must be panel background, not lamp colour
  let gapsClear = 0;
  for (const fy of GRID_Y) for (let c = 0; c < 5; c++) {
    const x = Math.round((GRID_X[c] + GRID_X[c + 1]) / 2 * W), y = Math.round(fy * H);
    if (x >= 0 && y >= 0 && x < W && y < H && !cls[y * W + x]) gapsClear++;
  }
  if (lampLike.filter(Boolean).length >= 11 && gapsClear >= 9) return { state, how: 'grid' };
  return null;
}

/** img (HTMLImageElement) → 12 × 0/1, or null when no lamps (nor X / O text) are found. */
export async function detectKnobStateFromImage(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const leds = readKnobLeds(ctx.getImageData(0, 0, W, H).data, W, H);
  if (leds) return leds.state;

  // Last resort: the LEDs typed out as two rows of X / O (or 1 / 0) text
  try {
    const worker = await ensureOCRWorker();
    // Reset page-segmentation mode too: the shared worker may still be in single-char mode from Search
    await worker.setParameters({ tessedit_char_whitelist: 'XO01 \n\r\t', tessedit_pageseg_mode: '6', user_defined_dpi: '150' });
    const { data } = await worker.recognize(canvas);
    const text = data.text.toUpperCase().replace(/[01]/g, m => (m === '1' ? 'X' : 'O'));
    const matches = text.match(/[XO]{6}/g);
    if (matches && matches.length >= 2) {
      return [...matches[0], ...matches[1]].map(c => (c === 'X' ? 1 : 0));
    }
  } catch (e) {}
  return null;
}
