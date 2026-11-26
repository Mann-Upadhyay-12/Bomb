// Batteries — reads the text the pixel readers leave open (browser only: canvas + Tesseract):
// the module names across the table's top, each row's condition words, digits the templates
// don't know yet (6–9) and the voltage printed on each battery label.

import { ensureOCRWorker } from '../search/searchOCR.js';
import { readTableLayout, readBatteryLayout } from './batteriesVision.js';
import { matchModuleName, BATTERY_KINDS } from './batteriesSolver.js';

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'";

/** The picture at its own size as a canvas + its ImageData. */
export function pictureData(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { canvas: c, data: ctx.getImageData(0, 0, W, H) };
}

/**
 * Max (or min) of `v` over a (2r+1)² square around each pixel — two 1-D passes.
 * Exported for the tests.
 */
export function squareFilter(v, w, h, r, pick = Math.max) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = v[y * w + x];
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = pick(m, v[y * w + k]);
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = tmp[y * w + x];
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = pick(m, tmp[k * w + x]);
    out[y * w + x] = m;
  }
  return out;
}

/**
 * Which pixels are ink: `ink(r, g, b)` picks the text colours; with `local`, a pixel also has to
 * be at least halfway from the background to the brightest text near it. One fixed cut-off can't
 * suit both the bold white words and the grey ones: low enough for the grey "total", it also turns
 * the soft edges of the white text black, and a fattened bold 3 closes up into an 8 ("Under 3V"
 * read as "Under 8V" on the 880-px table). Exported for the tests.
 */
export function inkMask(p, w, h, ink, { local = false, blankAt = () => false } = {}) {
  const n = w * h, L = new Float32Array(n), cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = p[i * 4], g = p[i * 4 + 1], b = p[i * 4 + 2];
    L[i] = lum(r, g, b);
    cand[i] = !blankAt(i % w, Math.floor(i / w)) && ink(r, g, b) ? 1 : 0;
  }
  if (!local) return cand;
  const R = Math.max(2, Math.round(h / 15)); // about one stroke at this size
  const textL = L.map((v, i) => (cand[i] ? v : 0));
  const hi = squareFilter(textL, w, h, R, Math.max), lo = squareFilter(L, w, h, R, Math.min);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = cand[i] && L[i] >= (hi[i] + lo[i]) / 2 ? 1 : 0;
  return out;
}

/**
 * A crop of `box` scaled `scale`×, as black ink on white (see inkMask), with `blank` boxes wiped
 * and a white margin (Tesseract likes one).
 */
function inkCrop(src, box, ink, { scale = 3, blank = [], local = false } = {}) {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const sctx = src.canvas.getContext('2d', { willReadFrequently: true });
  const d = sctx.getImageData(box.x0, box.y0, w, h);
  const p = d.data;
  const blankAt = (x, y) => blank.some(b => b && box.x0 + x >= b.x0 && box.x0 + x <= b.x1 && box.y0 + y >= b.y0 && box.y0 + y <= b.y1);
  const mask = inkMask(p, w, h, ink, { local, blankAt });
  for (let i = 0; i < w * h; i++) {
    const v = mask[i] ? 0 : 255;
    p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; p[i * 4 + 3] = 255;
  }
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  small.getContext('2d').putImageData(d, 0, 0);
  const PAD = 16;
  const out = document.createElement('canvas');
  out.width = w * scale + PAD * 2; out.height = h * scale + PAD * 2;
  const octx = out.getContext('2d');
  octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  octx.drawImage(small, PAD, PAD, w * scale, h * scale);
  return out;
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const sat = (r, g, b) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };

async function ocr(canvas, params) {
  const w = await ensureOCRWorker();
  await w.setParameters({ user_defined_dpi: '300', ...params });
  const { data } = await w.recognizeWithin(15000, canvas);
  return (data && data.text ? data.text : '').replace(/\s+/g, ' ').trim();
}

/**
 * The rules table → { ok, table: { modules, unsure, rows: [{ text, icon, cells }] }, layout } or
 * { ok: false, reason }. `unsure` lists the column numbers whose module name is a guess.
 */
