// Blackjack: helper's picture = the player's cards, defuser's picture = the dealer's up card + face-down cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readBlackjack, shapeScore, decodeShape } from '../src/modules/blackjack/blackjackVision.js';
import { bjAdvice, handTotal, bustChance, tableRows } from '../src/modules/blackjack/blackjackSolver.js';
import { RANK_REFS } from '../src/modules/blackjack/blackjackRefs.js';

const read = (name) => { const i = readPng(new URL(`./fixtures/${name}`, import.meta.url)); return readBlackjack(i.data, i.width, i.height); };

test('blackjack: helper picture — 7♠ 5♠, nothing face down', () => {
  const r = read('blackjack_helper_7_5.png');
  assert.equal(r.defuser, false);
  assert.deepEqual(r.faceUp.map(c => c.rank), ['7', '5']);
  assert.deepEqual(r.faceUp.map(c => c.red), [false, false]);
  assert.ok(r.faceUp.every(c => c.score > 0.9 && c.margin > 0.1));
});

test('blackjack: defuser picture — dealer 6♦ on top, 3 cards face down', () => {
  const r = read('blackjack_defuser_6.png');
  assert.equal(r.defuser, true);
  assert.equal(r.faceDown, 3);
  assert.deepEqual(r.faceUp.map(c => [c.rank, c.red, c.row]), [['6', true, 0]]);
});

test('blackjack: the font references alone read the real 7, 5 and 6 (ranks not seen yet rely on them)', () => {
  const fontOnly = RANK_REFS.filter(x => x.font !== 'game').map(x => ({ ...x, v: decodeShape(x.fp) }));
  const best = (g) => {
    const by = {};
    for (const r of fontOnly) {
      const s = shapeScore(g.v, r.v) - 0.5 * Math.abs(Math.log(g.aspect / r.aspect));
      if (!(r.rank in by) || s > by[r.rank]) by[r.rank] = s;
    }
    return Object.entries(by).sort((x, y) => y[1] - x[1]);
  };
  const cards = [...read('blackjack_helper_7_5.png').faceUp, ...read('blackjack_defuser_6.png').faceUp];
  const got = cards.map(c => best(c.glyph));
  assert.deepEqual(got.map(g => g[0][0]), ['7', '5', '6']);
  assert.ok(got.every(g => g[0][1] - g[1][1] > 0.1), 'clear margin');
});

test('blackjack: 7 + 5 = 12 against a 6 → STAND', () => {
  const a = bjAdvice(['7', '5'], '6');
  assert.equal(a.action, 'STAND');
  assert.equal(a.total, 12);
  assert.equal(a.soft, false);
});

test('blackjack: totals, soft hands, bust chance and the table', () => {
  assert.deepEqual(handTotal(['A', '6']), { total: 17, soft: true });
  assert.deepEqual(handTotal(['A', '6', '9']), { total: 16, soft: false });
  assert.deepEqual(handTotal(['A', 'A', '9']), { total: 21, soft: true });
  assert.deepEqual(handTotal(['K', 'Q', '5']), { total: 25, soft: false });
  assert.equal(bjAdvice(['K', 'Q', '5'], '7').bust, true);
  assert.equal(bjAdvice(['10', '6'], '7').action, 'HIT');
  assert.equal(bjAdvice(['10', '6'], '6').action, 'STAND');
  assert.equal(bjAdvice(['10', '2'], '3').action, 'HIT');
  assert.equal(bjAdvice(['A', '7'], '8').action, 'STAND');
  assert.equal(bjAdvice(['A', '7'], '9').action, 'HIT');
  assert.equal(bjAdvice(['A', '6'], '4').action, 'HIT');
  assert.equal(bjAdvice(['5', '4'], null).action, 'HIT');     // 9: same answer for every dealer card
  assert.equal(bjAdvice(['10', '8'], null).action, 'STAND');  // 18
  assert.equal(bjAdvice(['10', '3'], null).needsDealer, true); // 13 depends on the dealer
  assert.equal(bustChance(['10', '2']), 4 / 13);               // 10, J, Q, K
  assert.equal(bustChance(['A', '5']), 0);                     // soft: can't bust
  const rows = tableRows();
  assert.equal(rows.find(r => r.label === '12').cells.join(''), 'HITHITSTANDSTANDSTANDHITHITHITHITHIT');
});
