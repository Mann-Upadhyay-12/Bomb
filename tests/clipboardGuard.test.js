// Auto-copy must not replace what the player copied in Discord while an answer was still on its way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leftSinceLastAction } from '../src/core/leftPage.js';

test('clipboard: a copy is held back when the player left the page after their last action', () => {
  // pasted the manual at 1000 ms, still here when the answer came
  assert.equal(leftSinceLastAction(1000, -Infinity, false), false);
  // pasted at 1000 ms, went to Discord at 1500 ms: the answer arriving later is not copied
  assert.equal(leftSinceLastAction(1000, 1500, false), true);
  // came back and clicked / pasted again at 2000 ms: copies work again
  assert.equal(leftSinceLastAction(2000, 1500, false), false);
  // the tab is hidden: never
  assert.equal(leftSinceLastAction(2000, 1500, true), true);
});
