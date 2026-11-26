// Phone wording and the remembered auto-copy switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneTitle, tapWord, isTouchScreen } from '../src/utils/touch.js';
import { AUTOCOPY_KEY, savedAutocopy, saveAutocopy, startingAutocopy, buildAutocopyDefault } from '../src/core/autocopy.js';

test('dropzone titles read "Paste …" on a phone', () => {
  const cases = [
    ['Click here, then paste the Astrology screenshot', 'Paste the Astrology screenshot'],
    ["Click here, then paste the defuser's screenshot", "Paste the defuser's screenshot"],
    ['Click here to paste WHITE chessboard screenshot', 'Paste WHITE chessboard screenshot'],
    ['Drop / paste this Simon’s GIF (or the manual)', 'Paste this Simon’s GIF (or the manual)'],
    ['Drop Stage 2 screenshot', 'Paste Stage 2 screenshot'],
    ['Click here or paste image', 'Paste an image'],
    ['Paste the manual', 'Paste the manual'],
  ];
  for (const [title, phone] of cases) assert.equal(phoneTitle(title), phone);
  const node = { type: 'b' };
  assert.equal(phoneTitle(node), node, 'a non-text title is left alone');
  assert.equal(tapWord(true, true), 'TAP');
  assert.equal(tapWord(false), 'Click');
  assert.equal(isTouchScreen(), false, 'no window (tests, build): not a phone');
});

test('auto-copy: the build default until chosen, then the choice, remembered', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  try {
    assert.equal(buildAutocopyDefault(), true, 'no build flag (dev, tests): on');
    assert.equal(savedAutocopy(), null);
    assert.equal(startingAutocopy(), true);
    saveAutocopy(false);
    assert.equal(store.get(AUTOCOPY_KEY), 'off');
    assert.equal(startingAutocopy(), false, 'off for everything from now on');
    saveAutocopy(true);
    assert.equal(startingAutocopy(), true);
    globalThis.__AUTOCOPY_DEFAULT__ = false; // yuza.html
    store.clear();
    assert.equal(startingAutocopy(), false, 'yuza.html starts off');
    saveAutocopy(true);
    assert.equal(startingAutocopy(), true, 'a choice beats the build default');
    store.set(AUTOCOPY_KEY, 'garbage');
    assert.equal(startingAutocopy(), false, 'an unreadable value falls back to the build default');
    globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    assert.equal(startingAutocopy(), false, 'storage blocked (private window): the build default');
    assert.doesNotThrow(() => saveAutocopy(true));
  } finally {
    delete globalThis.localStorage;
    delete globalThis.__AUTOCOPY_DEFAULT__;
  }
});
