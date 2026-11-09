// Computer vision for 8x10 Minesweeper boards

import { MINES_ROWS, MINES_COLS } from './minesSolver.js';
import { getWorkCanvas, getWorkContext } from '../../utils/canvas.js';

export function parseMinesBoardFromImage(img) {
  const MAXDIM = 1200;
  let w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, MAXDIM / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const workCanvas = getWorkCanvas();
  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = getWorkContext();
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = 33 * (w / 440), maxX = 409 * (w / 440), minY = 73 * (h / 440), maxY = 409 * (h / 440);
  if (w !== h || w > 600) {
    minX = w * 0.05; maxX = w * 0.95; minY = h * 0.08; maxY = h * 0.95;
  }

  // Adaptive boundary snapping to outer dark grid lines
  function snapEdgeX(xEst) {
    let bestX = Math.round(xEst), minV = 999;
    const startX = Math.max(0, Math.floor(xEst - 15)), endX = Math.min(w - 1, Math.ceil(xEst + 15));
    const startY = Math.floor(minY + 10), endY = Math.floor(maxY - 10);
    for (let x = startX; x <= endX; x++) {
      let sum = 0, count = 0;
      for (let y = startY; y < endY; y += 2) {
        const idx = (y * w + x) * 4;
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        count++;
      }
      const avg = count ? sum / count : 999;
      if (avg < minV) { minV = avg; bestX = x; }
    }
    return minV < 90 ? bestX : Math.round(xEst);
  }

  function snapEdgeY(yEst) {
    let bestY = Math.round(yEst), minV = 999;
    const startY = Math.max(0, Math.floor(yEst - 15)), endY = Math.min(h - 1, Math.ceil(yEst + 15));
    const startX = Math.floor(minX + 10), endX = Math.floor(maxX - 10);
    for (let y = startY; y <= endY; y++) {
      let sum = 0, count = 0;
      for (let x = startX; x < endX; x += 2) {
        const idx = (y * w + x) * 4;
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        count++;
      }
      const avg = count ? sum / count : 999;
      if (avg < minV) { minV = avg; bestY = y; }
    }
    return minV < 90 ? bestY : Math.round(yEst);
  }

  minX = snapEdgeX(minX);
  maxX = snapEdgeX(maxX);
  minY = snapEdgeY(minY);
  maxY = snapEdgeY(maxY);

  const cellW = (maxX - minX) / MINES_COLS;
  const cellH = (maxY - minY) / MINES_ROWS;

  function classifyMinesCell(cx0, cy0, cx1, cy1) {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    let flagPx = 0;
    const cellPixels = [];

    for (let py = cy0; py < cy1 && py < h; py++) {
      for (let px = cx0; px < cx1 && px < w; px++) {
        const idx = (py * w + px) * 4;
        const pr = data[idx], pg = data[idx + 1], pb = data[idx + 2];
        rSum += pr; gSum += pg; bSum += pb; count++;
        if (pr > 160 && pg < 70 && pb < 70) flagPx++;
        cellPixels.push({ px, py, pr, pg, pb });
      }
    }
    if (!count) return '#';
    const avgBright = (rSum + gSum + bSum) / (3 * count);
    if (avgBright < 135) {
      return flagPx > count * 0.04 ? 'F' : '#';
    }

    // Revealed cell: locate text / digit stroke pixels
    const textPixels = [];
    let minPX = 9999, maxPX = -1, minPY = 9999, maxPY = -1;
    for (const p of cellPixels) {
      const bright = (p.pr + p.pg + p.pb) / 3;
      const colorSpread = Math.max(p.pr, p.pg, p.pb) - Math.min(p.pr, p.pg, p.pb);
      if (bright < 205 || colorSpread > 30) {
        textPixels.push(p);
        if (p.px < minPX) minPX = p.px;
        if (p.px > maxPX) maxPX = p.px;
        if (p.py < minPY) minPY = p.py;
        if (p.py > maxPY) maxPY = p.py;
      }
    }

    if (textPixels.length < 12) return 0; // Empty revealed tile

    const charW = maxPX - minPX + 1;
    const charH = maxPY - minPY + 1;
    const aspect = charW / (charH || 1);
    const targetY = Math.round(minPY + 0.65 * charH);
    let crossW = 0;
    for (const p of textPixels) {
      if (p.py === targetY) crossW++;
    }

    let bluePx = 0, greenPx = 0, redPx = 0, purplePx = 0, amberPx = 0, tealPx = 0;
    for (const p of textPixels) {
      const { pr, pg, pb } = p;
      const maxC = Math.max(pr, pg, pb), minC = Math.min(pr, pg, pb), delta = maxC - minC;
      let hue = 0;
      if (delta > 0) {
        if (maxC === pr) hue = ((pg - pb) / delta) % 6;
        else if (maxC === pg) hue = (pb - pr) / delta + 2;
        else hue = (pr - pg) / delta + 4;
        hue = Math.round(hue * 60);
        if (hue < 0) hue += 360;
      }
      const sat = maxC > 0 ? delta / maxC : 0;

      if ((hue >= 245 && hue <= 305 && sat > 0.16) || (pb > pg + 15 && pr > pg + 10)) {
        purplePx++;
      } else if ((hue >= 185 && hue <= 242 && sat > 0.16) || (pb > pr + 20 && pg >= pr - 8 && pb > pg + 8)) {
        bluePx++;
      } else if ((hue >= 85 && hue <= 165 && sat > 0.16) || (pg > pr + 15 && pg > pb + 5)) {
        greenPx++;
      } else if (((hue >= 340 || hue <= 20) && sat > 0.20) || (pr > pg + 25 && pr > pb + 25)) {
        redPx++;
      } else if ((hue >= 20 && hue <= 50 && sat > 0.25) || (pr > pg + 15 && pg > pb + 15)) {
        amberPx++;
      } else if ((hue >= 165 && hue <= 188 && sat > 0.16) || (pg > pr + 15 && pb > pr + 15)) {
        tealPx++;
      }
    }

    const votes = { 1: bluePx, 2: greenPx, 3: redPx, 4: purplePx, 5: amberPx, 6: tealPx };

    if ((aspect >= 0.62 || crossW >= 8) && (purplePx > 4 || bluePx > 4)) {
      votes[4] += 50;
    } else if ((aspect < 0.52 && crossW <= 6) && (bluePx > 4 || purplePx > 4)) {
      votes[1] += 50;
    }

    let winner = 1, maxV = -1;
    for (const [k, v] of Object.entries(votes)) {
      if (v > maxV) { maxV = v; winner = parseInt(k, 10); }
    }
    if (maxV < 8) return 0;
    return winner;
  }

  const gridData = [];
  for (let r = 0; r < MINES_ROWS; r++) {
    const row = [];
    for (let c = 0; c < MINES_COLS; c++) {
      const x0 = Math.round(minX + c * cellW), x1 = Math.round(minX + (c + 1) * cellW);
      const y0 = Math.round(minY + r * cellH), y1 = Math.round(minY + (r + 1) * cellH);
      const mx = Math.round((x1 - x0) * 0.15), my = Math.round((y1 - y0) * 0.15);
      const cx0 = x0 + mx, cx1 = x1 - mx, cy0 = y0 + my, cy1 = y1 - my;
      const state = classifyMinesCell(cx0, cy0, cx1, cy1);
      row.push({ r, c, name: String.fromCharCode(65 + c) + (r + 1), state, isSafe: false, isMine: false });
    }
    gridData.push(row);
  }

  return gridData;
}
