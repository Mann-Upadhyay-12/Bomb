// Reads the word on an Echo module picture: the light letters in the middle of the panel (the
// stage marks above and the bar below are dark). Read with the shared Tesseract pool, letters only.
import { pieces } from '../memory/memoryVision.js';

/** { data, width, height } → { box } or { reason } */
export function locateEchoWord({ data, width: W, height: H }) {
  const mask = new Uint8Array(W * H);
  for (let y = Math.round(H * 0.25); y < H * 0.85; y++) for (let x = Math.round(W * 0.05); x < W * 0.95; x++) {
    const i = (y * W + x) * 4;
    if (Math.min(data[i], data[i + 1], data[i + 2]) > 170) mask[y * W + x] = 1;
  }
  const ps = pieces(mask, W, H).filter(p => p.h >= H * 0.03 && p.n >= 12);
  if (!ps.length) return { reason: 'No word found — is this the Echo module? Type the word below.' };
  // the letters: the tallest piece's line
  const tall = ps.sort((a, b) => b.h - a.h)[0];
  const line = ps.filter(p => Math.min(p.y1, tall.y1) - Math.max(p.y0, tall.y0) >= Math.min(p.h, tall.h) * 0.5);
  if (line.length < 2) return { reason: 'No word found — is this the Echo module? Type the word below.' };
  return { box: [Math.min(...line.map(p => p.x0)), Math.min(...line.map(p => p.y0)), Math.max(...line.map(p => p.x1)), Math.max(...line.map(p => p.y1))], letters: line.length };
}

/** Picture → { ok, word, letters } or { ok: false, reason } */
export async function readEchoImage(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const id = ctx.getImageData(0, 0, W, H);
  const loc = locateEchoWord(id);
  if (!loc.box) return { ok: false, reason: loc.reason };
  const [x0, y0, x1, y1] = loc.box;
  const bh = y1 - y0 + 1, pad = Math.round(bh * 0.35), k = 60 / bh;
  const c = document.createElement('canvas');
  c.width = Math.round((x1 - x0 + 1 + pad * 2) * k); c.height = Math.round((bh + pad * 2) * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(cv, x0 - pad, y0 - pad, x1 - x0 + 1 + pad * 2, bh + pad * 2, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.min(d.data[i], d.data[i + 1], d.data[i + 2]) > 150 ? 0 : 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const { ensureOCRWorker } = await import('../search/searchOCR.js');
  const worker = await ensureOCRWorker();
  await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', tessedit_pageseg_mode: '7' });
  const word = (await worker.recognize(c)).data.text.replace(/[^A-Z]/g, '');
  return { ok: !!word, word, letters: loc.letters, reason: word ? '' : 'Could not read the word — type it below.' };
}
