// Layer 3 of a room (docs/rooms-plan.md): the module cards are the room's cards. A picture pasted into
// Password #2 shows up in everyone's Password #2, and each app works the answer out by itself.
//
// - Every picture a card takes goes through Dropzone.jsx, which hands it here (a link is shared as it
//   is; a file is uploaded). A card keeps a short list of its pictures, and every app replays that
//   list in order into the same card: Blackjack's two pictures, Symbols' grids + keypad, a Maze manual
//   + its dots all end up the same everywhere, also for a late joiner.
// - The fast way (roomClient.js): a link, or a picture file up to FAST_PIC_BYTES, also goes straight to
//   the teammates on the live channel, so their card loads it without waiting for the server's upload
//   and download. The server's copy of the card's list comes after; the card skips what it has.
// - A card's CLEAR (any button marked data-card-clear) clears that card for the room: every app
//   starts that card over (useCardResets).
// - "Modules to solve" counts in all-modules mode are shared (useRoomCounts).
import { useEffect, useSyncExternalStore } from 'react';
import { roomPart, roomWrite, inRoom, TAB, myId } from './roomClient.js';
import { cardOf, MAX_CARDS, MAX_CARD_PICS } from './roomKeys.js';

const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_PICTURE_BYTES = 3 * 1024 * 1024;
const LOAD_WAIT_MS = 20000;
// a picture file this size or smaller also goes the fast way (as base64 it stays under the live
// channel's limit, roomClient.js FAST_MAX_CHARS): most module pictures are 20–120 KB
export const FAST_PIC_BYTES = 135 * 1024;
const ENTRY_ID_RE = /^[A-Za-z0-9-]{8,40}$/;

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const cardKey = (module, card) => `card:${module}:${card}`;

let logs = new Map();          // card key → { pics: [...], cleared }
const zones = new Set();       // the drop boxes on screen (mounted), each with the entries it has taken
let logsVersion = 0;
const logListeners = new Set();
const logsChanged = () => { logsVersion++; logListeners.forEach((l) => l()); };

/** Where a drop box (or a CLEAR button) is: its module window's id and its card number. */
function whereIs(el) {
  const win = el && el.closest && el.closest('[data-module]');
  if (!win) return null;
  const module = win.dataset.module;
  const cardEl = el.closest('[data-card]');
  const card = Number(cardEl ? cardEl.dataset.card : 0) || 0;
  if (!/^[a-z0-9]{2,20}$/.test(module || '') || card >= MAX_CARDS) return null;
  const scope = el.closest('.mgroup-card') || win;
  const zone = Math.max(0, [...scope.querySelectorAll('.dropzone')].indexOf(el));
  return { module, card, zone, key: cardKey(module, card) };
}

