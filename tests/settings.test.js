// Settings (the picker, the starting module, the needy lead) and New game's list of per-game data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { hiddenSet, shownModules, startingModule, needyLeadSeconds, SETTINGS } = await import('../src/core/settings.js');
const { MODULE_REGISTRY } = await import('../src/core/moduleRegistry.js');
const { GAME_SAVED, GAME_MEMORY, GAME_ITEMS, startNewGame } = await import('../src/core/newGame.js');
const { setSharedSetting } = await import('../src/core/sharedSetting.js');
const set = (name, v) => store.set(SETTINGS[name].key, v);

test('modules in the picker', () => {
  assert.deepEqual([...hiddenSet('maze, nope,queens,')].sort(), ['maze', 'queens'], 'unknown ids are ignored');
  assert.equal(hiddenSet(MODULE_REGISTRY.map((m) => m.id).join(',')).size, 0, 'hiding every module shows them all');
  const shown = shownModules('mines,chess').map((m) => m.id);
  assert.equal(shown[0], 'queens');
  assert.ok(!shown.includes('chess') && shown.length === MODULE_REGISTRY.length - 2);
});

test('the module the app opens on', () => {
  store.clear();
  assert.equal(startingModule(), 'mines', 'first visit: the first module');
  set('lastModule', 'astrology');
  assert.equal(startingModule(), 'astrology', 'then the one used last (on by default)');
  set('openLast', 'off');
  assert.equal(startingModule(), 'mines', 'setting off: the first module');
  set('openLast', 'on');
  set('hiddenModules', 'astrology,mines');
  assert.equal(startingModule(), 'queens', 'the last one is hidden now: the first one shown');
  set('lastModule', 'not-a-module');
  assert.equal(startingModule(), 'queens');
});

test('needy lead', () => {
  assert.equal(needyLeadSeconds('8'), 8);
  assert.equal(needyLeadSeconds(''), 5);
  assert.equal(needyLeadSeconds('7'), 5, 'only the offered choices');
});

test('New game forgets the per-game data and keeps the rest', () => {
  store.clear();
  setSharedSetting('bombvision_serial', 'AB1CD2');
  setSharedSetting('bombvision_astro_stars', '3: Libra');
  setSharedSetting('bombvision_password_words', 'ABOUT AFTER');
  setSharedSetting(SETTINGS.needyLead.key, '8');
  startNewGame();
  assert.equal(store.has('bombvision_serial'), false);
  assert.equal(store.has('bombvision_astro_stars'), false);
  assert.equal(store.get('bombvision_password_words'), 'ABOUT AFTER', 'the password list is kept');
  assert.equal(store.get(SETTINGS.needyLead.key), '8', 'settings are kept');
  assert.ok(GAME_ITEMS.includes('the serial') && GAME_ITEMS.includes('Symbols grids'));
});

test("every per-game key New game clears is still a module's key", () => {
  const files = [];
  const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.jsx?$/.test(f) && !p.includes('newGame.js')) files.push(readFileSync(p, 'utf8')); });
  walk(new URL('../src', import.meta.url).pathname);
  const all = files.join('\n');
  for (const [key] of [...GAME_SAVED, ...GAME_MEMORY]) {
    if (key === 'bombvision_serial') continue; // imported as SERIAL_KEY
    assert.ok(all.includes(`'${key}'`), `${key} is used by a module`);
  }
});
