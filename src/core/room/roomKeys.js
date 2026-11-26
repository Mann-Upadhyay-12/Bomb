// What a room shares (docs/rooms-plan.md, "colab mode"). Used by the app (src/core/room/) and by the
// server (lib/rooms.js), so this file imports nothing. tests/rooms.test.js checks it still covers every
// per-game key in src/core/newGame.js.
//
// An item's key says what it is:
//   set:<key>        a saved text setting (useSharedSetting): the serial, a manual, a word list
//   mem:<key>        in-memory game state (useSharedState): the Simon table, the Laundry manual …
//   count:<module>   how many cards a module has ("modules to solve", all-modules mode)
//   card:<module>:<n> the pictures card n of a module took, oldest first (at most MAX_CARD_PICS):
//                    { pics: [{ id, kind: 'link', url } | { id, kind: 'pic', type }, …] }
//   state:<module>:<n>:<name>  what's typed or tapped inside card n (useCardState): Hangman's guessed
//                    letters, Complex Wires' switches … Any JSON; a CLEAR of the card drops them
//   ans:<module>:<n>:<member>  the answer card n shows in that member's app, for the answers board
//                    ({ a: 'CLOCK' }); only the member themself writes theirs (POST answer)
//   level            the level the room plays (the host's; see LEVEL_KEY below)
//
// The Maze manual strip and the Symbols grids have no item of their own: they come from pictures
// pasted into a Maze / Symbols card, and every app reads those pictures the same way.

/** Saved settings that change every game (the same list as GAME_SAVED in newGame.js) → what they are. */
export const ROOM_SETTINGS = {
  bombvision_serial: 'Serial',
  bombvision_astro_map: 'Astrology sky map',
  bombvision_astro_stars: 'Astrology star list',
  bombvision_astro_stars_at: '',
  bombvision_circuit_manual: 'Circuit colour legend',
  bombvision_knob_rules: 'Knobs table',
  bombvision_wireseq_rules_v4: 'Wire Sequence table',
  bombvision_piano_codes: 'Piano code table',
  bombvision_button_checklist: 'Button checklist',
  bombvision_hangman_words: 'Hangman word list',
  bombvision_logic_vars: 'Logic P–T values',
  bombvision_wires_manual: 'Wires manual',
  bombvision_memory_manual: 'Memory manual',
  bombvision_echo_pairs: 'Echo word list',
};

/** Word lists that stay the same every game: shared too, and kept by the room across New games. */
export const ROOM_KEPT = {
  bombvision_password_words: 'Password word list',
  bombvision_wof_rules_v2: "Who's on First rules",
  bombvision_search_words_v2: 'Word Search list',
};

/** In-memory game state (GAME_MEMORY in newGame.js). */
export const ROOM_MEMORY = {
  simon_manual_table: 'Simon table',
  batteries_table: 'Batteries table',
  batteries_timer_sync: '',
  wireplace_table: 'Wire Placement table',
  laundry_manual: 'Laundry manual',
  'button-facts': 'Button counts',
};

const MODULE_RE = /^[a-z0-9]{2,20}$/;
const STATE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/;
export const MAX_CARDS = 9;
export const MAX_ANSWER_CHARS = 400;
export const MAX_CARD_PICS = 6; // Symbols: up to 3 grid pictures + the keypad; Blackjack: 2 …

/** card:<module>:<n> → { module, card }, else null. */
export function cardOf(key) {
  const m = /^card:([a-z0-9]{2,20}):(\d)$/.exec(String(key || ''));
  return m && Number(m[2]) < MAX_CARDS ? { module: m[1], card: Number(m[2]) } : null;
}

/** state:<module>:<n>:<name> → { module, card, name }, else null. */
export function stateOf(key) {
  const m = /^state:([a-z0-9]{2,20}):(\d):([a-zA-Z][a-zA-Z0-9_]{0,30})$/.exec(String(key || ''));
  return m && Number(m[2]) < MAX_CARDS ? { module: m[1], card: Number(m[2]), name: m[3] } : null;
}
export const stateKey = (module, card, name) => `state:${module}:${card}:${name}`;
export const stateNameOk = (name) => STATE_NAME_RE.test(String(name || ''));

