// Complex Wires screenshot readers (ported from the original single-file app):
//  - cwReadDiagramPixels: reads the 16 rule letters off the Venn-diagram screenshot
//  - cwReadWires: reads up to 6 wires (colour, star, LED) off the wires-panel screenshot

// Region label centres in a 710×640 reference diagram (normalised below)
export const CW_REGION_POS = {
  'Star+LED': [196, 109], 'Red+LED': [357, 115], Red: [445, 85], 'Red+Star+LED': [252, 164],
  Star: [93, 212], 'Red+Blue+LED': [466, 214], 'Red+Star': [137, 295], 'Red+Blue+Star+LED': [333, 304],
  'Blue+LED': [510, 305], 'Red+Blue+Star': [190, 370], LED: [552, 395], 'Red+Blue': [143, 436],
  'Blue+Star+LED': [419, 430], 'Blue+Star': [330, 479], Blue: [258, 538], None: [659, 571]
};

/* 20x24 glyph bitmaps for the 5 rule letters (one int per row, 20 bits) */
export const CW_GLYPHS = {
    C:[8162,32766,131070,261758,258078,516111,516103,1040387,1040384,1032192,1032192,1032192,1032192,1032192,1032192,1032192,516096,516098,516103,260111,261758,131070,32760,8176],
    D:[1048448,524272,262136,262140,254206,254078,254015,254015,253983,253983,253983,253983,253983,253983,253983,253983,254015,254078,254206,254974,262140,262136,262112,262016],
    S:[12,32732,131068,524284,516606,1040446,1040414,1040398,1044480,523264,262016,262112,65532,16380,8190,1023,511,127,917567,983103,1044735,262140,131064,32736],
    P:[1048544,1048568,524284,258558,258175,258111,258111,258079,258111,258111,258175,258558,262140,262136,262080,258048,258048,258048,258048,258048,253952,253952,245760,196608],
    B:[1048544,524280,262140,258556,258302,258174,258174,258174,258300,258556,262136,262136,262140,258302,258175,258111,258111,258079,258111,258175,258559,262142,262140,131040]
  };

export function cwReadDiagramPixels(img, W, H) {
  const d = img.data, bin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    if (r * 0.299 + g * 0.587 + b * 0.114 < 85 && Math.max(r, g, b) < 110) bin[i] = 1;
  }
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H * 2), blobs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (bin[p] !== 1 || seen[p]) continue;
    let sp = 0, rp = 0;
    stack[sp++] = x; stack[sp++] = y; seen[p] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, n = 0, sx = 0, sy = 0;
    while (rp < sp) {
      const cx = stack[rp++], cy = stack[rp++];
      n++; sx += cx; sy += cy;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [nx, ny] of nb) {
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const q = ny * W + nx;
        if (bin[q] === 1 && !seen[q]) { seen[q] = 1; stack[sp++] = nx; stack[sp++] = ny; }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (w >= 5 && w <= 70 && h >= 8 && h <= 70 && n >= 25 && n <= 1500) blobs.push({ minX, minY, maxX, maxY, w, h, cx: sx / n, cy: sy / n });
  }
  return blobs.map(b => {
    const cell = new Uint8Array(480);
    for (let r = 0; r < 24; r++) {
      const yy = Math.min(b.maxY, b.minY + Math.floor(r * b.h / 24));
      for (let c = 0; c < 20; c++) {
        const xx = Math.min(b.maxX, b.minX + Math.floor(c * b.w / 20));
        cell[r * 20 + c] = bin[yy * W + xx];
      }
    }
    let letter = 'C', best = -1;
    for (const [L, rows] of Object.entries(CW_GLYPHS)) {
      let sc = 0, tot = 0;
      for (let r = 0; r < 24; r++) for (let c = 0; c < 20; c++) {
        const t = (rows[r] >>> (19 - c)) & 1, v = cell[r * 20 + c];
        if (t === 1 && v === 1) sc += 2; else if (t === v) sc += 1;
        tot += 2;
      }
      const s = sc / tot;
      if (s > best) { best = s; letter = L; }
    }
    return { nx: b.cx / W, ny: b.cy / H, letter, score: best };
  });
}

