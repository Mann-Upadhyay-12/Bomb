// Layer 4 of a room (docs/rooms-plan.md): what's typed or tapped inside a module card. Hangman's guessed
// letters, Complex Wires' switches, Battleship's shots … live in each module's own state, so a module
// opts in input by input: useState(x) → useCardState('name', x).
//
// Solo: exactly useState. In a room: the value is the room's (state:<module>:<card>:<name>), so a letter
// tapped on one phone shows on every teammate's copy of that card. A change is sent at once (typing:
// at most every 300 ms, the latest), and a teammate's change is applied without being sent back. A card's CLEAR drops
// the card's values (the card starts over everywhere); New game drops them all.
//
// Only a change made by a person is sent: one made while a tap, a click, typing or a paste is being
// handled. A change a module makes by itself (reacting to the serial …) shows in this app but isn't
// sent: every teammate's app makes the same change.
//
// A card whose reading is shared (<Dropzone shareReading>, roomCards.js): the app that took the picture
// is the only one that reads it. Everything its card changes while reading it is collected and goes to
// the room in one write, with `pictureRead` = the picture's id, when the reading is done; the
// teammates' apps never read that picture, they take these values (and show the picture last). A
// module keeps what it reads from a picture (the grid, the notes, the words) in useCardState for this.
//
// The value has to be plain data (JSON): an array, not a Set. Leave purely visual state (which panel is
// open, hover) as useState. Best for inputs only a person sets (Battleship's shots, Piano's key, the
// Diagram switch); an input a picture also sets still works, but a late joiner sees what the pictures
// gave until someone taps again.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRoomCardId } from './roomCardContext.js';
import { roomPart, roomWrite, inRoom, TAB, sendSoon } from './roomClient.js';
import { stateKey, stateNameOk, stateOf, READ_NAME, MAX_PUTS } from './roomKeys.js';
import { setCardStateHooks } from './roomCards.js';

const DEBOUNCE_MS = 300;

// ── is a person doing this? ─────────────────────────────────────────────────────────────────────
// True while a user input event is being handled (set in the capture phase, before any handler, and
// cleared once the event's task is done). A picture read after an await, or an effect reacting to the
// room, runs later and isn't a person's change.
let userTurn = false;
let userTimer = null;
if (typeof document !== 'undefined') {
  const mark = () => {
    userTurn = true;
    clearTimeout(userTimer);
    userTimer = setTimeout(() => { userTurn = false; }, 0);
  };
  for (const type of ['click', 'input', 'change', 'keydown', 'keyup', 'paste', 'drop', 'submit',
    'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'contextmenu']) {
    document.addEventListener(type, mark, true);
  }
}

let store = new Map();         // state key → { value }: the room's values this game
const pending = new Map();     // state key → { timer, value }: ours, waiting to be sent
const inflight = new Map();    // state key → sends on their way
const listeners = new Map();   // state key → Set(listener)

function notify(key) { (listeners.get(key) || new Set()).forEach((l) => l()); }
function notifyAll() { listeners.forEach((set) => set.forEach((l) => l())); }
function subscribe(key, l) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(l);
  return () => { const s = listeners.get(key); if (s) { s.delete(l); if (!s.size) listeners.delete(key); } };
}

function plain(v) {
  try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch (e) { return undefined; }
}

function queue(key, value) {
  sendSoon(pending, key, value, send, DEBOUNCE_MS);
}
async function send(key, value) {
  inflight.set(key, (inflight.get(key) || 0) + 1);
  try { await roomWrite('put', { key, value }, null, { t: 'put', key, value }); } catch (e) { /* said in the room bar */ }
  finally { inflight.set(key, inflight.get(key) - 1); }
}

// ── a reading: what a card changes while this app reads its picture (roomCards.js) ────────────────
// Two pictures can be read at once (a second paste while the first is still read): the card's values
// go when every reading on it is done, with the newest picture's id.
const reading = new Map();     // 'module:card' → { ids: Map(id → timer), latest, items: Map(key → value) }
const READING_MAX_MS = 30000;  // a reading that never says it's done is sent anyway

function startReading(module, card, id) {
  const k = `${module}:${card}`;
  const r = reading.get(k) || { ids: new Map(), latest: null, items: new Map() };
  const t = setTimeout(() => endReading(module, card, id), READING_MAX_MS);
  if (t && t.unref) t.unref();
  r.ids.set(id, t);
  r.latest = id;
  reading.set(k, r);
}

/** The reading of picture `id` is done: once no other is on, the card's values go in one write. */
function endReading(module, card, id) {
  const k = `${module}:${card}`;
  const r = reading.get(k);
  if (!r || !r.ids.has(id)) return;
  clearTimeout(r.ids.get(id));
  r.ids.delete(id);
  if (r.ids.size) return;
  reading.delete(k);
  flushReading(module, card, r);
}

function flushReading(module, card, r) {
  if (!inRoom()) return;
  const items = [...r.items].map(([key, value]) => ({ key, value }));
  // a value also waiting to go the usual way (a tap meanwhile) goes in this write
  for (const it of items) { const p = pending.get(it.key); if (p) { clearTimeout(p.timer); pending.delete(it.key); } }
  items.push({ key: stateKey(module, card, READ_NAME), value: r.latest });
  const keep = items.slice(-MAX_PUTS);
  for (const it of keep) inflight.set(it.key, (inflight.get(it.key) || 0) + 1);
  store.set(stateKey(module, card, READ_NAME), { value: r.latest });
  roomWrite('puts', { module, card, items: keep }, null, { t: 'puts', key: `card:${module}:${card}`, items: keep })
    .catch(() => {})
    .finally(() => { for (const it of keep) inflight.set(it.key, inflight.get(it.key) - 1); });
}