export async function readTablePicture(img, onStatus = () => {}) {
  const src = pictureData(img);
  const layout = readTableLayout(src.data);
  if (!layout.ok) return layout;
  onStatus(`Table: ${layout.rows.length} rows × ${layout.columns.length} modules — reading the words…`);
  // header text is gold on brown, condition text white / grey on dark
  const headInk = (r, g, b) => lum(r, g, b) > 95;
  const condInk = (r, g, b) => lum(r, g, b) > 92 && sat(r, g, b) < 0.35;
  const heads = layout.columns.map(c => ocr(inkCrop(src, c.header, headInk, { scale: 3 }), { tessedit_char_whitelist: LETTERS, tessedit_pageseg_mode: '6' }).catch(() => ''));
  const conds = layout.rows.map(r => {
    const blank = r.icon ? [{ ...r.icon.box, x0: r.icon.box.x0 - 3, x1: r.icon.box.x1 + 3 }] : [];
    return ocr(inkCrop(src, r.condBox, condInk, { scale: 3, blank, local: true }), { tessedit_char_whitelist: LETTERS + '0123456789.:', tessedit_pageseg_mode: '7' }).catch(() => '');
  });
  // digits the templates didn't recognise
  const digitJobs = [];
  layout.rows.forEach(r => r.cells.forEach(c => {
    if (!c || c.kind !== 'digit' || c.digit != null) return;
    const box = { x0: c.tbox.x0 - 2, y0: c.tbox.y0 - 2, x1: c.tbox.x1 + 2, y1: c.tbox.y1 + 2 };
    digitJobs.push(ocr(inkCrop(src, box, (rr, gg, bb) => lum(rr, gg, bb) > 110, { scale: 5 }), { tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '10' })
      .then(t => { const m = t.match(/\d/); c.digit = m ? Number(m[0]) : null; c.ocr = true; })
      .catch(() => {}));
  }));
  const [headTexts, condTexts] = await Promise.all([Promise.all(heads), Promise.all(conds), Promise.all(digitJobs)]);
  const names = headTexts.map(t => matchModuleName(t));
  const table = {
    modules: names.map(n => n.name),
    unsure: names.map((n, i) => (n.sure ? -1 : i)).filter(i => i >= 0),
    rows: layout.rows.map((r, i) => ({
      text: condTexts[i],
      icon: r.icon ? r.icon.color : null,
      cells: r.cells.map(c => (c ? { kind: c.kind, digit: c.digit ?? null, pair: c.pair || null } : null))
    }))
  };
  return { ok: true, table, layout };
}

/** The bomb's batteries → { ok, batteries: [{ color, volts, round, size, read }] } or { ok: false }. */
export async function readBatteriesPicture(img) {
  const src = pictureData(img);
  const layout = readBatteryLayout(src.data);
  if (!layout.ok) return layout;
  const white = (r, g, b) => lum(r, g, b) > 190 && sat(r, g, b) < 0.25;
  const batteries = await Promise.all(layout.batteries.map(async b => {
    const def = b.round ? 1.5 : 9;
    let volts = def, read = '';
    try {
      read = await ocr(inkCrop(src, b.label, white, { scale: 2 }), { tessedit_char_whitelist: '0123456789.V', tessedit_pageseg_mode: '7' });
      const m = read.replace(/,/g, '.').match(/(\d+(?:\.\d+)?)/);
      const v = m ? Number(m[1]) : NaN;
      if (v > 0.5 && v <= 24) volts = v;
      else if (m && /^\d\d$/.test(m[1]) && Number(m[1][0]) + Number(m[1][1]) / 10 <= 24) volts = Number(m[1][0]) + Number(m[1][1]) / 10; // "15" for "1.5"
    } catch (e) { /* no OCR: the kind's usual voltage */ }
    const kind = BATTERY_KINDS[b.color];
    return { color: b.color, volts, round: b.round, size: b.size, read, kindKnown: Boolean(kind) };
  }));
  return { ok: true, batteries, layout };
}

/** Which picture this is, read: { type: 'table' | 'batteries', … } or { type: null, reason }. */
export async function readBatteriesFile(img, onStatus) {
  const src = pictureData(img);
  const t = readTableLayout(src.data);
  if (t.ok) {
    const r = await readTablePicture(img, onStatus);
    return r.ok ? { type: 'table', ...r } : { type: null, reason: r.reason };
  }
  const b = await readBatteriesPicture(img);
  return b.ok ? { type: 'batteries', ...b } : { type: null, reason: 'Not the Batteries table or a batteries picture.' };
}