/**
 * Read the Venn-diagram screenshot → { rules, unsure:Set, count } or { error }.
 */
export function cwReadDiagramImage(im) {
  const W = 710, H = Math.max(1, Math.round(im.naturalHeight * (W / im.naturalWidth)));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.drawImage(im, 0, 0, W, H);
  const glyphs = cwReadDiagramPixels(g.getImageData(0, 0, W, H), W, H);
  if (glyphs.length < 8) {
    return { error: `Only ${glyphs.length} letters found — crop the screenshot to just the Venn diagram, or pick a preset.` };
  }
  const rules = {}, unsure = new Set();
  for (const [id, [x, y]] of Object.entries(CW_REGION_POS)) {
    const nx = x / 710, ny = y / 640;
    let best = null, bd = 1e9;
    for (const gl of glyphs) { const dd = Math.hypot(gl.nx - nx, gl.ny - ny); if (dd < bd) { bd = dd; best = gl; } }
    rules[id] = best ? best.letter : 'C';
    if (!best || bd > 0.1 || best.score < 0.75) unsure.add(id);
  }
  return { rules, unsure, count: glyphs.length };
}

/* ── wires panel reader (columns of red / blue / white, yellow star + LED) ── */
export function cwReadWires(img) {
  const { data, width: W, height: H } = img;
  const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const isRed = (r, g, b) => r > 170 && g < 120 && b < 120;
  const isBlue = (r, g, b) => b > 170 && r < 120 && b - r > 90;
  const isWhite = (r, g, b) => r > 215 && g > 215 && b > 215;
  const isYellow = (r, g, b) => r > 200 && g > 170 && b < 175 && r - b > 60;
  const yA = Math.round(H * 0.42), yB = Math.round(H * 0.66), rows = yB - yA;
  const xA = Math.round(W * 0.08), xB = Math.round(W * 0.92);
  const hits = new Array(W).fill(0);
  for (let x = xA; x < xB; x++) for (let y = yA; y < yB; y++) { const [r, g, b] = at(x, y); if (isRed(r, g, b) || isBlue(r, g, b) || isWhite(r, g, b)) hits[x]++; }
  const cols = []; let cur = null, gap = 0;
  for (let x = xA; x < xB; x++) {
    if (hits[x] > rows * 0.12) { if (!cur) cur = { x0: x, x1: x }; cur.x1 = x; gap = 0; }
    else if (cur && ++gap > 3) { if (cur.x1 - cur.x0 >= W * 0.012) cols.push(cur); cur = null; gap = 0; }
  }
  if (cur && cur.x1 - cur.x0 >= W * 0.012) cols.push(cur);
  const yellowIn = (xc, ya, yb) => {
    let n = 0;
    for (let x = Math.max(0, Math.round(xc - W * 0.05)); x <= Math.min(W - 1, xc + W * 0.05); x++) {
      for (let y = Math.round(H * ya); y < H * yb; y++) { const [r, g, b] = at(x, y); if (isYellow(r, g, b)) n++; }
    }
    return n > W * H * 0.00015;
  };
  return cols.map(c => {
    let nr = 0, nb = 0, nw = 0;
    for (let x = c.x0; x <= c.x1; x++) for (let y = yA; y < yB; y++) { const [r, g, b] = at(x, y); if (isRed(r, g, b)) nr++; else if (isBlue(r, g, b)) nb++; else if (isWhite(r, g, b)) nw++; }
    const tot = nr + nb + nw, color = (nr > tot * 0.15 && nb > tot * 0.15) ? 'striped' : nr > nb && nr > nw ? 'red' : nb > nw ? 'blue' : 'white';
    const xc = Math.round((c.x0 + c.x1) / 2);
    return { active: true, color, led: yellowIn(xc, 0.18, 0.34), star: yellowIn(xc, 0.75, 0.90) };
  });
}

export function cwReadWiresImage(im) {
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  return cwReadWires(g.getImageData(0, 0, cv.width, cv.height)).slice(0, 6);
}
