// Computer vision for Maze walls and Start/Goal dots

import { MAZE_SIZE } from './mazeSolver.js';
import { getWorkCanvas, getWorkContext } from '../../utils/canvas.js';

export function detectMazeWalls(img) {
  const MAXDIM = 800;
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
  const imgData = ctx.getImageData(0, 0, w, h).data;

  const gx = 100 * (w / 440), gy = 122 * (h / 440), gw = 240 * (w / 440), gh = 240 * (h / 440);
  const N = MAZE_SIZE, cw = gw / N, ch = gh / N;

  const wallsGrid = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => ({ u: false, d: false, l: false, r: false }))
  );

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (r === 0) wallsGrid[r][c].u = true;
      if (r === N - 1) wallsGrid[r][c].d = true;
      if (c === 0) wallsGrid[r][c].l = true;
      if (c === N - 1) wallsGrid[r][c].r = true;

      if (c < N - 1) {
        const wx = Math.round(gx + (c + 1) * cw);
        const wy1 = Math.round(gy + (r + 0.2) * ch);
        const wy2 = Math.round(gy + (r + 0.8) * ch);
        let sumLum = 0, count = 0;
        for (let py = wy1; py < wy2 && py < h; py++) {
          for (let px = Math.max(0, wx - 2); px <= Math.min(w - 1, wx + 2); px++) {
            const idx = (py * w + px) * 4;
            sumLum += 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
            count++;
          }
        }
        if (count > 0 && sumLum / count < 120) {
          wallsGrid[r][c].r = true;
          wallsGrid[r][c + 1].l = true;
        }
      }

      if (r < N - 1) {
        const wy = Math.round(gy + (r + 1) * ch);
        const wx1 = Math.round(gx + (c + 0.2) * cw);
        const wx2 = Math.round(gx + (c + 0.8) * cw);
        let sumLum = 0, count = 0;
        for (let py = Math.max(0, wy - 2); py <= Math.min(h - 1, wy + 2); py++) {
          for (let px = wx1; px < wx2 && px < w; px++) {
            const idx = (py * w + px) * 4;
            sumLum += 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
            count++;
          }
        }
        if (count > 0 && sumLum / count < 120) {
          wallsGrid[r][c].d = true;
          wallsGrid[r + 1][c].u = true;
        }
      }
    }
  }

  return wallsGrid;
}

export function detectMazeDots(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const w = canvas.width, h = canvas.height;

  const gx = 100 * (w / 440), gy = 122 * (h / 440), gw = 240 * (w / 440), gh = 240 * (h / 440);
  const N = MAZE_SIZE, cw = gw / N, ch = gh / N;

  let rSX = 0, rSY = 0, rCnt = 0;
  let ySX = 0, ySY = 0, yCnt = 0;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (r > 180 && g < 100 && b < 100) {
        rSX += px; rSY += py; rCnt++;
      } else if (r > 180 && g > 180 && b < 100) {
        ySX += px; ySY += py; yCnt++;
      }
    }
  }

  let startPos = null;
  let goalPos = null;

  if (rCnt > 0) {
    const rx = rSX / rCnt, ry = rSY / rCnt;
    startPos = {
      r: Math.min(N - 1, Math.max(0, Math.floor((ry - gy) / ch))),
      c: Math.min(N - 1, Math.max(0, Math.floor((rx - gx) / cw)))
    };
  }
  if (yCnt > 0) {
    const yx = ySX / yCnt, yy = ySY / yCnt;
    goalPos = {
      r: Math.min(N - 1, Math.max(0, Math.floor((yy - gy) / ch))),
      c: Math.min(N - 1, Math.max(0, Math.floor((yx - gx) / cw)))
    };
  }

  return { startPos, goalPos };
}

export function isDotsImage(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let redCount = 0, yelCount = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 180 && g < 100 && b < 100) redCount++;
    if (r > 180 && g > 180 && b < 100) yelCount++;
  }
  return redCount > 10 || yelCount > 10;
}