// ── pictures in: the room's list → this card ────────────────────────────────────────────────────
const fetched = new Map();     // picture id → Promise<File>
const inline = new Map();      // entry id → File: a picture that came the fast way, with its bytes
function pictureFile(entry) {
  if (inline.has(entry.id)) return Promise.resolve(inline.get(entry.id));
  if (!entry.pic) return Promise.reject(new Error('picture not saved yet'));
  if (!fetched.has(entry.pic)) {
    fetched.set(entry.pic, (async () => {
      const res = await fetch(`/api/room?action=picture&id=${encodeURIComponent(entry.pic)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return new File([blob], `room.${(entry.type || 'image/png').split('/')[1]}`, { type: entry.type || blob.type });
    })());
    fetched.get(entry.pic).catch(() => fetched.delete(entry.pic));
  }
  return fetched.get(entry.pic);
}

function feed(z) {
  const log = logs.get(z.key);
  if (!log) return;
  for (const entry of log.pics || []) {
    if ((entry.zone || 0) !== z.zone || z.taken.has(entry.id)) continue;
    z.taken.add(entry.id);
    // one at a time, in order: a module may read its second picture differently after its first
    z.chain = z.chain.then(async () => {
      if (!z.alive) return;
      let src;
      try { src = entry.kind === 'pic' ? { type: 'file', file: await pictureFile(entry) } : { type: 'url', url: entry.url }; }
      catch (e) { console.error('Room picture failed to load', e); return; }
      if (!z.alive) return;
      z.from = entry.from;
      z.onFrom(entry.from);
      await new Promise((resolve) => {
        const t = setTimeout(resolve, LOAD_WAIT_MS);
        z.load(src, () => { clearTimeout(t); resolve(); });
      });
    });
  }
}

/** A teammate's picture, the fast way: added to the card's list at once (the server's list follows). */
function appendLog(key, added) {
  if (!added || typeof added !== 'object' || !ENTRY_ID_RE.test(String(added.id || ''))) return;
  const old = logs.get(key) || { pics: [], cleared: 0 };
  if ((old.pics || []).some((p) => p.id === added.id)) return;
  let entry;
  if (added.kind === 'link' && /^https:\/\/\S{1,2000}$/.test(String(added.url || ''))) {
    entry = { id: added.id, kind: 'link', url: added.url, zone: added.zone || 0, from: added.from, at: added.at };
  } else if (added.kind === 'pic' && PICTURE_TYPES.includes(added.type) && typeof added.data === 'string') {
    let file;
    try {
      const bin = atob(added.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      file = new File([bytes], `room.${added.type.split('/')[1]}`, { type: added.type });
    } catch (e) { return; }
    inline.set(added.id, file);
    if (inline.size > 40) inline.delete(inline.keys().next().value);
    entry = { id: added.id, kind: 'pic', type: added.type, zone: added.zone || 0, from: added.from, at: added.at };
  } else return;
  setLog(key, { pics: [...(old.pics || []), entry].slice(-MAX_CARD_PICS), cleared: old.cleared || 0 });
}

function setLog(key, value, { mine = false } = {}) {
  const old = logs.get(key);
  const next = value || { pics: [], cleared: 0 };
  // a state read that left before a CLEAR reached the server: don't bring the cleared pictures back
  if (old && (next.cleared || 0) < (old.cleared || 0)) return;
  logs.set(key, next);
  logsChanged();
  // someone pressed this card's CLEAR: every app starts the card over (ours already did)
  if (old && (next.cleared || 0) > (old.cleared || 0) && !mine) bumpReset(key);
  for (const z of zones) if (z.key === key) feed(z);
}

// ── card resets (a teammate's CLEAR) ────────────────────────────────────────────────────────────
let resets = {};
const resetListeners = new Set();
function bumpReset(key) {
  resets = { ...resets, [key]: (resets[key] || 0) + 1 };
  resetListeners.forEach((l) => l());
}
/** A number that changes when a teammate clears this card: key the card's module by it. */
export function useCardResets(module, card) {
  return useSyncExternalStore((l) => { resetListeners.add(l); return () => resetListeners.delete(l); }, () => resets[cardKey(module, card)] || 0);
}

// ── shared counts (all-modules mode) ────────────────────────────────────────────────────────────
let counts = {};               // module → the room's count
const countListeners = new Set();
function setCount(module, n) {
  if (!(Number.isInteger(n) && n >= 1 && n <= MAX_CARDS) || counts[module] === n) return;
  counts = { ...counts, [module]: n };
  countListeners.forEach((l) => l());
}

/** In App: the "modules to solve" counts follow the room's, and a change here goes to the room. */
export function useRoomCounts(groupCounts, setGroupCounts) {
  const room = useSyncExternalStore((l) => { countListeners.add(l); return () => countListeners.delete(l); }, () => counts);
  useEffect(() => {
    const changed = Object.entries(room).filter(([m, n]) => (groupCounts[m] || 1) !== n);
    if (changed.length) setGroupCounts((prev) => ({ ...prev, ...Object.fromEntries(changed) }));
  }, [room]);
  useEffect(() => {
    if (!inRoom()) return;
    for (const [module, n] of Object.entries(groupCounts)) {
      if ((counts[module] || 1) === n) continue;
      counts = { ...counts, [module]: n }; // ours now; the room hears it
      const key = `count:${module}`;
      roomWrite('put', { key, value: n }, null, { t: 'put', key, value: n }).catch(() => {});
    }
  }, [groupCounts]);
}

// ── the room's messages ─────────────────────────────────────────────────────────────────────────
roomPart({
  onItems(items) {
    for (const it of items) {
      if (it.key.startsWith('card:')) setLog(it.key, it.value);
      else if (it.key.startsWith('count:')) setCount(it.key.slice(6), it.value);
    }
  },
  onMessage(msg) {
    if (!msg.key) return;
    const mine = msg.tab === TAB;
    if (msg.t === 'card' && msg.fast && cardOf(msg.key)) { if (!mine) appendLog(msg.key, msg.added); }
    else if ((msg.t === 'card' || msg.t === 'clear') && cardOf(msg.key)) setLog(msg.key, msg.value, { mine });
    else if (msg.t === 'put' && msg.key.startsWith('count:') && !mine) setCount(msg.key.slice(6), msg.value);
  },
  onNewGame() { logs = new Map(); counts = {}; resets = {}; inline.clear(); countListeners.forEach((l) => l()); logsChanged(); },
  onLeave() { logs = new Map(); counts = {}; inline.clear(); countListeners.forEach((l) => l()); logsChanged(); },
});

// ── a drop box on screen ────────────────────────────────────────────────────────────────────────
/**
 * Dropzone.jsx calls this when it mounts. load(src, done) loads a picture as if it was pasted, but
 * without sending it back to the room. onFrom(discordId) says whose picture the card shows.
 * → { took(source, blob), detach() }
 */
export function attachCardZone(el, load, onFrom = () => {}) {
  const where = whereIs(el);
  if (!where) return { took() {}, detach() {} };
  const z = { ...where, load, onFrom, taken: new Set(), chain: Promise.resolve(), alive: true, from: null };
  zones.add(z);
  feed(z);
  return {
    /** This card took a picture here: share it with the room. */
    took(source, blob) {
      if (!inRoom() || !source) return;
      const id = newId();
      z.taken.add(id);
      onFrom(null);
      const fields = { module: z.module, card: z.card, zone: z.zone, id };
      const added = { id, zone: z.zone, from: myId(), at: Date.now() };
      if (source.type === 'url' && /^https:\/\//i.test(source.url || '')) {
        const fast = { t: 'card', key: z.key, added: { ...added, kind: 'link', url: source.url } };
        roomWrite('card', { ...fields, url: source.url }, null, fast).catch(() => {});
        return;
      }
      const file = blob instanceof Blob ? blob : source.file;
      if (!(file instanceof Blob)) return;
      if (!PICTURE_TYPES.includes(file.type) || file.size > MAX_PICTURE_BYTES) return; // the room keeps going without it
      const form = new FormData();
      form.set('image', file, file.name || 'picture');
      if (file.size > FAST_PIC_BYTES) { roomWrite('picture', fields, form).catch(() => {}); return; }
      base64Of(file)
        .then((data) => ({ t: 'card', key: z.key, added: { ...added, kind: 'pic', type: file.type, data } }), () => null)
        .then((fast) => roomWrite('picture', fields, form, fast))
        .catch(() => {});
    },
    detach() { z.alive = false; zones.delete(z); },
  };
}

function base64Of(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ── CLEAR: any button marked data-card-clear ────────────────────────────────────────────────────
// useCardState.js plugs in here: what was typed or tapped in a card is cleared with it
let cardState = { has: () => false, drop: () => {} };
export function setCardStateHooks(hooks) { cardState = hooks; }

if (typeof document !== 'undefined') {
  // capture: before the module's own click handler starts the card over
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-card-clear]');
    if (!b || !inRoom()) return;
    const where = whereIs(b);
    if (!where) return;
    const old = logs.get(where.key);
    const typed = cardState.has(where.module, where.card);
    cardState.drop(where.module, where.card);
    // nothing shared in this card yet: nothing to clear for the others
    if ((!old || !(old.pics || []).length) && !typed) return;
    const value = { pics: [], cleared: ((old && old.cleared) || 0) + 1 };
    logs.set(where.key, value);
    logsChanged();
    roomWrite('clear', { module: where.module, card: where.card }, null, { t: 'clear', key: where.key, value }).catch(() => {});
  }, true);
}

/** For the room bar: the cards that have pictures this game → [{ module, card, from, at, n }]. */
let cardsCache = { v: -1, list: [] };
function sharedCards() {
  if (cardsCache.v === logsVersion) return cardsCache.list;
  const list = [];
  for (const [key, v] of logs) {
    const c = cardOf(key);
    const last = v && v.pics && v.pics[v.pics.length - 1];
    if (c && last) list.push({ ...c, from: last.from, at: last.at, n: v.pics.length });
  }
  list.sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : a.card - b.card));
  cardsCache = { v: logsVersion, list };
  return list;
}
export const useSharedCards = () => useSyncExternalStore((l) => { logListeners.add(l); return () => logListeners.delete(l); }, sharedCards);
