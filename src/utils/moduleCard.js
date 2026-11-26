// Finding one module card inside a bigger picture (a Discord screenshot): every module picture has
// its name in large orange letters across the top, so the card sits around the biggest orange title.
import { isTitleInk, letterBoxes, mergeLines } from '../core/level/levelVision.js';

/** The biggest line of orange title text → { x0, x1, y0, y1 } or null. Works on { data, width, height }. */
export function findModuleTitle(img) {
  const { data, width: W, height: H } = img;
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; p < W * H; p++, i += 4) if (isTitleInk(data[i], data[i + 1], data[i + 2])) mask[p] = 1;
  const lines = mergeLines(letterBoxes(mask, W, H))
    .filter(l => l.x1 - l.x0 > (l.y1 - l.y0) * 2.2 && l.y1 - l.y0 >= 6);
  if (!lines.length) return null;
  // the title is the tallest orange line (the bot's name and button labels are smaller)
  return lines.sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0) || (b.x1 - b.x0) - (a.x1 - a.x0))[0];
}

/** A copy of part of the picture (clamped to it). */
export function cropImage(img, x0, y0, x1, y1) {
  const { data, width: W, height: H } = img;
  x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(W, Math.round(x1)); y1 = Math.min(H, Math.round(y1));
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
  return { data: out, width: w, height: h, offset: { x: x0, y: y0 } };
}

/**
 * The module card around its title, from the title's size: `widthPerTitle` = card width ÷ title
 * width and `topPerTitle` = how far above the title the card starts, in title heights — both
 * measured on the module's own picture.
 */
export function cropAroundTitle(img, title, { widthPerTitle, heightPerWidth = 1, topPerTitle = 1.4, margin = 0.03 }) {
  const tw = title.x1 - title.x0 + 1, th = title.y1 - title.y0 + 1;
  const cw = tw * widthPerTitle, cx = (title.x0 + title.x1) / 2;
  const top = title.y0 - th * topPerTitle;
  return cropImage(img, cx - cw / 2 - cw * margin, top - cw * margin, cx + cw / 2 + cw * margin, top + cw * heightPerWidth + cw * margin);
}
