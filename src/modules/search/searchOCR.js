// Tesseract OCR pipeline for 5x5 Word Search & Knob modules

import { computeOtsuThreshold } from '../../utils/otsu.js';

let _ocrWorker = null;
let _ocrPromise = null;

export async function ensureOCRWorker(onProgress) {
  if (_ocrWorker) return _ocrWorker;
  if (_ocrPromise) return _ocrPromise;

  _ocrPromise = (async () => {
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js library not loaded — check network connection');
    }

    // Protect with a 15-second timeout so it never hangs indefinitely
    let timerId;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error('OCR engine initialization timed out (15s)'));
      }, 15000);
    });

    const initWorker = async () => {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (m && onProgress) {
            try { onProgress(m); } catch (_) {}
          }
        }
      });

      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012568',
        tessedit_pageseg_mode: '10'
      });
      return worker;
    };

    try {
      _ocrWorker = await Promise.race([initWorker(), timeoutPromise]);
      clearTimeout(timerId);
      return _ocrWorker;
    } catch (err) {
      clearTimeout(timerId);
      _ocrWorker = null;
      _ocrPromise = null;
      throw err;
    }
  })();

  return _ocrPromise;
}

export function preWarmOCR() {
  ensureOCRWorker().catch(() => {});
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
      const callPromise = (async () => {
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012568',
          tessedit_pageseg_mode: psm,
          user_defined_dpi: '150'
        });
        const { data } = await worker.recognize(padCanvas);
        const letter = sanitizeSearchLetter(data?.text);
        const conf = Number(data?.confidence ?? 0);
        return { letter, conf };
      })();

      // 2500ms timeout per cell to ensure nothing ever stalls the pipeline
      let timer;
      const timeout = new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('Cell OCR timeout')), 2500);
      });

      const res = await Promise.race([callPromise, timeout]);
      clearTimeout(timer);

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
