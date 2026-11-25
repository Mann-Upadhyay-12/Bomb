// Blackjack screenshots. Cards lie on green felt: face-up cards are white with the rank in the top-left
// corner (dark navy or red) and one suit symbol under it; face-down cards are slate blue.
// The helper's picture shows the player's cards face up; the defuser's shows the dealer's up card
// (and face-down cards), so a picture with face-down cards is the defuser's.
//
// Ranks are matched by shape: references rendered from bold sans-serif fonts (the game's font is not
// known) plus ranks seen in real screenshots. 10 / J / Q / K are all worth 10, so mixing those up
// cannot change the answer.

import { RANK_REFS } from './blackjackRefs.js';
import { rankValue } from './blackjackSolver.js';

import { GW, GH, inkGlyph as glyphIn, shapeScore, encodeShape, decodeShape } from '../../utils/glyph.js';

export { GW, GH, shapeScore, encodeShape, decodeShape };

const isWhite = (r, g, b) => Math.min(r, g, b) > 225;
const isBack = (r, g, b) => b > g && g > r + 15 && b - r > 35 && Math.max(r, g, b) < 115;
const isRed = (r, g, b) => r > 170 && g < 110 && b < 140;
const isInk = (r, g, b) => Math.max(r, g, b) < 120 || isRed(r, g, b);

/** Connected blobs of a mask (4-connected) with area ≥ minArea → boxes. */
function blobs(mask, W, H, minArea) {
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H), out = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!mask[p0] || seen[p0]) continue;
    let sp = 0, n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
    stack[sp++] = p0; seen[p0] = 1;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p - x) / W;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
      if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
    }
    if (n >= minArea) out.push({ x0, y0, x1: x1 + 1, y1: y1 + 1, n });
  }
  return out;
}

/** Ink inside a box → 12×16 coverage grid (see utils/glyph.js). */
export const inkGlyph = (data, W, x0, y0, x1, y1, ink = isInk) => glyphIn(data, W, x0, y0, x1, y1, ink);

let refCache = null;
const builtIn = () => (refCache = refCache || RANK_REFS.map(r => ({ rank: r.rank, aspect: r.aspect, v: decodeShape(r.fp) })));

/**
 * Best rank for a glyph. learned: { rank: [encoded] } from earlier corrections.
 * → { rank, score, margin } (margin = gap to the best rank of a different VALUE)
 */
export function classifyRank(glyph, learned = {}) {
  const refs = builtIn().concat(Object.entries(learned).flatMap(([rank, list]) => list.map(fp => ({ rank, aspect: glyph.aspect, v: decodeShape(fp) }))));
  const best = {};
  for (const r of refs) {
    const s = shapeScore(glyph.v, r.v) - 0.5 * Math.abs(Math.log(glyph.aspect / r.aspect));
    if (!(r.rank in best) || s > best[r.rank]) best[r.rank] = s;
  }
  const ranked = Object.entries(best).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { rank: null, score: 0, margin: 0 };
  const [rank, score] = ranked[0];
  const other = ranked.find(([r]) => rankValue(r) !== rankValue(rank));
  return { rank, score, margin: other ? score - other[1] : 1 };
}


/**
 * Read a Blackjack screenshot.
 * → { ok, reason?, faceUp: [{ box, glyph, red, rank, score, margin, row }], faceDown: n, defuser: bool }
 */
export function readBlackjack(data, W, H, learned = {}) {
  const white = new Uint8Array(W * H), back = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    if (isWhite(data[i], data[i + 1], data[i + 2])) white[p] = 1;
    else if (isBack(data[i], data[i + 1], data[i + 2])) back[p] = 1;
  }
  const minArea = W * H * 0.012;
  const cardLike = b => { const r = (b.y1 - b.y0) / (b.x1 - b.x0); return r > 1.1 && r < 1.9; };
  // a face-up card is a white blob that fills most of its box (the rank and suit are holes in it)
  const up = blobs(white, W, H, minArea * 0.6).filter(b => cardLike(b) && b.n > (b.x1 - b.x0) * (b.y1 - b.y0) * 0.6);
  const down = blobs(back, W, H, minArea * 0.3).filter(b => cardLike(b));
  if (!up.length && !down.length) return { ok: false, reason: 'no cards found' };

  const faceUp = up.map(b => {
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    // rank = the first band of ink rows in the card's top-left; the suit symbol is the next band
    const rx0 = b.x0 + 1, rx1 = b.x0 + Math.round(w * 0.6), ry0 = b.y0 + 1, ry1 = b.y0 + Math.round(h * 0.6);
    let top = -1, bottom = -1, red = 0, dark = 0;
    for (let y = ry0; y < ry1; y++) {
      let n = 0;
      for (let x = rx0; x < rx1; x++) {
        const p = (y * W + x) * 4;
        if (isInk(data[p], data[p + 1], data[p + 2])) {
          n++;
          if (isRed(data[p], data[p + 1], data[p + 2])) red++; else dark++;
        }
      }
      if (n && top < 0) top = y;
      if (n) bottom = y;
      if (!n && top >= 0 && y - bottom > Math.max(1, h * 0.02)) break;
    }
    const glyph = top >= 0 ? inkGlyph(data, W, rx0, top, rx1, bottom + 1) : null;
    const c = glyph ? classifyRank(glyph, learned) : { rank: null, score: 0, margin: 0 };
    return { box: b, glyph, red: red > dark, ...c };
  });
  // rows (top row first), then left to right
  const all = faceUp.map(c => ({ ...c, cy: (c.box.y0 + c.box.y1) / 2 }));
  const rowH = all.length ? Math.max(...all.map(c => c.box.y1 - c.box.y0)) * 0.5 : 0;
  all.sort((a, b) => (Math.abs(a.cy - b.cy) < rowH ? a.box.x0 - b.box.x0 : a.cy - b.cy));
  let row = 0;
  all.forEach((c, i) => { if (i && Math.abs(c.cy - all[i - 1].cy) >= rowH) row++; c.row = row; });
  return { ok: true, faceUp: all, faceDown: down.length, defuser: down.length > 0 };
}
