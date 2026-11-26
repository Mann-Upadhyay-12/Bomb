// Binary GIF parser, LZW decompressor, and brightness RLE analyzer

export async function parseGIFFrames(bufferOrBlob) {
  let buffer = bufferOrBlob;
  if (typeof Blob !== 'undefined' && bufferOrBlob instanceof Blob) {
    buffer = await bufferOrBlob.arrayBuffer();
  }
  const b = new Uint8Array(buffer);
  if (b.length < 10 || b[0] !== 71 || b[1] !== 73 || b[2] !== 70) throw new Error('Not a valid GIF file');
  let i = 6;
  const screenW = b[i] | (b[i + 1] << 8);
  const screenH = b[i + 2] | (b[i + 3] << 8);
  const gctFlag = (b[i + 4] >> 7) & 1;
  const gctBytes = 3 * (2 << (b[i + 4] & 7));
  i += 7;
  let globalCT = null;
  if (gctFlag) {
    globalCT = b.subarray(i, i + gctBytes);
    i += gctBytes;
  }
  const CX = screenW >> 1, CY = screenH >> 1;
  const frames = [];
  let pendingDelay = 100, prevBright = 128, prevRgb = [128, 128, 128];

  while (i < b.length) {
    const byte = b[i];
    if (byte === 0x3B) break;
    if (byte === 0x21) {
      const label = b[i + 1];
      if (label === 0xF9) {
        pendingDelay = (b[i + 4] | (b[i + 5] << 8)) * 10;
        i += 8;
      } else {
        i += 2;
        while (i < b.length && b[i] !== 0) i += b[i] + 1;
        i++;
      }
    } else if (byte === 0x2C) {
      const left = b[i + 1] | (b[i + 2] << 8);
      const top = b[i + 3] | (b[i + 4] << 8);
      const fw = b[i + 5] | (b[i + 6] << 8);
      const fh = b[i + 7] | (b[i + 8] << 8);
      const lctFlag = (b[i + 9] >> 7) & 1;
      const lctBytes = 3 * (2 << (b[i + 9] & 7));
      i += 10;
      let ct = globalCT;
      if (lctFlag) {
        ct = b.subarray(i, i + lctBytes);
        i += lctBytes;
      }
      const minCS = b[i++];
      const lzw = [];
      while (i < b.length && b[i] !== 0) {
        const n = b[i++];
        for (let k = 0; k < n; k++) lzw.push(b[i++]);
      }
      i++;
      const px = CX - left, py = CY - top;
      let bright = prevBright, rgb = prevRgb;
      if (ct && px >= 0 && px < fw && py >= 0 && py < fh) {
        const ci = lzwGetPixelIndex(lzw, minCS, py * fw + px);
        if (ci >= 0 && ci * 3 + 2 < ct.length) {
          const r = ct[ci * 3], g = ct[ci * 3 + 1], bv = ct[ci * 3 + 2];
          bright = 0.299 * r + 0.587 * g + 0.114 * bv;
          rgb = [r, g, bv];
          prevBright = bright; prevRgb = rgb;
        }
      }
      frames.push({ brightness: bright, rgb, delay: pendingDelay || 100 });
      pendingDelay = 100;
    } else {
      i++;
    }
  }
  return frames;
}

