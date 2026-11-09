// Computer vision for Switches module (detects switch positions U/D and lit green LEDs)

export function detectSwitchesAndGoals(img) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const MAXDIM = 1200;
  if (w > MAXDIM || h > MAXDIM) {
    const scale = MAXDIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const greenMask = new Uint8Array(w * h);
  const silverMask = new Uint8Array(w * h);
  const colProfile = new Float64Array(w);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const brightness = (r + g + b) / 3.0;

      if (g > r + 25 && g > b + 25 && g > 80) {
        greenMask[y * w + x] = 1;
        colProfile[x] += 3.0;
      }

      if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && Math.abs(r - b) < 20 && brightness > 110 && brightness < 220) {
        silverMask[y * w + x] = 1;
        colProfile[x] += 1.0;
      }
    }
  }

  const winSize = Math.max(5, Math.floor(w * 0.02));
  const smoothedCols = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let sum = 0, count = 0;
    for (let dx = -winSize; dx <= winSize; dx++) {
      const nx = x + dx;
      if (nx >= 0 && nx < w) { sum += colProfile[nx]; count++; }
    }
    smoothedCols[x] = sum / (count || 1);
  }

  const margin = Math.floor(w * 0.04);
  for (let x = 0; x < margin; x++) smoothedCols[x] = 0;
  for (let x = w - margin; x < w; x++) smoothedCols[x] = 0;

  const minDist = Math.max(10, Math.floor(w * 0.08));
  const peaks = [];
  const tempCols = new Float64Array(smoothedCols);

  for (let k = 0; k < 5; k++) {
    let maxIdx = -1, maxVal = 0;
    for (let x = 0; x < w; x++) {
      if (tempCols[x] > maxVal) { maxVal = tempCols[x]; maxIdx = x; }
    }
    if (maxIdx === -1 || maxVal <= 0) break;
    peaks.push(maxIdx);
    const pStart = Math.max(0, maxIdx - minDist);
    const pEnd = Math.min(w, maxIdx + minDist);
    for (let x = pStart; x < pEnd; x++) tempCols[x] = 0;
  }

  peaks.sort((a, b) => a - b);

  if (peaks.length < 5) {
    let nzMin = w, nzMax = 0;
    for (let x = 0; x < w; x++) {
      if (colProfile[x] > 0) { if (x < nzMin) nzMin = x; if (x > nzMax) nzMax = x; }
    }
    if (nzMin >= nzMax) { nzMin = Math.floor(w * 0.15); nzMax = Math.floor(w * 0.85); }
    peaks.length = 0;
    for (let i = 0; i < 5; i++) {
      peaks.push(Math.floor(nzMin + (nzMax - nzMin) * i / 4.0));
    }
  }

  let yTop = h, yBot = 0;
  const halfMinDist = Math.floor(minDist / 2);

  for (let y = 0; y < h; y++) {
    for (const px of peaks) {
      const x0 = Math.max(0, px - halfMinDist);
      const x1 = Math.min(w, px + halfMinDist);
      let rowHasMatch = false;
      for (let x = x0; x < x1; x++) {
        const idx = y * w + x;
        if (greenMask[idx] || silverMask[idx]) { rowHasMatch = true; break; }
      }
      if (rowHasMatch) {
        if (y < yTop) yTop = y;
        if (y > yBot) yBot = y;
      }
    }
  }

  if (yTop >= yBot) { yTop = 0; yBot = h - 1; }
  const yMid = (yTop + yBot) / 2.0;

  const initChars = [];
  const goalChars = [];
  const halfTrackW = Math.max(4, Math.floor(minDist * 0.45));

  for (const px of peaks) {
    const x0 = Math.max(0, px - halfTrackW);
    const x1 = Math.min(w, px + halfTrackW);

    let greenYSum = 0, greenCount = 0;
    for (let y = yTop; y <= yBot; y++) {
      for (let x = x0; x < x1; x++) {
        if (greenMask[y * w + x]) { greenYSum += y; greenCount++; }
      }
    }
    if (greenCount > 0) {
      const avgGreenY = greenYSum / greenCount;
      goalChars.push(avgGreenY < yMid ? 'U' : 'D');
    } else {
      goalChars.push('U');
    }

    const trackH = yBot - yTop + 1;
    const rowSilverCounts = new Int32Array(trackH);
    let totalSilver = 0;
    for (let y = yTop; y <= yBot; y++) {
      let rCount = 0;
      for (let x = x0; x < x1; x++) {
        if (silverMask[y * w + x]) rCount++;
      }
      rowSilverCounts[y - yTop] = rCount;
      totalSilver += rCount;
    }

    if (totalSilver > 0) {
      const rWin = Math.max(3, Math.floor(trackH * 0.05));
      let maxRowVal = -1, knobYRel = 0;
      for (let ry = 0; ry < trackH; ry++) {
        let sum = 0;
        for (let dry = -rWin; dry <= rWin; dry++) {
          const nry = ry + dry;
          if (nry >= 0 && nry < trackH) sum += rowSilverCounts[nry];
        }
        if (sum > maxRowVal) { maxRowVal = sum; knobYRel = ry; }
      }
      const knobY = yTop + knobYRel;
      initChars.push(knobY < yMid ? 'U' : 'D');
    } else {
      initChars.push('U');
    }
  }

  return {
    detectedInit: initChars.join(''),
    detectedGoal: goalChars.join('')
  };
}
