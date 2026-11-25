// Balance reader: subscript digits are checked against their closed loops (OCR swaps 6 → 3 / 8 …)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixDigitByLoops } from '../src/modules/balance/balanceVision.js';
import { balanceEquation, repairEquation, fixOcrFormulaSide, readsBalanced } from '../src/modules/balance/balanceSolver.js';

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

test('balance: two loops of solid ink are an 8, even when soft edges fill one in', () => {
  // tests/fixtures/balance_propane_small.png (271 px): the "₈" of C₃H₈ has one loop counting soft
  // edge pixels and two counting solid ink only — it was read as 6 ("C3H6", which balances too)
  assert.equal(fixDigitByLoops('6', [{ cy: 0.7, area: 20 }], 2), '8');
  assert.equal(fixDigitByLoops('3', [{ cy: 0.3, area: 9 }, { cy: 0.7, area: 9 }], 0), '3', 'a 3 whose bays only close through soft edges stays a 3');
});

// The 24 Nov pictures, read in the browser (OCR can't run here):
//   balance_propane_small.png → C3H8 + O2 → CO2 + H2O       (was C3H6 + O2 → CO + H2O)
//   balance_alcl3_big.png     → AlCl3 + Na3PO4 → AlPO4 + NaCl (was AlCl3 + NapO4 → …)
//   balance_al_ni_small.png   → Al + Ni(NO3)2 → Al(NO3)3 + Ni (was A + NHNO3)2 → AUNO3)3 + Ni)
test('balance: a reading that does not balance is repaired from what OCR confuses', () => {
  // the "₃" glued to the "a" of Na came back unread ("?"), or as S / s / g in the line reads
  assert.deepEqual(repairEquation([fixOcrFormulaSide('AlCl3 + Na?PO4', { keepUnknown: true })], ['AlPO4 + NaCl']),
    { equation: 'AlCl3 + Na3PO4 → AlPO4 + NaCl', edits: 1 });
  assert.equal(repairEquation(['AlClS + NaSPO4', 'AlClS + NasPO4', fixOcrFormulaSide('AICl3+NagPO4')], ['AlPO4 + NaCl']).equation,
    'AlCl3 + Na3PO4 → AlPO4 + NaCl');
  // a lost bracket goes where it makes a real formula: "Al(NO3)3", not "(AlNO3)3" (which balances too)
  assert.equal(repairEquation(['Al + Ni(NO3)2'], ['AlNO3)3 + Ni']).equation, 'Al + Ni(NO3)2 → Al(NO3)3 + Ni');
  // …but a bracket at the start is real when nothing else works: (NH4)2SO4
  assert.equal(repairEquation(['NH4)2SO4 + BaCl2'], ['BaSO4 + NH4Cl']).equation, '(NH4)2SO4 + BaCl2 → BaSO4 + NH4Cl');
  // sides from different readings pair up; a worse reading that also balances ("Ni(NO3)" lost its
  // 2) doesn't outvote a better one
  assert.equal(repairEquation(['Al + Ni(NO3)2', 'Al + Ni(NOs)2', 'Al + Ni(NO3)'], ['At(NO3)3 + Ni', 'Al(NO3)3 + Ni']).equation,
    'Al + Ni(NO3)2 → Al(NO3)3 + Ni');
});

test('balance: an unread digit that any value would balance is not guessed', () => {
  // a burning hydrocarbon balances whatever its subscripts are
  assert.equal(repairEquation(['C?H? + O2'], ['CO2 + H2O']), null);
  assert.equal(repairEquation(['A + NHNO3)2'], ['AUNO3)3 + Ni']), null, 'too far from any real equation');
});

// 25 Nov: tests/fixtures/balance_hcl_cuoh2_wrapped.png ("HCl + Cu(OH)₂ →" / "CuCl₂ + H₂O"), read in the
// browser → HCl + Cu(OH)2 → CuCl2 + H2O (was not read at all: the touching "Cu" was cut inside the u,
// the curled foot of "l" went into "Cl₂" → "42", and "H20" had no repair). All 7 pictures still read.
test('balance: a letter foot glued to "₃" closes one bay only with soft edges: a 3, not an 8', () => {
  assert.equal(fixDigitByLoops('8', [{ cy: 0.3 }], 0), '3');
  assert.equal(fixDigitByLoops('8', [{ cy: 0.3 }, { cy: 0.7 }], 2), '8');
});

