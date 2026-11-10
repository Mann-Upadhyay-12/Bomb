// Reads one Password screenshot = one row: the 5 green letters currently showing on the 5 columns.
import { ensureOCRWorker, recognizeCell } from '../search/searchOCR.js';

// bright green letter ink, e.g. rgb(70, 245, 100); the dark-green display box is far darker
const isInk = (r, g, b) => g > 140 && g - r > 70 && g - b > 50;

function toData(img) {
  const sc = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * sc), H = Math.round(img.naturalHeight * sc);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  return g.getImageData(0, 0, W, H);
}

/**
 * Finds the 5 letter glyphs: green ink split into columns by vertical gaps.
 * Returns { mask, W, H, boxes: [{ x0, x1, y0, y1 }] } (left → right).
 */
export function findLetterBoxes(imgData) {
  const { data, width: W, height: H } = imgData;
  const mask = new Uint8Array(W * H);
  const colInk = new Int32Array(W);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    if (isInk(data[i], data[i + 1], data[i + 2])) { mask[p] = 1; colInk[p % W]++; }
  }
  // runs of columns that contain ink
  const runs = [];
  let start = -1;
  for (let x = 0; x <= W; x++) {
    const on = x < W && colInk[x] > 0;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  // merge runs separated by tiny gaps (letters with a split, e.g. "M" anti-aliasing)
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] <= 2) last[1] = r[1]; else merged.push([...r]);
  }
  let boxes = merged.map(([x0, x1]) => {
    let y0 = H, y1 = -1, n = 0;
    for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (mask[y * W + x]) { n++; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, x1, y0, y1, n };
  }).filter(b => b.n > 15 && b.y1 - b.y0 > 5);
  // keep the 5 biggest glyphs (stray green pixels elsewhere are dropped), in reading order
  if (boxes.length > 5) boxes = [...boxes].sort((a, b) => b.n - a.n).slice(0, 5);
  boxes.sort((a, b) => a.x0 - b.x0);
  // the 5 letters sit on one line with the same height — anything else isn't a Password row
  if (boxes.length === 5) {
    const hs = boxes.map(b => b.y1 - b.y0 + 1).sort((a, b) => a - b), h = hs[2];
    const ys = boxes.map(b => (b.y0 + b.y1) / 2).sort((a, b) => a - b), yc = ys[2];
    const aligned = boxes.every(b => Math.abs((b.y0 + b.y1) / 2 - yc) < h * 0.4 && Math.abs(b.y1 - b.y0 + 1 - h) < h * 0.35);
    if (!aligned) boxes = [];
  }
  return { mask, W, H, boxes };
}

// black-on-white, upscaled copy of glyph boxes (one box, or the whole row side by side)
function glyphCanvas(mask, W, boxes, gap = 0) {
  const h = Math.max(...boxes.map(b => b.y1 - b.y0 + 1));
  const scale = Math.max(1, 64 / h), pad = 16;
  const widths = boxes.map(b => Math.round((b.x1 - b.x0 + 1) * scale));
  const cv = document.createElement('canvas');
  cv.width = widths.reduce((s, w) => s + w, 0) + gap * (boxes.length - 1) + pad * 2;
  cv.height = Math.round(h * scale) + pad * 2;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#000';
  let ox = pad;
  boxes.forEach((b, i) => {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, oy = pad + Math.round((h - bh) * scale);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (mask[(b.y0 + y) * W + b.x0 + x]) g.fillRect(ox + Math.floor(x * scale), oy + Math.floor(y * scale), Math.ceil(scale), Math.ceil(scale));
    }
    ox += widths[i] + gap;
  });
  return cv;
}

const clean = t => (t || '').toUpperCase().replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S')
  .replace(/8/g, 'B').replace(/2/g, 'Z').replace(/6/g, 'G').replace(/[^A-Z]/g, '');

/**
 * OCR the row: the 5 letters are read together as one line first (more context for Tesseract),
 * then any letter that line read missed is read on its own. `allowed[i]` (optional) is the set of
 * letters column i can show according to the passwords list; a read outside it is flagged.
 * @returns {Promise<{ ok: boolean, row?: string, unsure?: boolean[], reason?: string }>}
 */
export async function readPasswordRow(img, allowed = null, onStatus = () => {}) {
  const { mask, W, boxes } = findLetterBoxes(toData(img));
  if (boxes.length !== 5) {
    return { ok: false, reason: `Found ${boxes.length} letters instead of 5 — type the row instead.` };
  }
  onStatus('Starting OCR…');
  const worker = await ensureOCRWorker();

  onStatus('Reading the row…');
  let line = '', lineConf = 0;
  try {
    await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', tessedit_pageseg_mode: '7' });
    const { data } = await worker.recognize(glyphCanvas(mask, W, boxes, 28));
    line = clean(data && data.text);
    lineConf = Number((data && data.confidence) || 0);
  } catch (e) {}

  const letters = line.length === 5 ? line.split('') : Array(5).fill('');
  const unsure = Array(5).fill(line.length === 5 && lineConf < 60);
  for (let i = 0; i < 5; i++) {
    if (letters[i] && !(allowed && allowed[i] && !allowed[i].has(letters[i]))) continue;
    onStatus(`Reading letter ${i + 1}/5…`);
    const rec = await recognizeCell(worker, glyphCanvas(mask, W, [boxes[i]]));
    const ch = rec.letter && rec.letter !== '?' ? rec.letter : (letters[i] || '?');
    letters[i] = ch;
    unsure[i] = ch === '?' || rec.confidence < 60;
  }
  for (let i = 0; i < 5; i++) if (allowed && allowed[i] && !allowed[i].has(letters[i])) unsure[i] = true;
  return { ok: true, row: letters.join(''), unsure };
}
