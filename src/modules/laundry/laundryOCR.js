// Laundry — a pasted picture (browser only: canvas + Tesseract):
//   • the module picture → the symbols the four tiles show now
//   • a screenshot of the whole bot message → those symbols, plus the captured counts and the serial
//     read from the text above the module picture
//   • a picture of the helper manual (or one of its pages) → its text, for the manual box

import { ensureOCRWorker } from '../search/searchOCR.js';
import { readLaundryModule } from './laundryVision.js';
import { parseLaundryText, parseLaundryManual, manualHasAny, isLoadMessage } from './laundrySolver.js';

// the pool's workers start with a capitals-and-digits whitelist: the message needs everything
const TEXT_CHARS = '';

export function pictureData(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { canvas: c, data: ctx.getImageData(0, 0, W, H) };
}

/** The band [y0, y1) as dark text on white, scaled so small desktop text is big enough to read. */
function textBand(src, y0, y1) {
  const W = src.data.width, h = y1 - y0;
  const scale = Math.min(3, Math.max(1, 1600 / W));
  const d = src.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, y0, W, h);
  const p = d.data;
  // Discord's dark theme: light text on a dark background → flip so the text is dark
  let sum = 0;
  for (let i = 0; i < p.length; i += 16) sum += 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
  const dark = sum / (p.length / 16) < 128;
  for (let i = 0; i < p.length; i += 4) {
    let v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    if (dark) v = 255 - v;
    v = Math.max(0, Math.min(255, (v - 40) * 1.4)); // stretch: grey text → black
    p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255;
  }
  const small = document.createElement('canvas');
  small.width = W; small.height = h;
  small.getContext('2d').putImageData(d, 0, 0);
  const out = document.createElement('canvas');
  out.width = Math.round(W * scale); out.height = Math.round(h * scale);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

async function readText(canvas, psm) {
  const w = await ensureOCRWorker();
  await w.setParameters({ tessedit_pageseg_mode: psm, user_defined_dpi: '300', tessedit_char_whitelist: TEXT_CHARS });
  const { data } = await w.recognizeWithin(25000, canvas);
  return (data && data.text) || '';
}

/**
 * → { ok, type: 'module', symbols, facts, text }   (module picture or a screenshot of the message)
 *   { ok, type: 'manual', text, manual }            (the helper manual, or a page of it)
 *   { ok, type: 'message', facts, text }            (the message text without the module picture)
 *   { ok: false, reason }
 */
export async function readLaundryPicture(img, onStatus = () => {}) {
  const src = pictureData(img);
  const symbols = readLaundryModule(src.data);
  if (symbols.ok) {
    // text above the module picture → a screenshot of the bot message (not just the module)
    const top = Math.min(...symbols.tiles.map(t => t.y0));
    const tile = symbols.tiles[0].x1 - symbols.tiles[0].x0 + 1;
    let facts = null, text = '';
    if (top > tile * 2.5) {
      onStatus('Reading the bot message text…');
      try {
        text = await readText(textBand(src, 0, Math.max(1, Math.round(top - tile * 0.6))), '6');
        const f = parseLaundryText(text);
        if (['remaining', 'solved', 'needy', 'total', 'serial'].some(k => f[k] != null)) facts = f;
      } catch (e) { /* no OCR: the counts can still be typed */ }
    }
    return { ok: true, type: 'module', symbols, facts, text };
  }
  // no symbol tiles: the manual (or the message) as a picture of text
  onStatus('Reading the text in the picture…');
  let text = '';
  try { text = await readText(textBand(src, 0, src.data.height), '4'); } catch (e) { return { ok: false, reason: 'Could not read the text in that picture.' }; }
  if (isLoadMessage(text)) return { ok: true, type: 'message', facts: parseLaundryText(text), text };
  const manual = parseLaundryManual(text);
  if (manualHasAny(manual)) return { ok: true, type: 'manual', text: text.replace(/\n{3,}/g, '\n\n').trim(), manual };
  return { ok: false, reason: 'Not a Laundry module picture, message or manual.', text };
}
