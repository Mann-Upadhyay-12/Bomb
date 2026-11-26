// "New game": forgets everything that changes from one game to the next, in one go. Each item
// is listed here (tests/settings.test.js checks every key is still used by its module).
//
// Kept: settings, learned letter / digit shapes (they get better over games), and the word lists
// that don't change per game (Password, Who's on First, Word Search).
import { useSyncExternalStore } from 'react';
import { resetSharedSetting, resetSharedState } from './sharedSetting.js';
import { SERIAL_KEY } from './bombSerial.js';
import { mazeManualStore } from '../modules/maze/mazeStrip.js';
import { stripStore } from '../modules/symbols/stripStore.js';

/** Saved in localStorage (survive a reload): back to empty / the built-in default. */
export const GAME_SAVED = [
  [SERIAL_KEY, 'the serial'],
  ['bombvision_astro_map', 'Astrology sky map'],
  ['bombvision_astro_stars', 'Astrology star list'],
  ['bombvision_astro_stars_at', ''],
  ['bombvision_circuit_manual', 'Circuit colour legend'],
  ['bombvision_knob_rules', 'Knobs table'],
  ['bombvision_wireseq_rules_v4', 'Wire Sequence table'],
  ['bombvision_piano_codes', 'Piano code table'],
  ['bombvision_button_checklist', 'Button checklist + counts'],
  ['bombvision_hangman_words', 'Hangman word list'],
  ['bombvision_logic_vars', 'Logic P–T values'],
  ['bombvision_wires_manual', 'Wires manual'],
  ['bombvision_memory_manual', 'Memory manual'],
  ['bombvision_echo_pairs', 'Echo word list'],
];

/** In memory only (a reload clears them anyway). */
export const GAME_MEMORY = [
  ['simon_manual_table', 'Simon table'],
  ['batteries_table', 'Batteries table'],
  ['batteries_timer_sync', ''],
  ['wireplace_table', 'Wire Placement table'],
  ['laundry_manual', 'Laundry manual'],
  ['button-facts', ''],
];

/** What the New game button says it clears. */
export const GAME_ITEMS = [
  ...GAME_SAVED.map(([, what]) => what), ...GAME_MEMORY.map(([, what]) => what),
  'Maze manual strip', 'Symbols grids', 'every module\'s screenshots and answers',
].filter(Boolean);

// Bumped by each New game; the app remounts every module on it, which drops their screenshots,
// answers and hand edits (the state each module keeps for itself).
let epoch = 0;
const listeners = new Set();

export function startNewGame() {
  GAME_SAVED.forEach(([key]) => resetSharedSetting(key)); // first: Button's facts are re-read from its checklist
  GAME_MEMORY.forEach(([key]) => resetSharedState(key));
  mazeManualStore.clear();
  stripStore.setGrids([]);
  epoch += 1;
  listeners.forEach((l) => l());
}

/** A number that changes on every New game (use it in the modules' keys). */
export function useGameEpoch() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => epoch);
}
