// Balance glyphs by shape (balanceGlyphs.js): the samples cut from real game pictures must tell the
// characters apart, and must never be SURE of a wrong one — a sure match skips Tesseract and every other
// check. (Reading whole pictures needs a browser: scripts/check-balance.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGlyph, BALANCE_GLYPHS } from '../src/modules/balance/balanceGlyphs.js';

const key = (t) => t.ch + (t.sub ? '₍sub₎' : '');

test('balance glyphs: each picture\'s glyphs read from the OTHER pictures\' samples', () => {
  let n = 0, right = 0;
  const sureWrong = [];
  for (const g of BALANCE_GLYPHS) {
    const others = BALANCE_GLYPHS.filter(t => t.src !== g.src);
    if (!others.some(t => key(t) === key(g))) continue; // a character only that picture has
    n++;
    const m = classifyGlyph(g, { sub: g.sub, bank: others });
    if (m.ch === g.ch) right++;
    else if (m.sure) sureWrong.push(`${key(g)} (${g.src}) read as ${m.ch}`);
  }
  assert.deepEqual(sureWrong, []);
  assert.ok(right / n >= 0.98, `${right}/${n} right`);
});

test('balance glyphs: a character with no sample is never read as another one for sure', () => {
  // what happens to a letter the bank hasn't seen yet (Fe, Br, ₅ …): it must go to Tesseract
  const sureWrong = [];
  for (const g of BALANCE_GLYPHS) {
    const m = classifyGlyph(g, { sub: g.sub, bank: BALANCE_GLYPHS.filter(t => key(t) !== key(g)) });
    if (m.sure) sureWrong.push(`${key(g)} (${g.src}) read as ${m.ch} ${m.score.toFixed(2)}`);
  }
  assert.deepEqual(sureWrong, []);
});

test('balance glyphs: subscripts only match digits, other glyphs never do', () => {
  const sub = BALANCE_GLYPHS.find(t => t.sub), main = BALANCE_GLYPHS.find(t => !t.sub);
  assert.match(classifyGlyph(sub, { sub: true }).ch, /^[0-9]$/);
  assert.doesNotMatch(classifyGlyph(main, { sub: false }).ch, /^[0-9]$/);
  assert.equal(classifyGlyph(sub, { sub: true, exclude: '*' }).sure, false); // '*': no samples at all
});
