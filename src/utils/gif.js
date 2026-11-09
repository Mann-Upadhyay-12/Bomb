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
  let pendingDelay = 100, prevBright = 128;

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
      let bright = prevBright;
      if (ct && px >= 0 && px < fw && py >= 0 && py < fh) {
        const ci = lzwGetPixelIndex(lzw, minCS, py * fw + px);
        if (ci >= 0 && ci * 3 + 2 < ct.length) {
          const r = ct[ci * 3], g = ct[ci * 3 + 1], bv = ct[ci * 3 + 2];
          bright = 0.299 * r + 0.587 * g + 0.114 * bv;
          prevBright = bright;
        }
      }
      frames.push({ brightness: bright, delay: pendingDelay || 100 });
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
