// Balance reader: subscript digits are checked against their closed loops (OCR swaps 6 → 3 / 8 …)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixDigitByLoops } from '../src/modules/balance/balanceVision.js';
import { balanceEquation } from '../src/modules/balance/balanceSolver.js';

test('balance: a digit OCR read must have the right loops', () => {
  assert.equal(fixDigitByLoops('3', [{ cy: 0.67 }]), '6'); // loop low → 6
  assert.equal(fixDigitByLoops('8', [{ cy: 0.65 }]), '6');
  assert.equal(fixDigitByLoops('3', [{ cy: 0.3 }]), '9');  // loop high → 9
  assert.equal(fixDigitByLoops('6', [{ cy: 0.3 }]), '9');
  assert.equal(fixDigitByLoops('3', [{ cy: 0.3 }, { cy: 0.7 }]), '8');
  assert.equal(fixDigitByLoops('4', [{ cy: 0.5 }]), '4');
  assert.equal(fixDigitByLoops('8', [{ cy: 0.5 }]), '0');
  assert.equal(fixDigitByLoops('1', []), '1');               // no loop: OCR stands
  assert.equal(fixDigitByLoops('6', []), '6');               // (a blurry loop can close up)
});

test('balance: loops that only close through faint anti-aliasing are a 3, not an 8 / 9', () => {
  // tests/fixtures/balance_caco3.png: the small bold "₃" has both bays closed by grey edge pixels
  assert.equal(fixDigitByLoops('3', [{ cy: 0.3 }, { cy: 0.7 }], 0), '3');
  assert.equal(fixDigitByLoops('3', [{ cy: 0.3 }], 0), '3');
  assert.equal(fixDigitByLoops('3', [{ cy: 0.3 }, { cy: 0.7 }], 2), '8'); // solid loops: a real 8
  assert.equal(fixDigitByLoops('3', [{ cy: 0.67 }], 1), '6');
});

test('balance: CaCO3 and the wrapped benzene line balance', () => {
  // read from tests/fixtures/balance_caco3.png / balance_benzene_wrapped.png ("H₂O" alone on line 2)
  assert.deepEqual(balanceEquation('CaCO3 → CaO + CO2').coefficients, [1, 1, 1]);
  assert.deepEqual(balanceEquation('C6H6 + O2 → CO2 + H2O').coefficients, [2, 15, 12, 6]);
});

test('balance: sucrose from the game screenshot balances 1 12 12 11', () => {
  // read from tests/fixtures/balance_sucrose.png (the "₁₁" after O used to come out as "1111")
  const r = balanceEquation('C12H22O11 + O2 → CO2 + H2O');
  assert.equal(r.ok, true);
  assert.deepEqual(r.coefficients || r.coeffs, [1, 12, 12, 11]);
});