/** ans:<module>:<n>:<member> → { module, card, member }, else null. */
export function ansOf(key) {
  const m = /^ans:([a-z0-9]{2,20}):(\d):(\d{5,25})$/.exec(String(key || ''));
  return m && Number(m[2]) < MAX_CARDS ? { module: m[1], card: Number(m[2]), member: m[3] } : null;
}
export const ansKey = (module, card, member) => `ans:${module}:${card}:${member}`;

/**
 * level: the room's level, the host's pick (only the host writes it). Everyone who joins opens it, and
 * everyone follows when the host picks another. Kept across New games.
 *   { all: true }                                  ALL MODULES
 *   { id, label, modules: [names], custom }        a level from the sidebar (1.2) or GENERATE LEVEL;
 *                                                  a generated one is only on the host's device, so it
 *                                                  travels whole
 */
export const LEVEL_KEY = 'level';
export function levelOk(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (v.all === true) return true;
  const text = (s, n) => typeof s === 'string' && s.length >= 1 && s.length <= n;
  return text(v.id, 60) && text(v.label, 60) && Array.isArray(v.modules) && v.modules.length >= 1
    && v.modules.length <= 30 && v.modules.every((m) => text(m, 40));
}
/** The app's level (null = ALL MODULES, else a mission from the sidebar or GENERATE LEVEL) → the item. */
export function levelValue(mission) {
  if (!mission || !Array.isArray(mission.modules)) return { all: true };
  return { id: String(mission.id), label: String(mission.label || mission.id), modules: mission.modules.map(String), custom: Boolean(mission.custom) };
}
/** Two levels are the same when this is. '' = none. */
export const levelSig = (v) => (!v ? '' : v.all ? 'all' : `${v.id}|${(v.modules || []).join(',')}`);
/** As the top bar says it: ALL MODULES · MISSION 1.2 · LEVEL My bomb */
export const levelName = (v) => (!v ? '' : v.all ? 'ALL MODULES' : v.custom ? `LEVEL ${v.label}` : `MISSION ${v.id}`);

/** Is this an item a room may hold (through POST put)? */
export function roomKeyOk(key) {
  const k = String(key || '');
  let m;
  if (k === LEVEL_KEY) return true;
  if (k.startsWith('state:')) return Boolean(stateOf(k));
  if ((m = /^set:(.+)$/.exec(k))) return m[1] in ROOM_SETTINGS || m[1] in ROOM_KEPT;
  if ((m = /^mem:(.+)$/.exec(k))) return m[1] in ROOM_MEMORY;
  if ((m = /^count:(.+)$/.exec(k))) return MODULE_RE.test(m[1]);
  if ((m = /^card:([^:]+):(\d)$/.exec(k))) return MODULE_RE.test(m[1]) && Number(m[2]) < MAX_CARDS;
  return false;
}

/** Kept items live outside any one game (the room keeps them through New game). */
export const roomKeyKept = (key) => key === LEVEL_KEY || (/^set:/.test(key) && key.slice(4) in ROOM_KEPT);

/** What an item is, for "shared this game" (empty: not worth listing). */
export function roomKeyLabel(key) {
  const k = String(key || '');
  if (k.startsWith('set:')) return ROOM_SETTINGS[k.slice(4)] ?? ROOM_KEPT[k.slice(4)] ?? '';
  if (k.startsWith('mem:')) return ROOM_MEMORY[k.slice(4)] ?? '';
  return '';
}

/** A room code: 6 characters from an alphabet without 0/O, 1/I/L (easy to read out and type). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** What someone typed or pasted ("k7qx-2m", "K7QX 2M", an invite link, a whole invite line) → the
 *  code, or null. */
export function normCode(text) {
  const s = String(text || '').toUpperCase();
  const ok = (c) => c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
  const fromLink = /ROOM=([A-Z0-9-]{6,8})/.exec(s);
  if (fromLink) return ok(fromLink[1].replace(/-/g, '')) ? fromLink[1].replace(/-/g, '') : null;
  const whole = s.replace(/[\s-]/g, '');
  if (ok(whole)) return whole;
  // a line of text with the code in it ("Join my bomb room: K7QX2M"): the one word that is a code
  const words = s.split(/[^A-Z0-9-]+/).map((w) => w.replace(/-/g, '')).filter(ok);
  return words.length === 1 ? words[0] : null;
}

/** K7QX2M → K7QX-2M */
export const showCode = (c) => (c ? `${c.slice(0, 4)}-${c.slice(4)}` : '');
