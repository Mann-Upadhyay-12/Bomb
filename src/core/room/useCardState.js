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
// handled. A change a module makes by itself (reading a picture, reacting to the serial) shows in this
// app but isn't sent: every teammate's app makes the same change from the same mirrored picture or
// serial, and a late joiner replaying the card's pictures must not overwrite what the others tapped.
//
// The value has to be plain data (JSON): an array, not a Set. Leave purely visual state (which panel is
// open, hover) as useState. Best for inputs only a person sets (Battleship's shots, Piano's key, the
// Diagram switch); an input a picture also sets still works, but a late joiner sees what the pictures
// gave until someone taps again.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRoomCardId } from './RoomCard.jsx';
import { roomPart, roomWrite, inRoom, TAB, sendSoon } from './roomClient.js';
import { stateKey, stateNameOk, stateOf } from './roomKeys.js';
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

function applyRemote(key, value) {
  if (!stateOf(key)) return;
  if (pending.has(key) || inflight.get(key)) return; // ours is newer
  store.set(key, { value });
  notify(key);
}

/** A card was cleared: its values go (here and, through the server's CLEAR, in the room). */
export function dropCardState(module, card) {
  const prefix = `state:${module}:${card}:`;
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
setCardStateHooks({ has: hasCardState, drop: dropCardState });

function dropAll() {
  pending.forEach((p) => clearTimeout(p.timer));
  pending.clear();
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
    if (!key || !inRoom()) return;
    const data = plain(v);
    if (data === undefined) return; // not plain data: stays on this device
    store.set(key, { value: data });
    notify(key);
    if (userTurn) queue(key, data); // a person's change goes to the room; the module's own stays here
  }, [key]);
  return [value, set];
}
