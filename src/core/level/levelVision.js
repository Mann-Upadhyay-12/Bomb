// Reads a bomb-board screenshot (grid of module cards with orange titles) and returns the
// modules in board order (left → right, top → bottom). Empty slots have no title and are skipped.
import { TITLE_REFS } from './levelTitleRefs.js';

const FP_W = 48, FP_H = 12;

// orange title ink, e.g. rgb(250, 203, 130) — excludes the yellow lamps (blue ≈ 0) and red LEDs
function isTitleInk(r, g, b) {
  return r > 190 && g > 140 && g < 225 && b > 80 && b < 170 && r - b > 70 && r - g > 25;
}

export function imageToData(img, maxDim = 2400) {
  const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * sc), H = Math.round(img.naturalHeight * sc);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  return g.getImageData(0, 0, W, H);
}

// connected components of title ink (letters), 8-connected
function letterBoxes(mask, W, H) {
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H), boxes = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!mask[p0] || seen[p0]) continue;
    let sp = 0, n = 0;
    stack[sp++] = p0; seen[p0] = 1;
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p - x) / W;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
      }
    }
    if (n >= 6) boxes.push({ x0, x1, y0, y1, n });
  }
  return boxes;
}

// merge letters that sit on the same text line and are close together into words / titles
function mergeLines(boxes) {
  const items = boxes.map(b => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const h = Math.max(a.y1 - a.y0, b.y1 - b.y0) + 1;
        const vOverlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
        if (vOverlap > h * 0.35 && gap < h * 0.9) {
          a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1);
          a.y0 = Math.min(a.y0, b.y0); a.y1 = Math.max(a.y1, b.y1);
          a.n += b.n;
          items.splice(j, 1);
          changed = true;
          j--;
        }
      }
    }
  }
  return items;
}

function fingerprint(mask, W, box) {
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  const v = new Float32Array(FP_W * FP_H);
  for (let fy = 0; fy < FP_H; fy++) {
    const y0 = box.y0 + Math.floor(fy * bh / FP_H), y1 = Math.max(y0 + 1, box.y0 + Math.floor((fy + 1) * bh / FP_H));
    for (let fx = 0; fx < FP_W; fx++) {
      const x0 = box.x0 + Math.floor(fx * bw / FP_W), x1 = Math.max(x0 + 1, box.x0 + Math.floor((fx + 1) * bw / FP_W));
      let s = 0, t = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += mask[y * W + x]; t++; }
      v[fy * FP_W + fx] = t ? s / t : 0;
    }
  }
  return { v, aspect: bw / bh };
}

const encodeFp = fp => Array.from(fp.v, x => Math.round(x * 9)).join('');
const decodeFp = s => Float32Array.from(s, d => Number(d) / 9);

function corr(a, b) {
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    d += x * y; na += x * x; nb += y * y;
  }
  return d / Math.sqrt(na * nb + 1e-9);
}

// light 3×3 blur so 1px edge differences between screenshot sizes don't dominate the match
function soften(v) {
  const o = new Float32Array(v.length);
  for (let y = 0; y < FP_H; y++) for (let x = 0; x < FP_W; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || xx < 0 || yy >= FP_H || xx >= FP_W) continue;
      const w = dx === 0 && dy === 0 ? 4 : 1;
      s += v[yy * FP_W + xx] * w; n += w;
    }
    o[y * FP_W + x] = s / n;
  }
  return o;
}

const REFS = TITLE_REFS.map(r => ({ name: r.name, aspect: r.aspect, v: soften(decodeFp(r.fp)) }));

function classify(fp) {
  fp.soft = fp.soft || soften(fp.v);
  let best = null, bs = -Infinity, second = -Infinity;
  for (const r of REFS) {
    const s = corr(fp.soft, r.v) - 0.6 * Math.abs(Math.log(fp.aspect / r.aspect));
    if (s > bs) { second = bs; bs = s; best = r.name; }
    else if (s > second) second = s;
  }
  return { name: best, score: bs, margin: bs - second };
}

/**
 * @returns {{ titles: Array<{ name: string|null, score: number, unsure: boolean, box: object, fp: string }> }}
 */
const REF_TITLE_H = 15; // title cap height (px) in the reference screenshots

function rescale(imgData, f) {
  const src = document.createElement('canvas');
  src.width = imgData.width; src.height = imgData.height;
  src.getContext('2d').putImageData(imgData, 0, 0);
  const W = Math.max(1, Math.round(imgData.width * f)), H = Math.max(1, Math.round(imgData.height * f));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, W, H);
  return g.getImageData(0, 0, W, H);
}

export function readBoard(imgData, _pass = 0) {
  const { data, width: W, height: H } = imgData;
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; p < W * H; p++, i += 4) {
    if (isTitleInk(data[i], data[i + 1], data[i + 2])) mask[p] = 1;
  }
  let lines = mergeLines(letterBoxes(mask, W, H)).filter(l => l.x1 - l.x0 > (l.y1 - l.y0) * 2.2);
  if (!lines.length) return { titles: [] };

  // titles all share one font size; smaller orange text inside cards (e.g. "READY") is dropped
  const hs = lines.map(l => l.y1 - l.y0 + 1).sort((a, b) => a - b);
  const titleH = hs[hs.length - 1 - Math.floor((hs.length - 1) / 3)];
  lines = lines.filter(l => {
    const h = l.y1 - l.y0 + 1;
    return h > titleH * 0.78 && h < titleH * 1.3;
  });

  // fingerprints only compare well at the reference size: rescale the screenshot once so titles match it
  if (_pass === 0) {
    const f = REF_TITLE_H / titleH;
    if (f < 0.85 || f > 1.15) return readBoard(rescale(imgData, f), 1);
  }

  // board order: rows (by title y), then columns
  lines.sort((a, b) => a.y0 - b.y0);
  const rows = [];
  for (const l of lines) {
    const row = rows.find(r => Math.abs(r.y - l.y0) < titleH * 1.5);
    if (row) row.items.push(l); else rows.push({ y: l.y0, items: [l] });
  }
  const ordered = rows.flatMap(r => r.items.sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1)));

  const titles = ordered.map(box => {
    const fp = fingerprint(mask, W, box);
    const c = REFS.length ? classify(fp) : { name: null, score: 0, margin: 0 };
    return { name: c.name, score: c.score, unsure: c.score < 0.5 || c.margin < 0.05, box, fp: encodeFp(fp), aspect: fp.aspect };
  });
  // anything that looks nothing like a title (stray orange art inside a card) is not a module
  return { titles: REFS.length ? titles.filter(t => t.score > 0.25) : titles };
}
