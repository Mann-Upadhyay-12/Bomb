// Computer vision for Knobs 12-LED panel

import { ensureOCRWorker } from '../search/searchOCR.js';

export async function detectKnobStateFromImage(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const knobState = new Array(12).fill(0);
  let foundText = false;

  try {
    const worker = await ensureOCRWorker();
    // Reset page-segmentation mode too: the shared worker may still be in single-char mode from Search
    await worker.setParameters({ tessedit_char_whitelist: 'XO01 \n\r\t', tessedit_pageseg_mode: '6', user_defined_dpi: '150' });
    const { data } = await worker.recognize(canvas);
    const text = data.text.toUpperCase().replace(/[01]/g, m => m === '1' ? 'X' : 'O');
    const matches = text.match(/[XO]{6}/g);
    if (matches && matches.length >= 2) {
      const topStr = matches[0];
      const botStr = matches[1];
      for (let i = 0; i < 6; i++) knobState[i] = topStr[i] === 'X' ? 1 : 0;
      for (let i = 0; i < 6; i++) knobState[i + 6] = botStr[i] === 'X' ? 1 : 0;
      foundText = true;
    }
  } catch (e) {}

  if (!foundText) {
    const imgData = ctx.getImageData(0, 0, W, H).data;
    const samples = [];
    const rowY = [0.35, 0.65];
    const colX = [0.15, 0.29, 0.43, 0.57, 0.71, 0.85];

    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 6; c++) {
        const cx = Math.floor(colX[c] * W);
        const cy = Math.floor(rowY[r] * H);
        const rad = Math.max(2, Math.floor(Math.min(W, H) * 0.03));
        let rSum = 0, gSum = 0, bSum = 0, count = 0;

        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            const px = cx + dx, py = cy + dy;
            if (px >= 0 && px < W && py >= 0 && py < H) {
              const idx = (py * W + px) * 4;
              rSum += imgData[idx];
              gSum += imgData[idx + 1];
              bSum += imgData[idx + 2];
              count++;
            }
          }
        }
        const avgBright = count ? (0.299 * rSum + 0.587 * gSum + 0.114 * bSum) / count : 0;
        samples.push(avgBright);
      }
    }

    const maxB = Math.max(...samples);
    const minB = Math.min(...samples);
    const thresh = minB + 0.45 * (maxB - minB);

    for (let i = 0; i < 12; i++) {
      knobState[i] = (samples[i] > thresh && (maxB - minB > 25)) ? 1 : 0;
    }
  }

  return knobState;
}