export function lzwGetPixelIndex(data, minCS, targetIdx) {
  const clear = 1 << minCS, endC = clear + 1;
  let codeSize = minCS + 1, nextCode = endC + 1;
  const tbl = [];
  for (let k = 0; k < clear; k++) tbl[k] = [k];
  let buf = 0, bLen = 0, pos = 0;

  const read = () => {
    while (bLen < codeSize && pos < data.length) {
      buf |= data[pos++] << bLen;
      bLen += 8;
    }
    const c = buf & ((1 << codeSize) - 1);
    buf >>>= codeSize;
    bLen -= codeSize;
    return c;
  };

  let outPos = 0, prev = null;
  for (;;) {
    if (bLen < codeSize && pos >= data.length) break;
    const code = read();
    if (code === clear) {
      tbl.length = endC + 1;
      for (let k = 0; k < clear; k++) tbl[k] = [k];
      codeSize = minCS + 1;
      nextCode = endC + 1;
      prev = null;
      continue;
    }
    if (code === endC) break;
    let entry;
    if (code < nextCode) {
      entry = tbl[code];
    } else if (prev !== null) {
      entry = [...prev, prev[0]];
    } else {
      break;
    }
    if (!entry) break;
    for (const px of entry) {
      if (outPos === targetIdx) return px;
      outPos++;
    }
    if (prev !== null) {
      tbl[nextCode] = [...prev, entry[0]];
      nextCode++;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return -1;
}

/**
 * True when the lit frames show a red light (the game's normal light is blue, 79,168,255).
 * A red light means long and short flashes are swapped. Frames without colour → false.
 */
export function lightIsRed(frames) {
  const lit = frames.filter(f => f.rgb);
  if (!lit.length) return false;
  const bs = lit.map(f => f.brightness);
  const thresh = (Math.min(...bs) + Math.max(...bs)) / 2;
  const on = lit.filter(f => f.brightness > thresh);
  if (!on.length) return false;
  const [r, g, b] = [0, 1, 2].map(c => on.reduce((s, f) => s + f.rgb[c], 0) / on.length);
  return r > 100 && r >= 1.8 * Math.max(g, b);
}

export function framesToRLE(frames) {
  const bs = frames.map(f => f.brightness);
  const mn = Math.min(...bs), mx = Math.max(...bs);
  if (mx - mn < 20) throw new Error('No significant brightness change — is this a blinking LED GIF?');
  const thresh = (mn + mx) / 2;
  const rle = [];
  let curOn = frames[0].brightness > thresh, curDur = frames[0].delay;
  for (let i = 1; i < frames.length; i++) {
    const on = frames[i].brightness > thresh;
    if (on === curOn) {
      curDur += frames[i].delay;
    } else {
      rle.push({ is_on: curOn, duration: curDur });
      curOn = on;
      curDur = frames[i].delay;
    }
  }
  rle.push({ is_on: curOn, duration: curDur });
  return rle;
}

/**
 * Full-colour GIF decoder (from the standalone simons.html): returns every composited frame as
 * RGBA pixels, honouring transparency, interlacing and disposal. No browser APIs needed.
 * @returns {{ w:number, h:number, frames: Array<{ data: Uint8ClampedArray, delay: number }> }}
 */
export function decodeGIFRGBA(buf) {
  const d = new Uint8Array(buf); let p = 0;
  if (String.fromCharCode(d[0], d[1], d[2]) !== 'GIF') throw new Error('not a GIF');
  p = 6;
  const W = d[p] | d[p + 1] << 8, H = d[p + 2] | d[p + 3] << 8; p += 4;
  const fl = d[p++]; p += 2;
  let gct = null;
  if (fl & 0x80) { const n = 2 << (fl & 7); gct = d.subarray(p, p + n * 3); p += n * 3; }
  let cv = new Uint8ClampedArray(W * H * 4);
  const frames = [];
  let gce = { delay: 0, trans: -1, disp: 0 };
  const skipSub = () => { while (p < d.length && d[p] !== 0) p += d[p] + 1; p++; };
  while (p < d.length) {
    const b = d[p++];
    if (b === 0x3B) break;
    if (b === 0x21) {
      const label = d[p++];
      if (label === 0xF9) {
        p++; const pf = d[p];
        gce = { disp: (pf >> 2) & 7, delay: (d[p + 1] | d[p + 2] << 8) * 10, trans: (pf & 1) ? d[p + 3] : -1 };
        p += 5;
      } else skipSub();
    } else if (b === 0x2C) {
      const x0 = d[p] | d[p + 1] << 8, y0 = d[p + 2] | d[p + 3] << 8, w = d[p + 4] | d[p + 5] << 8, h = d[p + 6] | d[p + 7] << 8, f = d[p + 8]; p += 9;
      let ct = gct;
      if (f & 0x80) { const n = 2 << (f & 7); ct = d.subarray(p, p + n * 3); p += n * 3; }
      const minCode = d[p++];
      const chunks = []; let tot = 0;
      while (p < d.length && d[p] !== 0) { chunks.push(d.subarray(p + 1, p + 1 + d[p])); tot += d[p]; p += d[p] + 1; }
      p++;
      const data = new Uint8Array(tot); let o = 0;
      for (const c of chunks) { data.set(c, o); o += c.length; }
      const idx = gifLzwFull(minCode, data, w * h);
      const rows = new Array(h);
      if (f & 0x40) { let r = 0; for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < h; y += st) rows[y] = r++; }
      else for (let y = 0; y < h; y++) rows[y] = y;
      const saved = gce.disp === 3 ? cv.slice() : null;
      if (ct) {
        for (let y = 0; y < h; y++) {
          const sy = rows[y] * w, dy = y0 + y; if (dy >= H) continue;
          for (let x = 0; x < w; x++) {
            const dx = x0 + x; if (dx >= W) continue;
            const ci = idx[sy + x]; if (ci === gce.trans) continue;
            const o2 = (dy * W + dx) * 4;
            cv[o2] = ct[ci * 3]; cv[o2 + 1] = ct[ci * 3 + 1]; cv[o2 + 2] = ct[ci * 3 + 2]; cv[o2 + 3] = 255;
          }
        }
      }
      frames.push({ data: cv.slice(), delay: gce.delay || 100 });
      if (gce.disp === 2) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const dx = x0 + x, dy = y0 + y;
          if (dx < W && dy < H) cv.fill(0, (dy * W + dx) * 4, (dy * W + dx) * 4 + 4);
        }
      } else if (gce.disp === 3 && saved) cv = saved;
      gce = { delay: 0, trans: -1, disp: 0 };
    } else break;
  }
  return { w: W, h: H, frames };
}

function gifLzwFull(minCode, data, npix) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1, mask = (1 << size) - 1;
  const prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097), out = new Uint8Array(npix);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  let bits = 0, nb = 0, op = 0, old = -1, first = 0;
  for (let i = 0; i < data.length; i++) {
    bits |= data[i] << nb; nb += 8;
    while (nb >= size) {
      let code = bits & mask; bits >>= size; nb -= size;
      if (code === clear) { size = minCode + 1; mask = (1 << size) - 1; next = eoi + 1; old = -1; continue; }
      if (code === eoi) return out;
      if (old === -1) { out[op++] = suffix[code]; old = code; first = code; continue; }
      const inCode = code; let top = 0;
      if (code >= next) { stack[top++] = first; code = old; }
      while (code >= clear) { stack[top++] = suffix[code]; code = prefix[code]; }
      first = suffix[code]; stack[top++] = first;
      if (next < 4096) { prefix[next] = old; suffix[next] = first; next++; if ((next & mask) === 0 && next < 4096) { size++; mask = (1 << size) - 1; } }
      old = inCode;
      while (top > 0 && op < npix) out[op++] = stack[--top];
    }
  }
  return out;
}
