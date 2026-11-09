// Computer vision for 8x8 Queens board region segmentation

import { getWorkCanvas, getWorkContext } from '../../utils/canvas.js';

export function parseQueensRegionsFromImage(img) {
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

  let minX = 89 * (w / 440), maxX = 351 * (w / 440), minY = 89 * (h / 440), maxY = 351 * (h / 440);
  if (w !== h || w > 600) {
    minX = w * 0.15; maxX = w * 0.85; minY = h * 0.15; maxY = h * 0.85;
  }

  const cellW = (maxX - minX) / 8, cellH = (maxY - minY) / 8;
  const cellRGB = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      const cx0 = Math.round(minX + c * cellW + cellW * 0.25);
      const cx1 = Math.round(minX + (c + 1) * cellW - cellW * 0.25);
      const cy0 = Math.round(minY + r * cellH + cellH * 0.25);
      const cy1 = Math.round(minY + (r + 1) * cellH - cellH * 0.25);
      let rS = 0, gS = 0, bS = 0, cnt = 0;
      for (let py = cy0; py < cy1 && py < h; py++) {
        for (let px = cx0; px < cx1 && px < w; px++) {
          const idx = (py * w + px) * 4;
          rS += data[idx]; gS += data[idx + 1]; bS += data[idx + 2]; cnt++;
        }
      }
      row.push([cnt ? rS / cnt : 0, cnt ? gS / cnt : 0, cnt ? bS / cnt : 0]);
    }
    cellRGB.push(row);
  }

  const visited = Array.from({ length: 8 }, () => Array(8).fill(false));
  const regionGrid = Array.from({ length: 8 }, () => Array(8).fill(0));
  let compId = 0;
  const compColors = [];

  function colorDiff(c1, c2) {
    return Math.max(Math.abs(c1[0] - c2[0]), Math.abs(c1[1] - c2[1]), Math.abs(c1[2] - c2[2]));
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!visited[r][c]) {
        compId++;
        const queue = [[r, c]];
        visited[r][c] = true;
        regionGrid[r][c] = compId;
        let ra = 0, ga = 0, ba = 0, na = 0;
        while (queue.length) {
          const [cr, cc] = queue.shift();
          const rgb = cellRGB[cr][cc];
          ra += rgb[0]; ga += rgb[1]; ba += rgb[2]; na++;
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = cr + dr, nc = cc + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !visited[nr][nc] && colorDiff(cellRGB[cr][cc], cellRGB[nr][nc]) < 22) {
              visited[nr][nc] = true;
              regionGrid[nr][nc] = compId;
              queue.push([nr, nc]);
            }
          }
        }
        compColors[compId] = [ra / na, ga / na, ba / na];
      }
    }
  }

  const uMap = new Map();
  let regCnt = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cid = regionGrid[r][c], rgb = compColors[cid];
      let mr = 0;
      for (const [rid, rrgb] of uMap.entries()) {
        if (colorDiff(rgb, rrgb) < 22) { mr = rid; break; }
      }
      if (!mr) {
        regCnt++;
        mr = regCnt;
        uMap.set(mr, rgb);
      }
      regionGrid[r][c] = mr;
    }
  }

  return regionGrid;
}
