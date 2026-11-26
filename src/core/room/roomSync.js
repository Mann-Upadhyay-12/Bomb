// Layer 1 of a room (docs/rooms-plan.md): the game data. Every manual, table and word list goes through
// sharedSetting.js, which tells this file about each change. In a room, a change is sent to the room at
// once (typing: at most every 300 ms, the latest text), and a teammate's change is applied here without
// being sent back.
import { useSyncExternalStore } from 'react';
import {
  watchSharedChanges, setSharedSetting, resetSharedSetting, setSharedState,
  peekSharedSetting, peekSharedState, sharedStateChanged,
} from '../sharedSetting.js';
import { roomPart, roomWrite, inRoom, TAB, myId, sendSoon } from './roomClient.js';
import { roomKeyOk, ROOM_SETTINGS, ROOM_KEPT, ROOM_MEMORY } from './roomKeys.js';

const DEBOUNCE_MS = 300;

let applying = false;          // applying the room's value: don't send it back (no echo loop)
const pending = new Map();     // key → { timer, value }: a local change waiting to be sent
const inflight = new Map();    // key → sends on their way
const asJson = (v) => { try { return JSON.stringify(v === undefined ? null : v); } catch (e) { return null; } };

// ── where each value came from ("FROM YUZA · 2 min ago") ────────────────────────────────────────
let from = {};                 // key → { from, at }
const fromListeners = new Set();
function noteFrom(key, who, at) {
  from = { ...from, [key]: { from: who, at: at || Date.now() } };
  fromListeners.forEach((l) => l());
}
function clearFrom() { from = {}; fromListeners.forEach((l) => l()); }
const subscribeFrom = (l) => { fromListeners.add(l); return () => fromListeners.delete(l); };
/** Every shared value's origin: { key: { from, at } } */
export const useRoomFromAll = () => useSyncExternalStore(subscribeFrom, () => from);
/** One value's origin, e.g. useRoomFrom('set:bombvision_wires_manual'), or undefined. */
export const useRoomFrom = (key) => useSyncExternalStore(subscribeFrom, () => from[key]);

// ── out: a local change → the room ──────────────────────────────────────────────────────────────
function queue(key, value) {
  sendSoon(pending, key, value, send, DEBOUNCE_MS);
}

async function send(key, value) {
  inflight.set(key, (inflight.get(key) || 0) + 1);
  try {
    const ok = await roomWrite('put', { key, value }, null, { t: 'put', key, value });
    if (ok) noteFrom(key, myId(), Date.now());
  } catch (e) { /* said in the room bar */ }
  finally { inflight.set(key, inflight.get(key) - 1); }
}

watchSharedChanges((kind, name, value) => {
  if (applying || !inRoom()) return;
  const key = `${kind}:${name}`;
  if (!roomKeyOk(key)) return;
  if (kind === 'mem') {
    const json = asJson(value);
    if (json == null) return; // not plain data
    queue(key, JSON.parse(json));
  } else queue(key, value == null ? null : String(value));
});

// ── in: the room's value → this app ─────────────────────────────────────────────────────────────
function localJson(key) {
  const name = key.slice(4);
  return key.startsWith('set:') ? asJson(peekSharedSetting(name)) : asJson(peekSharedState(name));
}

function apply(key, value, who, at) {
  if (!key.startsWith('set:') && !key.startsWith('mem:')) return;
  if (!roomKeyOk(key)) return;
  // our own change is on its way (or about to be): it's newer than this one
  if (pending.has(key) || inflight.get(key)) return;
  noteFrom(key, who, at);
  const v = value === undefined ? null : value;
  if (localJson(key) === asJson(key.startsWith('set:') && v != null ? String(v) : v)) return;
  const name = key.slice(4);
  applying = true;
  try {
    if (key.startsWith('set:')) {
      if (v == null || v === '') resetSharedSetting(name);
      else setSharedSetting(name, String(v));
    } else setSharedState(name, v);
  } finally { applying = false; }
}

roomPart({
  onItems(items) {
    for (const it of items) apply(it.key, it.value, it.from_id, Date.parse(it.updated_at) || Date.now());
  },
  onMessage(msg) {
    if (msg.t !== 'put' || !msg.key) return;
    if (msg.tab === TAB) return; // our own, back from the server
    apply(msg.key, msg.value, msg.from, msg.at);
  },
  onNewGame(run) {
    pending.forEach((p) => clearTimeout(p.timer));
    pending.clear();
    clearFrom();
    applying = true;
    try { run(); } finally { applying = false; }
  },
  onLeave() {
    pending.forEach((p) => clearTimeout(p.timer));
    pending.clear();
    clearFrom();
  },
});

/** "Share mine": sends this app's manuals, tables and lists to the room (joining doesn't, since they
 *  could be from the last game). → how many were sent */
export function shareMine() {
  if (!inRoom()) return 0;
  let n = 0;
  for (const name of Object.keys({ ...ROOM_SETTINGS, ...ROOM_KEPT })) {
    const v = peekSharedSetting(name);
    if (v != null) { queue(`set:${name}`, v); n++; }
  }
  for (const name of Object.keys(ROOM_MEMORY)) {
    if (!sharedStateChanged(name)) continue;
    const json = asJson(peekSharedState(name));
    if (json != null) { queue(`mem:${name}`, JSON.parse(json)); n++; }
  }
  return n;
}
