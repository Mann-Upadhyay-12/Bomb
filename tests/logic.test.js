// Logic grid reader on real screenshots: α β γ δ are thin grey italics, P Q R S T bold white capitals
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readLogicGrid, evaluateExpression, isGreekGlyph, expressionTokens, parseManualText } from '../src/modules/logic/logicSolver.js';

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

// A stage that is only "β": no white letter or bracket to compare its grey with. It read as Q.
test('logic OCR: β on its own is β, not Q', () => {
  const img = load('logic_beta_alone.png');
  assert.equal(read(img), 'β');
  for (const s of [1.6, 0.8, 0.6, 0.45]) assert.equal(read(resize(img, s)), 'β', `scale ${s}`);
});

// The game's α β γ δ are italic, P Q R S T upright: the tilt alone tells them apart.
test('logic OCR: Greek letters lean, capitals stand upright', () => {
  for (const f of ['logic_alpha_R.png', 'logic_beta_P.png', 'logic_beta_alone.png']) for (const s of [1.6, 1, 0.8]) {
    const img = s === 1 ? load(f) : resize(load(f), s);
    for (const c of readLogicGrid(img.data, img.width, img.height).rows.flat().filter(Boolean)) {
      if ('αβγδ'.includes(c.sym)) assert.ok(c.f.lean >= 0.1, `${f} ×${s}: ${c.sym} leans ${c.f.lean.toFixed(2)}`);
      if ('PQRST'.includes(c.sym)) assert.ok(c.f.lean < 0.05, `${f} ×${s}: ${c.sym} leans ${c.f.lean.toFixed(2)}`);
    }
  }
  // β alone is the brightest ink in its grid, so brightness would call it a white capital; the tilt says Greek
  const img = load('logic_beta_alone.png');
  const beta = readLogicGrid(img.data, img.width, img.height).rows.flat().find(Boolean);
  assert.equal(isGreekGlyph({ ...beta.f, bright: 1 }), true);
});

test('logic OCR: the read expressions evaluate', () => {
  const vars = { P: true, Q: true, R: false, S: true, T: true };
  const a = evaluateExpression('(α→((¬R→α)VT))', { α: false }, vars);
  assert.equal(a, true);
  assert.equal(evaluateExpression('((¬S→(¬S^β))VP)', { α: a, β: true }, vars), true);
});

test('logic: the other ways to write the operators give the same answers', () => {
  const vars = { P: true, Q: true, R: false, S: true, T: true };
  const same = (a, b, greek = {}) => assert.equal(evaluateExpression(a, greek, vars), evaluateExpression(b, greek, vars), `${a} vs ${b}`);
  same('(!r && s) || ~s', '(¬R^S)V¬S');
  same('P ⇒ (Q ∨ R)', 'P→(QVR)');
  same('P ⟹ R', 'P→R');
  same('¬(P*Q) + T', '¬(P^Q)VT');
  same('(α ∧ ¬R) -> S', '(α^¬R)→S', { α: false });
  assert.equal(evaluateExpression('P ⇒ R', {}, vars), false);
  // unbracketed → groups to the right: R→(P→R) is true, (R→P)→R would be false (the game brackets them)
  assert.equal(evaluateExpression('R→P→R', {}, vars), true);
});

test('logic: the formula as coloured tokens', () => {
  const vars = { P: true, Q: true, R: false, S: true, T: true };
  const t = expressionTokens('(α → ¬r) x', { α: true }, vars);
  assert.deepEqual(t.map((x) => x.t).join(''), '(α→¬R)x');
  assert.deepEqual(t.map((x) => x.kind), ['paren', 'greek', 'op', 'op', 'var', 'paren', 'bad']);
  assert.equal(t[1].val, true);
  assert.equal(t[4].val, false);
  assert.equal(expressionTokens('β', {}, vars)[0].val, undefined, 'not solved yet');
});

test('logic: the P–T values are read from a phone copy with Discord bold marks', () => {
  assert.deepEqual(parseManualText('**P** = **T**, __Q__: F, > R = TRUE, S=0, T = 1'), { P: true, Q: false, R: true, S: false, T: true });
});
