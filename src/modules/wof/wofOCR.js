// Who's on First OCR — reads the display word and the 6 keypad buttons from a
// screenshot and snaps each read to the closest word in the rules vocabulary.
// Ported from the original single-file app (public/bombs.html).

import { ensureOCRWorker, preprocessCellCanvas } from '../search/searchOCR.js';
import { matchWord, BLANK } from './wofSolver.js';

// Regions in a 440×440 reference frame: [x, y, w, h]
const REG_DISP = [102, 102, 236, 46];
const REG_BTN = [
  [84, 177, 124, 36], [232, 177, 124, 36],
  [84, 234, 124, 36], [232, 234, 124, 36],
  [84, 291, 124, 36], [232, 291, 124, 36]
];
const WL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ'?";

async function readRegion(worker, src, W, H, reg, vocab) {
  const sx = W / 440, sy = H / 440;
  const x = Math.round(reg[0] * sx), y = Math.round(reg[1] * sy);
  const w = Math.max(1, Math.round(reg[2] * sx)), h = Math.max(1, Math.round(reg[3] * sy));
  const f = Math.max(3, Math.round(160 / h));
  const c = document.createElement('canvas');
  c.width = w * f;
  c.height = h * f;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);

  // Amount of bright "ink" — used to detect an empty (blank) display
  const px = cx.getImageData(0, 0, c.width, c.height).data;
  let bright = 0;
  for (let i = 0; i < px.length; i += 16) {
    if (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] > 110) bright++;
  }
  const ink = bright / (px.length / 16);

  preprocessCellCanvas(cx, c.width, c.height, 'otsu', 0);
  const P = 30;
  const pad = document.createElement('canvas');
  pad.width = c.width + 2 * P;
  pad.height = c.height + 2 * P;
  const pc = pad.getContext('2d');
  pc.fillStyle = '#fff';
  pc.fillRect(0, 0, pad.width, pad.height);
  pc.drawImage(c, P, P);

  let best = { w: '', d: 99, amb: false };
  for (const psm of ['7', '6']) {
    try {
      await worker.setParameters({ tessedit_char_whitelist: WL, tessedit_pageseg_mode: psm, user_defined_dpi: '300' });
      const { data } = await worker.recognize(pad);
      const r = matchWord(data.text, vocab);
      if (r.d < best.d || (r.d === best.d && !r.amb && best.amb)) best = r;
      if (best.d === 0 && !best.amb) break;
    } catch (_) {}
  }
  return { best, ink };
}

const isAcceptable = (best) => best.w && best.d <= Math.max(1, Math.floor((best.len || 1) * 0.34));

/**
 * @returns {Promise<{disp: string, btns: string[], warnDisp: boolean, warnBtn: boolean[]}>}
 */
export async function wofReadImage(img, rules, onStatus = () => {}) {
  onStatus('Starting OCR engine…');
  const worker = await ensureOCRWorker();

  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const src = document.createElement('canvas');
  src.width = W;
  src.height = H;
  src.getContext('2d').drawImage(img, 0, 0);

  // The display and the six buttons are independent reads: run them side by side, each with its
  // own OCR handle (its own page mode), on as many workers as the pool has.
  onStatus('Reading display and buttons…');
  const dv = rules.displayWords.filter(w => w !== BLANK);
  const [dr, ...btnReads] = await Promise.all([
    readRegion(worker, src, W, H, REG_DISP, dv),
    ...REG_BTN.map(async reg => readRegion(await ensureOCRWorker(), src, W, H, reg, rules.buttonLabels))
  ]);
  let disp, warnDisp;
  if (dr.ink < 0.012 && rules.displayWords.includes(BLANK)) {
    disp = BLANK;
    warnDisp = false;
  } else {
    const ok = isAcceptable(dr.best);
    disp = ok ? dr.best.w : '';
    warnDisp = !ok || dr.best.d > 0 || dr.best.amb;
  }

  const btns = [];
  const warnBtn = [];
  for (let i = 0; i < 6; i++) {
    const r = btnReads[i];
    const ok = isAcceptable(r.best);
    btns.push(ok ? r.best.w : '');
    warnBtn.push(!ok || r.best.d > 0 || r.best.amb);
  }

  return { disp, btns, warnDisp, warnBtn };
}
