// Release audit 2026-11-21: Diagram — every shading of 2 and 3 circles gives an expression that evaluates back to it
import test from 'node:test';
import assert from 'node:assert/strict';
const { VennCore } = await import('../src/modules/diagram/diagramCore.js');

// independent evaluator for the notation: letters, S, Null, postfix ', n (∩, binds tighter), u (∪), parentheses
function evalExpr(s, names) {
  const k = names.length, M = 1 << k, FULL = (1 << M) - 1; let p = 0;
  const setOf = v => { let t = 0; for (let m = 0; m < M; m++) if ((m >> v) & 1) t |= 1 << m; return t; };
  const prim = () => {
    let v;
    if (s[p] === '(') { p++; v = uni(); assert.equal(s[p], ')'); p++; }
    else if (s.startsWith('Null', p)) { p += 4; v = 0; }
    else if (s[p] === 'S') { p++; v = FULL; }
    else { const i = names.indexOf(s[p]); assert.ok(i >= 0, 'bad char ' + s[p] + ' in ' + s); p++; v = setOf(i); }
    while (s[p] === "'") { p++; v = ~v & FULL; }
    return v;
  };
  const inter = () => { let v = prim(); while (s[p] === 'n') { p++; v &= prim(); } return v; };
  const uni = () => { let v = inter(); while (s[p] === 'u') { p++; v |= inter(); } return v; };
  const v = uni(); assert.equal(p, s.length, 'trailing in ' + s); return v;
}

for (const names of [['A', 'B'], ['A', 'B', 'C'], ['C', 'A', 'B']]) {
  test(`diagram: every one of the ${1 << (1 << names.length)} shadings for ${names.join('')} gives an expression that evaluates back to it`, () => {
    const M = 1 << names.length;
    let maxLen = 0;
    for (let f = 0; f < (1 << M); f++) {
      const masks = []; for (let m = 0; m < M; m++) if ((f >> m) & 1) masks.push(m);
      const e = VennCore.expression(names, masks);
      assert.ok(e, 'no expression for ' + f);
      assert.equal(evalExpr(e, names), f, `${e} for f=${f}`);
      maxLen = Math.max(maxLen, e.length);
    }
  });
}
test('diagram: same result if u binds tighter than n (expressions are fully bracketed, no precedence assumption)', () => {
  const swap = e => e.replace(/n/g, '#').replace(/u/g, 'n').replace(/#/g, 'u'); // swap symbols, evaluate, swap meaning back
  const names = ['A', 'B', 'C'];
  for (let f = 0; f < 256; f++) {
    const masks = []; for (let m = 0; m < 8; m++) if ((f >> m) & 1) masks.push(m);
    const e = VennCore.expression(names, masks);
    if (e === 'Null') continue;
    // De Morgan dual: evaluating swap(e) with n-tighter = evaluating e with u-tighter, complemented per leaf... simpler: brute check brackets
    let d = 0; const stack = [new Set()];
    for (const ch of e) {
      if (ch === '(') stack.push(new Set());
      else if (ch === ')') { const g = stack.pop(); assert.ok(g.size <= 1, 'mixed in one group: ' + e); }
      else if (ch === 'n' || ch === 'u') stack[stack.length - 1].add(ch);
    }
    assert.ok(stack[0].size <= 1, 'mixed at top level: ' + e);
  }
});
