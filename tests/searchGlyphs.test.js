import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { cellFeature, matchGlyph, combineGlyphOcr, SEARCH_GLYPHS } from '../src/modules/search/searchGlyphs.js';

const FIX = new URL('./fixtures/', import.meta.url).pathname;
const CASES = [
  ['search_hmrcm.png', ['HMRCM', 'VNWOT', 'PNMEL', 'GMEJO', 'XKJFV']], // Tesseract read W as J here
  ['search_ydaag.png', ['YDAAG', 'ENSCT', 'XOZDC', 'HPRMD', 'PKHTU']],
  // tester report: with no I sample, the I's fell to the closest shape (E) when Tesseract gave nothing
  ['search_hnxji.png', ['HNXJI', 'GGLTR', 'IRRHZ', 'SHSID', 'ORXUE']]
];

for (const [file, rows] of CASES) {
  test(`search letters by shape: ${file}`, () => {
    const { data, width, height } = readPng(FIX + file);
    const got = rows.map((row, r) => [...row].map((_, c) => {
      const f = cellFeature(data, width, height, r, c);
      const m = matchGlyph(f, SEARCH_GLYPHS);
      // Tesseract is only asked when the shape isn't sure; pretend it always answers wrong ("J")
      return m.sure ? m.letter : combineGlyphOcr(f, m, 'J', SEARCH_GLYPHS);
    }).join(''));
    assert.deepEqual(got, rows);
  });
}

test('search: a letter with no sample (B/Q) keeps Tesseract\'s answer', () => {
  const { data, width, height } = readPng(FIX + 'search_hmrcm.png');
  const f = cellFeature(data, width, height, 0, 0); // H
  const m = matchGlyph(f, SEARCH_GLYPHS);
  assert.equal(combineGlyphOcr(f, { ...m, sure: false }, 'B', SEARCH_GLYPHS), 'B');
  assert.equal(combineGlyphOcr(f, m, '?', SEARCH_GLYPHS), 'H');
});

test('search: every I is read by shape, so no Tesseract is needed for the HNXJI grid', () => {
  const { data, width, height } = readPng(FIX + 'search_hnxji.png');
  for (const [r, c] of [[0, 4], [2, 0], [3, 3]]) {
    const m = matchGlyph(cellFeature(data, width, height, r, c), SEARCH_GLYPHS);
    assert.equal(m.letter, 'I');
    assert.equal(m.sure, true);
  }
});
