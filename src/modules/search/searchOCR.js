// Tesseract OCR for every Bombs module that reads text (Word Search, Password, Who's on First,
// Balance, Button, Knobs): the shared worker pool and the Word Search cell readers

import { computeOtsuThreshold } from '../../utils/otsu.js';

// ── Tesseract worker pool ──
// Every OCR module asks ensureOCRWorker() for a worker. What it gets is a lightweight handle with
// its own settings: setParameters() only records them, and recognize() borrows a real Tesseract
// worker exclusively, applies the handle's settings, reads, and gives the worker back. So two
// modules reading at once can no longer swap each other's whitelist / page mode between the two
// calls (they shared one worker before), and independent reads can run on more than one worker.
// A second worker is only started when a read has to wait, so single reads cost what they did.

const BASE_PARAMS = { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012568', tessedit_pageseg_mode: '10' };
const POOL_MAX = (() => {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 8;
  return cores >= 12 && mem >= 8 ? 3 : cores >= 4 && mem >= 4 ? 2 : 1;
})();

const pool = [];        // { w, params, busy }
const waiting = [];     // resolve functions of reads waiting for a worker
let spawning = 0;
let firstReady = null;  // promise of the first worker (null until asked, reset if it fails)
let progressListener = null;

function createTessWorker() {
  if (typeof Tesseract === 'undefined') {
    return Promise.reject(new Error('Tesseract.js library not loaded — check network connection'));
  }
  // 60-second guard (the first run downloads the ~10MB model) so it never hangs indefinitely
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error('OCR engine initialization timed out (60s)')), 60000);
  });
  const init = (async () => {
    const w = await Tesseract.createWorker('eng', 1, {
      logger: m => { if (m && progressListener) { try { progressListener(m); } catch (_) {} } }
    });
    await w.setParameters(BASE_PARAMS);
    return { w, params: { ...BASE_PARAMS }, busy: false };
  })();
  return Promise.race([init, timeout]).finally(() => clearTimeout(timerId));
}

function handOut(slot) {
  const next = waiting.shift();
  if (next) { slot.busy = true; next(slot); } else slot.busy = false;
}

function spawnExtra() {
  spawning++;
  createTessWorker().then(slot => { spawning--; pool.push(slot); handOut(slot); })
    .catch(() => { spawning--; }); // the pool just stays smaller
}

async function lease() {
  await ensurePool();
  const free = pool.find(s => !s.busy);
  if (free) { free.busy = true; return free; }
  if (pool.length + spawning < POOL_MAX) spawnExtra();
  return new Promise(resolve => waiting.push(resolve));
}

function ensurePool(onProgress) {
  if (onProgress) progressListener = onProgress;
  if (!firstReady) {
    spawning++;
    firstReady = createTessWorker().then(slot => { spawning--; pool.push(slot); handOut(slot); return slot; },
      err => { spawning--; firstReady = null; throw err; });
  }
  return firstReady;
}

/**
 * One read on a pooled worker with these settings (only the ones that differ are re-sent).
 * `limitMs` times the read itself, not the wait for a free worker; a read that runs over is
 * reported as a timeout but keeps its worker until Tesseract has actually finished.
 */
async function readWith(params, image, options, limitMs) {
  const slot = await lease();
  const job = (async () => {
    const diff = {};
    let changed = false;
    for (const k in params) if (slot.params[k] !== params[k]) { diff[k] = params[k]; changed = true; }
    if (changed) { await slot.w.setParameters(diff); Object.assign(slot.params, diff); }
    return slot.w.recognize(image, options);
  })();
  job.then(() => handOut(slot), () => handOut(slot));
  if (!limitMs) return job;
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cell OCR timeout')), limitMs); });
  try { return await Promise.race([job, timeout]); } finally { clearTimeout(timer); }
}

/**
 * A worker handle for one OCR job. Same calls as a Tesseract worker (setParameters, recognize);
 * use one handle per independent sequence of reads, so parallel reads keep their own settings.
 */
export async function ensureOCRWorker(onProgress) {
  await ensurePool(onProgress);
  let params = {};
  return {
    setParameters: async p => { params = { ...params, ...p }; return {}; },
    recognize: (image, options) => readWith(params, image, options),
    /** recognize() that gives up (rejects) after `ms` of reading time */
    recognizeWithin: (ms, image, options) => readWith(params, image, options, ms)
  };
}

export function preWarmOCR() {
  ensurePool().catch(() => {});
}

export function applyMorphologicalDilation(binary, width, height, iterations = 1) {
  let src = binary;
  for (let iter = 0; iter < iterations; iter++) {
    const dst = new Uint8Array(src);
    for (let y = 0; y < height; y++) {
      const yw = y * width;
      for (let x = 0; x < width; x++) {
        if (src[yw + x] === 0) { // ink / black pixel
          if (x > 0) dst[yw + (x - 1)] = 0;
          if (x < width - 1) dst[yw + (x + 1)] = 0;
          if (y > 0) dst[yw - width + x] = 0;
          if (y < height - 1) dst[yw + width + x] = 0;
        }
      }
    }
    src = dst;
  }
  return src;
}