function applyRemote(key, value) {
  if (!stateOf(key)) return;
  if (pending.has(key) || inflight.get(key)) return; // ours is newer
  store.set(key, { value });
  notify(key);
}

/** A card was cleared: its values go (here and, through the server's CLEAR, in the room). */
export function dropCardState(module, card) {
  const prefix = `state:${module}:${card}:`;
  const r = reading.get(`${module}:${card}`);
  if (r) { r.ids.forEach(clearTimeout); reading.delete(`${module}:${card}`); }
  for (const key of [...store.keys()]) {
    if (!key.startsWith(prefix)) continue;
    store.delete(key);
    const p = pending.get(key);
    if (p) { clearTimeout(p.timer); pending.delete(key); }
    notify(key);
  }
}

function hasCardState(module, card) {
  const prefix = `state:${module}:${card}:`;
  for (const key of store.keys()) if (key.startsWith(prefix)) return true;
  return false;
}
setCardStateHooks({
  has: hasCardState, drop: dropCardState, startReading, endReading,
  get: (key) => (store.has(key) ? store.get(key).value : undefined),
});

function dropAll() {
  pending.forEach((p) => clearTimeout(p.timer));
  pending.clear();
  reading.forEach((r) => r.ids.forEach(clearTimeout));
  reading.clear();
  store = new Map();
  notifyAll();
}

roomPart({
  onItems(items, { first }) {
    if (first) store = new Map();
    for (const it of items) if (it.key.startsWith('state:')) applyRemote(it.key, it.value);
    if (first) notifyAll();
  },
  onMessage(msg) {
    if (msg.t === 'puts' && Array.isArray(msg.items)) {
      if (msg.tab === TAB) return;
      for (const it of msg.items) if (it && typeof it.key === 'string') applyRemote(it.key, it.value);
      return;
    }
    if (msg.t === 'clear' && msg.key) {
      const c = /^card:([a-z0-9]{2,20}):(\d)$/.exec(msg.key);
      if (c && msg.tab !== TAB) dropCardState(c[1], Number(c[2]));
      return;
    }
    if (msg.t !== 'put' || !msg.key || !msg.key.startsWith('state:')) return;
    if (msg.tab === TAB) return; // our own, back from the server
    applyRemote(msg.key, msg.value);
  },
  onNewGame: dropAll,
  onLeave: dropAll,
});

/**
 * useState that is the room's while in a room, for this module card + name.
 * Outside a module card (no RoomCard around it) it is plain useState.
 */
export function useCardState(name, initial) {
  const where = useRoomCardId();
  const key = where && stateNameOk(name) ? stateKey(where.module, where.card, name) : null;
  const [local, setLocal] = useState(initial);
  const room = useSyncExternalStore(
    useCallback((l) => (key ? subscribe(key, l) : () => {}), [key]),
    () => (key && inRoom() ? store.get(key) : undefined),
  );
  const value = room !== undefined ? room.value : local;

  // leaving the room keeps what the room had: the room's value becomes this app's own
  useEffect(() => { if (room !== undefined) setLocal(room.value); }, [room]);

  const current = useRef(value);
  current.current = value;
  const set = useCallback((next) => {
    const v = typeof next === 'function' ? next(current.current) : next;
    current.current = v;
    setLocal(v);
    if (key) writeCardValue(where.module, where.card, name, v);
  }, [key]);
  return [value, set];
}

/**
 * A card's value changed in this app (useCardState's setter). In a room it's the room's value now, and
 * it goes to the room: with the card's reading when one is on (all at once), else when a person made
 * the change. person: defaults to "a user input event is being handled".
 */
export function writeCardValue(module, card, name, v, person = userTurn) {
  if (!inRoom() || !stateNameOk(name)) return;
  const key = stateKey(module, card, name);
  const data = plain(v);
  if (data === undefined) return; // not plain data: stays on this device
  store.set(key, { value: data });
  notify(key);
  const r = reading.get(`${module}:${card}`);
  if (r) r.items.set(key, data); // reading a picture: goes with the reading, all at once
  else if (person) queue(key, data); // a person's change goes to the room; the module's own stays here
}

/** The room's value of a card's state (undefined when the room has none): for the tests. */
export const cardValue = (module, card, name) => (store.has(stateKey(module, card, name)) ? store.get(stateKey(module, card, name)).value : undefined);

/**
 * For a module whose reading is shared: work that changes the card for a while after a tap (a solver
 * that runs after a sticker tap). share(fn) runs fn; what the card changes until fn's result settles goes to
 * the room in one write, like a picture's reading, so the teammates get the tap and the solver's
 * answer together. Solo (or outside a card) it just runs fn. → fn's result
 */
export function useShareWork() {
  const where = useRoomCardId();
  return useCallback((fn) => {
    if (!where || !inRoom()) return fn();
    const id = `work-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    startReading(where.module, where.card, id);
    let result;
    try { result = fn(); } finally {
      Promise.resolve(result).catch(() => {}).then(() => { setTimeout(() => endReading(where.module, where.card, id), 60); });
    }
    return result;
  }, [where]);
}
