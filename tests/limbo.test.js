// Limbo: follow the key that glows at the start through the shuffle; answer = its colour at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeGIFRGBA } from '../src/utils/gif.js';
import { solveLimbo, limboColorName } from '../src/modules/limbo/limboSolver.js';

const buf = readFileSync(new URL('./fixtures/limbo.gif', import.meta.url));
const gif = decodeGIFRGBA(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));

// nearest-neighbour rescale of every frame (captures can come at other sizes)
function scaled(f) {
  const W = Math.round(gif.w * f), H = Math.round(gif.h * f);
  const frames = gif.frames.map(fm => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (Math.min(gif.h - 1, Math.floor(y / f)) * gif.w + Math.min(gif.w - 1, Math.floor(x / f))) * 4, t = (y * W + x) * 4;
      d[t] = fm.data[s]; d[t + 1] = fm.data[s + 1]; d[t + 2] = fm.data[s + 2]; d[t + 3] = 255;
    }
    return { data: d };
  });
  return { frames, W, H };
}

test('limbo: real GIF — top key glows, ends lower right, yellow', () => {
  const r = solveLimbo(gif.frames, gif.w, gif.h);
  assert.equal(r.ok, true);
  assert.equal(r.start, 0); // top
  assert.equal(r.startSure, true);
  assert.equal(r.moves.length, 26);
  assert.equal(r.unsureMoves, 0);
  assert.deepEqual(r.colors, ['red', 'green', 'yellow', 'purple', 'orange', 'blue']);
  // hand-checked moves: 1 = top↔bottom + LL↔UL, 4 = top↔LL + UR↔LR, 7 = UR↔UL + LR↔LL
  assert.deepEqual(r.moves[0].pairs, [[0, 3], [4, 5]]);
  assert.deepEqual(r.moves[3].pairs, [[0, 4], [1, 2]]);
  assert.deepEqual(r.moves[6].pairs, [[1, 5], [2, 4]]);
  assert.equal(r.end, 2);
  assert.equal(r.answer, 'yellow');
});

test('limbo: same answer at other capture sizes', () => {
  for (const f of [0.75, 1.5, 1.82]) {
    const { frames, W, H } = scaled(f);
    const r = solveLimbo(frames, W, H);
    assert.equal(r.start, 0, `start at ×${f}`);
    assert.equal(r.unsureMoves, 0, `unsure moves at ×${f}`);
    assert.equal(r.answer, 'yellow', `answer at ×${f}`);
  }
});

test('limbo: picking the start key by hand', () => {
  const r = solveLimbo(gif.frames, gif.w, gif.h, 3); // start = bottom
  assert.equal(r.start, 3);
  assert.equal(r.answer, r.colors[r.end]);
  // a GIF cut before the glow and the reveal: no start, no colour, but no crash
  const cut = solveLimbo(gif.frames.slice(3, 130), gif.w, gif.h);
  assert.equal(cut.ok, true);
  assert.equal(cut.detectedStart, null);
  assert.equal(cut.answer, '');
});

test('limbo: reveal colours', () => {
  assert.equal(limboColorName(239, 68, 68), 'red');
  assert.equal(limboColorName(249, 115, 22), 'orange');
  assert.equal(limboColorName(250, 204, 21), 'yellow');
  assert.equal(limboColorName(34, 197, 94), 'green');
  assert.equal(limboColorName(59, 130, 246), 'blue');
  assert.equal(limboColorName(168, 85, 246), 'purple');
  assert.equal(limboColorName(203, 213, 225), null); // grey key
});