export function preprocessCellCanvas(cellCtx, width, height, mode = 'otsu', dilatePasses = 0) {
  const imgData = cellCtx.getImageData(0, 0, width, height);
  const d = imgData.data;
  const numPixels = width * height;
  const lumArray = new Uint8Array(numPixels);

  let maxL = 0;
  for (let i = 0; i < numPixels; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const L = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lumArray[i] = L;
    if (L > maxL) maxL = L;
  }

  let threshold = 128;
  if (mode === 'otsu') {
    threshold = computeOtsuThreshold(lumArray);
    if (threshold < 35 || threshold > 225) {
      threshold = Math.max(50, Math.round(maxL * 0.40));
    }
  } else {
    threshold = Math.max(50, Math.round(maxL * 0.40));
  }

  // Determine if background is bright (paper) or dark (night mode / inverted)
  let brightCount = 0;
  for (let i = 0; i < numPixels; i++) {
    if (lumArray[i] >= threshold) brightCount++;
  }
  const isBrightBackground = brightCount >= numPixels * 0.5;

  const binary = new Uint8Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    // 0 = ink (black letter stroke), 255 = paper (white background)
    const isInk = isBrightBackground ? lumArray[i] < threshold : lumArray[i] >= threshold;
    binary[i] = isInk ? 0 : 255;
  }

  const processed = dilatePasses > 0 ? applyMorphologicalDilation(binary, width, height, dilatePasses) : binary;

  for (let i = 0; i < numPixels; i++) {
    const v = processed[i];
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  cellCtx.putImageData(imgData, 0, 0);
}

export function getSearchGrid(w, h) {
  const sx = w / 440;
  const sy = h / 440;
  return {
    cellW: 40 * sx,
    cellH: 40 * sy,
    colCenters: [118, 158, 198, 238, 278].map(x => x * sx),
    rowCenters: [162, 202, 242, 282, 322].map(y => y * sy)
  };
}

export function sanitizeSearchLetter(rawText) {
  let s = (rawText || '').trim().toUpperCase();
  s = s.replace(/0/g, 'O')
       .replace(/1/g, 'I')
       .replace(/5/g, 'S')
       .replace(/8/g, 'B')
       .replace(/2/g, 'Z')
       .replace(/6/g, 'G');
  return s.replace(/[^A-Z]/g, '').charAt(0);
}

export async function recognizeCell(worker, padCanvas) {
  // Single-character mode (PSM 10) is optimal and fast for isolated letter tiles
  // Secondary fallback: PSM 6 (Single uniform text block)
  const psms = ['10', '6'];
  const candidates = [];

  for (const psm of psms) {
    try {
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012568',
        tessedit_pageseg_mode: psm,
        user_defined_dpi: '150'
      });
      // 2500ms of reading time per cell so nothing ever stalls the pipeline
      const { data } = await worker.recognizeWithin(2500, padCanvas);
      const res = { letter: sanitizeSearchLetter(data?.text), conf: Number(data?.confidence ?? 0) };

      if (res.letter) {
        candidates.push(res);
        // If high confidence letter found, return immediately without running extra passes
        if (res.conf >= 60) {
          return { letter: res.letter, confidence: Math.round(res.conf) };
        }
      }
    } catch (_) {}
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.conf - a.conf);
    return {
      letter: candidates[0].letter,
      confidence: Math.round(candidates[0].conf || 50)
    };
  }

  return { letter: '?', confidence: 0 };
}

/**
 * Word Search cell reader (the original app's pipeline, which read every letter of the 5×5
 * grid): runs PSM 6 / 8 / 13 / 10 on the same cell and votes. Single-mode reading dropped
 * letters such as V, J, M and Z.
 */
export async function recognizeCellConsensus(_worker, padCanvas) {
  // the four modes are independent reads of the same canvas: run them side by side (own handles,
  // so each keeps its own page mode), then vote in the same mode order as before
  const reads = await Promise.all(['6', '8', '13', '10'].map(async psm => {
    try {
      const w = await ensureOCRWorker();
      await w.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012568',
        tessedit_pageseg_mode: psm,
        user_defined_dpi: '300'
      });
      const { data } = await w.recognizeWithin(4000, padCanvas);
      return { letter: sanitizeSearchLetter(data?.text), conf: Number(data?.confidence ?? 0) };
    } catch (_) { return null; }
  }));
  const rawResults = reads.filter(r => r && r.letter);
  if (!rawResults.length) return { letter: '?', confidence: 0 };

  // agreement across modes outweighs one mode's confidence
  const groups = {};
  for (const r of rawResults) {
    const g = groups[r.letter] || (groups[r.letter] = { letter: r.letter, count: 0, confs: [], maxConf: 0 });
    g.count++; g.confs.push(r.conf); g.maxConf = Math.max(g.maxConf, r.conf);
  }
  const options = Object.values(groups).map(g => ({
    ...g, score: g.count * 60 + g.maxConf + g.confs.reduce((a, b) => a + b, 0) / g.count
  }));
  options.sort((a, b) => b.score - a.score);
  // a 0 stays 0: it is what sends the cell to the second pass. (It used to become 50, so in Chrome a
  // clean I that Tesseract called "E" at 0 % was kept, and the second pass's right "1" = I never ran.)
  return { letter: options[0].letter, confidence: Math.round(options[0].maxConf || 0) };
}
