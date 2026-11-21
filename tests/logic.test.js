// Logic grid reader on real screenshots: α β γ δ are thin grey italics, P Q R S T bold white capitals
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readLogicGrid, evaluateExpression } from '../src/modules/logic/logicSolver.js';

const load = f => readPng(new URL(`./fixtures/${f}`, import.meta.url).pathname);

// area-average resize, as when a screenshot is scaled down / re-shared
function resize({ data, width: W, height: H }, s) {
  const w = Math.round(W * s), h = Math.round(H * s), out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0]; let n = 0;
    for (let yy = Math.floor(y / s); yy < Math.min(H, Math.ceil((y + 1) / s)); yy++)
      for (let xx = Math.floor(x / s); xx < Math.min(W, Math.ceil((x + 1) / s)); xx++) {
        const i = (yy * W + xx) * 4; acc[0] += data[i]; acc[1] += data[i + 1]; acc[2] += data[i + 2]; n++;
      }
    const o = (y * w + x) * 4; out[o] = acc[0] / n; out[o + 1] = acc[1] / n; out[o + 2] = acc[2] / n; out[o + 3] = 255;
  }
  return { data: out, width: w, height: h };
}
const read = img => readLogicGrid(img.data, img.width, img.height).text;

test('logic OCR: italic α is α, not Q (bold R and T stay)', () => {
  const img = load('logic_alpha_R.png');
  assert.equal(read(img), '(α→((¬R→α)VT))');
  for (const s of [1.6, 0.8, 0.6]) assert.equal(read(resize(img, s)), '(α→((¬R→α)VT))', `scale ${s}`);
});

test('logic OCR: italic β is β and bold P is P, at any size', () => {
  const img = load('logic_beta_P.png');
  assert.equal(read(img), '((¬S→(¬S^β))VP)');
  for (const s of [1.6, 0.8, 0.6, 0.45]) assert.equal(read(resize(img, s)), '((¬S→(¬S^β))VP)', `scale ${s}`);
});

test('logic OCR: the read expressions evaluate', () => {
  const vars = { P: true, Q: true, R: false, S: true, T: true };
  const a = evaluateExpression('(α→((¬R→α)VT))', { α: false }, vars);
  assert.equal(a, true);
  assert.equal(evaluateExpression('((¬S→(¬S^β))VP)', { α: a, β: true }, vars), true);
});