test('balance: a 0 read for the O after a subscript is repaired', () => {
  assert.equal(repairEquation(['HCl + Cu(OH)2'], ['CuCl2 + H20']).equation, 'HCl + Cu(OH)2 → CuCl2 + H2O');
});

// 25 Nov, 11 more game pictures (8 new: tests/fixtures/balance_mg_al2so43_wrapped, croh3_wrapped,
// li2o_hcl_wrapped, li_cl2, k_h2o, al2o3_h3po4_wrapped, nio_hcl_wrapped, alcl3_big2), read in the
// browser: all 15 Balance pictures read right. Four read "H₂O" as "HgO" at first: the cut between the
// touching "₂O" gave the O's faint edge column to the "₂", which then looked as tall as a letter.
test('balance: OCR letter fixes — case pairs, a cut-off L, a "₂" read as z', () => {
  assert.equal(fixOcrFormulaSide('HCL + KCL'), 'HCl + KCl');   // the "HC" pair must not hide "CL"
  assert.equal(fixOcrFormulaSide('Ii + Oz'), 'Li + O2');       // L whose foot was cut off; z → 2
  assert.equal(fixOcrFormulaSide('Zn + Zr'), 'Zn + Zr');       // a real Z stays
  assert.equal(fixOcrFormulaSide('In + Ir'), 'In + Ir');       // I before a letter it can take stays
  assert.equal(fixOcrFormulaSide('TrO2 + Nr'), 'TiO2 + Ni');   // an i that lost its dot
  assert.equal(fixOcrFormulaSide('Cr + Br2 + Sr'), 'Cr + Br2 + Sr');
  assert.equal(fixOcrFormulaSide('Srcl2 + Cuo'), 'SrCl2 + CuO'); // a symbol has two letters at most
  assert.equal(fixOcrFormulaSide('Nas'), 'Nas', 'a digit look-alike after a symbol is left for the repair (Na₃)');
});

test('balance: a reading that balances but could not be printed is not taken', () => {
  // OCR noise that balances (from the font stress test): the reader offers these as doubtful only
  for (const eq of [
    'KI + Cl12 → KCl + I2',            // an element alone only comes as 2 / 3 / 4 / 8
    'Nd + Cl2 → NdCl',                 // "a" read as "d": no puzzle uses neodymium
    'BaCl2 + Na2SO4 → BaSO44 + NaCl',  // a wide "₄" split in two
    'HCl1 + NaOH → NaCl + H2O',        // a subscript 1 is never written
    'P4 + OO2 → P4O10',                // one symbol twice, then a count
    'H2SO04 + NaOH → Na2SO4 + H2O',    // a count never starts with 0
    'Al(OH)3 + H2SO4 → Al45043 + H2O', // 3+ digit counts
    'Hg(NO3)2 → HgO + NO2 + 0O2',
    'PbN(O3)2 → PbO + NO2 + O2',       // a bracket around one element
    'Cr2O3 + Al → Al20O3 + Cr',        // 20 aluminium atoms: past 12 only C / H / O
  ]) assert.equal(readsBalanced(eq), false, eq);
  assert.equal(repairEquation(['PbNO3)2'], ['PbO + NO2 + O2']).equation, 'Pb(NO3)2 → PbO + NO2 + O2');
  for (const eq of ['KI + Cl2 → KCl + I2', 'P4 + O2 → P4O10', 'S8 + O2 → SO2', 'O3 → O2', 'CH3COOH + O2 → CO2 + H2O',
    'C12H22O11 + O2 → CO2 + H2O', 'C10H22 + O2 → CO2 + H2O', 'KMnO4 + HCl → KCl + MnCl2 + Cl2 + H2O'])
    assert.equal(readsBalanced(eq), true, eq);
  // typed by hand, an unusual element still balances
  assert.equal(balanceEquation('Nd + Cl2 → NdCl3').ok, true);
});

test('balance: repair keeps every subscript the reader saw (the caller\'s check)', () => {
  // dropping the unread "?" balances ("CH + O2" burns too), but the picture had a subscript there
  const keepsOne = (eq) => (eq.split('→')[0].match(/[A-Za-z)][0-9]+/g) || []).length >= 2;
  assert.equal(repairEquation(['CH? + O2'], ['CO2 + H2O'], 2, keepsOne), null);
  assert.equal(repairEquation(['CH? + O2'], ['CO2 + H2O'], 2, () => true), null, 'any digit balances: a tie, not a reading');
});
