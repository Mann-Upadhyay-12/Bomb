// The Button: checklists from real rounds (the wording changes every round)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChecklist, evaluateRules, compileClause } from '../src/modules/button/buttonSolver.js';

const M1 = `    button is blue and label says Hold: 2s
    button is white and label says Blue: 6s
    button is red and label says Detonate: 11s
    serial starts with a digit and label says Yellow: 11s
    serial digit sum is odd and label says Press: 10s
    serial has at least 2 vowels and button is red: 7s
    serial has fewer than 2 vowels and label says Blue: 4s
    there are no needy modules and label says Hold: 11s
    this is button 1 or 3 and button is blue: 8s
    Otherwise: 7s

Serial: 00CAGWM9`;
const M2 = `button is red and label says Punch: 2s
button is blue and label says Blue: 5s
button is red and label says White: 6s
module count is odd, button is red, and label says White: 4s
there are at least 2 needy modules, button is green, and label says Press: 3s
rightmost serial digit is even and button is white: 7s
serial has a vowel and button is yellow: 4s
serial has no vowels and button is blue: 9s
serial starts with a digit and label says Yellow: 11s
Otherwise: 7s
Serial: DV4B5NC5`;
const M3 = `    button is red and label says Punch: 2s
    non-needy module count is even, button is yellow, and label says Green: 10s
    serial has no vowels and button is green: 9s
    serial starts with a digit and label says Abort: 11s
    serial digit sum is odd and label says Red: 10s
    serial has fewer than 2 vowels and label says Press: 4s
    total module count is odd and label says Green: 9s
    label is a color word matching the button color: 10s
    label is a color word different from the button color: 2s
    Otherwise: 7s

Serial: FV3TDT6P`;

const solve = (text, ctx) => {
  const { rules, facts } = parseChecklist(text);
  const r = evaluateRules(rules, { serial: facts.serial, ...ctx });
  return r.match ? r.match.seconds : r.blocked ? `blocked@${r.blocked.n}` : null;
};

test('button: every line of the three real checklists is understood', () => {
  for (const m of [M1, M2, M3]) {
    const { rules } = parseChecklist(m);
    assert.equal(rules.length, 10);
    const unclear = rules.flatMap(r => r.clauses.filter(c => c.unknown).map(c => c.desc));
    assert.deepEqual(unclear, []);
  }
});

test('button: "serial starts with a digit" and "this is button 1 or 3"', () => {
  assert.equal(solve(M1, { color: 'blue', label: 'HOLD' }), 2);
  assert.equal(solve(M1, { color: 'green', label: 'YELLOW' }), 11); // 00CAGWM9 starts with a digit
  assert.equal(solve(M1, { color: 'green', label: 'PRESS' }), 10);  // digit sum 9 is odd
  assert.equal(solve(M1, { color: 'blue', label: 'TAP', needy: 1, buttonNum: 3 }), 8);
  assert.equal(solve(M1, { color: 'blue', label: 'TAP', needy: 1, buttonNum: 2 }), 7);
  assert.equal(solve(M1, { color: 'blue', label: 'TAP', needy: 1 }), 'blocked@9'); // asks which button
  assert.equal(solve(M2, { color: 'green', label: 'YELLOW', total: 6, needy: 0 }), 7); // DV4B5NC5 starts with a letter
  assert.equal(solve(M2, { color: 'blue', label: 'HOLD' }), 9);
});

test('button: label colour word matching / different from the button colour', () => {
  assert.equal(solve(M3, { color: 'red', label: 'RED' }), 10);  // rule 5 comes first (digit sum odd)
  assert.equal(solve(M3, { color: 'blue', label: 'BLUE', total: 6 }), 10);
  assert.equal(solve(M3, { color: 'blue', label: 'WHITE', total: 6 }), 2);
  assert.equal(solve(M3, { color: 'blue', label: 'HOLD', total: 6 }), 7); // not a colour word
});

test('button: other wordings', () => {
  const ok = (clause, ctx, want) => assert.equal(compileClause(clause).eval(ctx), want, clause);
  ok('serial ends with a letter', { serial: 'AB12C' }, true);
  ok('serial starts with an even digit', { serial: '4AB' }, true);
  ok('first character of the serial is a letter', { serial: '4AB' }, false);
  ok('this is the last button', { buttonNum: 3, buttonTotal: 3 }, true);
  ok('this is not button 2', { buttonNum: 2 }, false);
  ok('button is red or blue', { color: 'blue' }, true);
  ok('label says Hold or Press', { label: 'PRESS' }, true);
  ok('label is not a color word', { label: 'ABORT' }, true);
  const { rules } = parseChecklist('this is button 1, 2, or 3 and button is white: 5s');
  assert.deepEqual(rules[0].clauses.map(c => c.desc), ['button # = 1 / 2 / 3', 'button = white']);
});
