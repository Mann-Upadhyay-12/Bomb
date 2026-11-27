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
// - A card whose reading is shared (<Dropzone shareReading>): only the app that took the picture reads
//   it. Its card's values (what it read, useCardState.js) go to the room in one write when it's done;
//   the teammates' apps don't read the picture: they take those values, and show the picture last, as
//   a thumbnail in the drop box (fetched from the server once the reading is in). A file goes to the
//   server only (not on the live channel); the live channel says a picture is coming, then the reading.
// - Updating: from the moment a teammate's picture reaches this app until its reading is in (shared:
//   the teammate's reading; otherwise this app's own), the card's answer shows UPDATING instead of the
//   old answer (useCardUpdating), so nobody enters a stale answer.
// - A card's CLEAR (any button marked data-card-clear) clears that card for the room: every app
//   starts that card over (useCardResets).
// - "Modules to solve" counts in all-modules mode are shared (useRoomCounts).
import { useEffect, useSyncExternalStore } from 'react';
import { roomPart, roomWrite, inRoom, TAB, myId } from './roomClient.js';
import { cardOf, stateOf, MAX_CARDS, MAX_CARD_PICS, READ_NAME } from './roomKeys.js';
import { picArrived, picFetched, picLoaded, picOwn, picRead } from './roomTiming.js';

const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_PICTURE_BYTES = 3 * 1024 * 1024;
const LOAD_WAIT_MS = 20000;
// a picture file this size or smaller also goes the fast way (as base64 it stays under the live
// channel's limit, roomClient.js FAST_MAX_CHARS): most module pictures are 20–120 KB
export const FAST_PIC_BYTES = 170 * 1024;
const UPDATING_MAX_MS = 20000; // a reading that never comes: the card shows its answer again
// shared reading: no reading from the teammate this long after their picture came (an app from before
// the update, a tab closed mid-read): this app reads the picture itself
const READ_FALLBACK_MS = 6000;
const ENTRY_ID_RE = /^[A-Za-z0-9-]{8,40}$/;
const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

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
    // shared reading: the values come from the app that read it; the picture only shows (cardPictures)
    if (z.shared) {
      z.from = entry.from;
      z.onFrom(entry.from);
      // a teammate's picture that just came: if their reading doesn't follow, read it here
      if (incoming[z.key] && incoming[z.key].id === entry.id) {
        const t = setTimeout(() => {
          if (z.alive && incoming[z.key] && incoming[z.key].id === entry.id) readHere(z, entry);
        }, READ_FALLBACK_MS);
        if (t && t.unref) t.unref();
      }
      continue;
    }
    readHere(z, entry);
  }
}

/** Loads a room picture into this card's module, as if it was pasted here (it isn't sent back). */
function readHere(z, given) {
  // one at a time, in order: a module may read its second picture differently after its first
  z.chain = z.chain.then(async () => {
    if (!z.alive) return;
    // the newest copy of the entry (the server's list gives a picture announced on the live channel its id)
    const entry = ((logs.get(z.key) || {}).pics || []).find((p) => p.id === given.id) || given;
    let src;
    try {
      if (entry.kind === 'pic') {
        const fromServer = !inline.has(entry.id), t = perf();
        const file = await pictureFile(entry);
        if (fromServer) picFetched(entry.id, perf() - t);
        src = { type: 'file', file };
      } else src = { type: 'url', url: entry.url };
    } catch (e) { console.error('Room picture failed to load', e); return; }
    if (!z.alive) return;
    z.from = entry.from;
    z.onFrom(entry.from);
    await new Promise((resolve) => {
      const t = setTimeout(resolve, LOAD_WAIT_MS);
      z.load(src, () => { clearTimeout(t); picLoaded(entry.id); resolve(); });
    });
    endIncoming(z.key, entry.id); // this app has read it: its answer is up to date
  });
}

/** A teammate's picture, the fast way: added to the card's list at once (the server's list follows). */
function appendLog(key, added, sentAt) {
  if (!added || typeof added !== 'object' || !ENTRY_ID_RE.test(String(added.id || ''))) return;
  const old = logs.get(key) || { pics: [], cleared: 0 };
  if ((old.pics || []).some((p) => p.id === added.id)) return;
  let entry;
  if (added.kind === 'link' && /^https:\/\/\S{1,2000}$/.test(String(added.url || ''))) {
    entry = { id: added.id, kind: 'link', url: added.url, zone: added.zone || 0, from: added.from, at: added.at };
  } else if (added.kind === 'pic' && PICTURE_TYPES.includes(added.type) && added.data == null) {
    // shared reading: a picture is coming (the server has it; its id comes with the server's list)
    entry = { id: added.id, kind: 'pic', type: added.type, zone: added.zone || 0, from: added.from, at: added.at };
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
  picArrived(key, entry.id, { from: entry.from, via: 'fast', sentAt });
  startIncoming(key, entry.id, entry.from);
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

// ── updating: a teammate's new picture whose reading isn't in yet ───────────────────────────────
let incoming = {};             // card key → { id, from, at }
const incomingTimers = new Map();
const incomingListeners = new Set();
const incomingChanged = () => incomingListeners.forEach((l) => l());
function startIncoming(key, id, from) {
  if (!id || (incoming[key] && incoming[key].id === id) || read.get(key) === id) return;
  incoming = { ...incoming, [key]: { id, from, at: Date.now() } };
  clearTimeout(incomingTimers.get(key));
  const t = setTimeout(() => endIncoming(key, id), UPDATING_MAX_MS);
  if (t && t.unref) t.unref();
  incomingTimers.set(key, t);
  incomingChanged();
}
function endIncoming(key, id) {
  if (!incoming[key] || (id && incoming[key].id !== id)) return;
  clearTimeout(incomingTimers.get(key));
  incomingTimers.delete(key);
  const next = { ...incoming };
  delete next[key];
  incoming = next;
  incomingChanged();
}
function clearIncoming() {
  incomingTimers.forEach(clearTimeout);
  incomingTimers.clear();
  incoming = {};
  incomingChanged();
}
// the last reading each card got (shared reading): card key → picture id
const read = new Map();
function gotReading(key, id) {
  if (!id) return;
  read.set(key, id);
  picRead(id);
  endIncoming(key, id);
}
/** In a room: { from, at } while a teammate's new picture for this card is on its way or being read
 *  (the card's answer is about to change), else null. */
export function useCardUpdating(module, card) {
  return useCardUpdatingKey(module ? cardKey(module, Number(card) || 0) : '');
}
/** The same, now (not a hook). */
export const cardUpdatingNow = (module, card) => incoming[cardKey(module, Number(card) || 0)] || null;
/** The same, by the card's key (card:<module>:<n>). */
export function useCardUpdatingKey(key) {
  return useSyncExternalStore((l) => { incomingListeners.add(l); return () => incomingListeners.delete(l); }, () => (key && incoming[key]) || null);
}

// ── the pictures a shared-reading card shows (last, as thumbnails) ──────────────────────────────
const localIds = new Set();    // the pictures this app took (it shows its own already)
const urls = new Map();        // picture id → Promise<object URL>
/** A card's pictures for one drop box → [{ id, from, at, kind, url?, pic? }] (newest last), the ones this app
 *  didn't take itself. */
const picsCache = new Map();
function cardPictures(key, zone) {
  const log = logs.get(key);
  const list = ((log && log.pics) || []).filter((p) => (p.zone || 0) === zone && !localIds.has(p.id));
  const sig = list.map((p) => `${p.id}:${p.pic || ''}`).join(',');
  const old = picsCache.get(`${key}#${zone}`);
  if (old && old.sig === sig) return old.list;
  picsCache.set(`${key}#${zone}`, { sig, list });
  return list;
}
const NONE = [];
export function useCardPictures(where) {
  return useSyncExternalStore(
    (l) => { logListeners.add(l); return () => logListeners.delete(l); },
    () => (where ? cardPictures(where.key, where.zone) : NONE),
  );
}
/** A picture of the room to show: → Promise<a URL for <img>> (a link as it is; a file from the server). */
export function pictureUrl(entry) {
  if (entry.kind === 'link') return Promise.resolve(entry.url);
  if (!entry.pic && !inline.has(entry.id)) return Promise.reject(new Error('not saved yet'));
  const id = entry.pic || entry.id;
  if (!urls.has(id)) {
    urls.set(id, pictureFile(entry).then((f) => URL.createObjectURL(f)));
    urls.get(id).catch(() => urls.delete(id));
  }
  return urls.get(id);
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
      else if (it.key.startsWith('state:')) {
        const s = stateOf(it.key);
        if (s && s.name === READ_NAME) gotReading(cardKey(s.module, s.card), String(it.value || ''));
      }
    }
  },
  onMessage(msg) {
    if (!msg.key) return;
    const mine = msg.tab === TAB;
    // a reading (shared): the card's values, and which picture they're from
    if (msg.t === 'puts' && cardOf(msg.key) && Array.isArray(msg.items)) {
      if (mine) return;
      const r = msg.items.find((it) => it && (stateOf(it.key) || {}).name === READ_NAME);
      if (r) gotReading(msg.key, String(r.value || ''));
      return;
    }
    if (msg.t === 'card' && msg.fast && cardOf(msg.key)) { if (!mine) appendLog(msg.key, msg.added, msg.at); }
    else if ((msg.t === 'card' || msg.t === 'clear') && cardOf(msg.key)) {
      // a teammate's picture that came only the server's way (too big for the fast way, or no live link there)
      if (msg.t === 'card' && !mine && msg.added && msg.added.from !== myId()) {
        picArrived(msg.key, msg.added.id, { from: msg.added.from, via: 'server' });
        startIncoming(msg.key, msg.added.id, msg.added.from);
      }
      if (msg.t === 'clear') endIncoming(msg.key);
      setLog(msg.key, msg.value, { mine });
    }
    else if (msg.t === 'put' && msg.key.startsWith('count:') && !mine) setCount(msg.key.slice(6), msg.value);
  },
  onNewGame() { logs = new Map(); counts = {}; resets = {}; inline.clear(); read.clear(); localIds.clear(); clearIncoming(); countListeners.forEach((l) => l()); logsChanged(); },
  onLeave() { logs = new Map(); counts = {}; inline.clear(); read.clear(); localIds.clear(); clearIncoming(); countListeners.forEach((l) => l()); logsChanged(); },
});

// ── a drop box on screen ────────────────────────────────────────────────────────────────────────
/**
 * Dropzone.jsx calls this when it mounts. load(src, done) loads a picture as if it was pasted, but
 * without sending it back to the room. onFrom(discordId) says whose picture the card shows.
 * shared: the card's reading is shared (only the app that took a picture reads it).
 * → { took(source, blob), readDone(), where, detach() }
 */
export function attachCardZone(el, load, onFrom = () => {}, { shared = false } = {}) {
  const where = whereIs(el);
  if (!where) return { took() {}, readDone() {}, where: null, detach() {} };
  const z = { ...where, load, onFrom, shared, taken: new Set(), chain: Promise.resolve(), alive: true, from: null, reading: null };
  zones.add(z);
  feed(z);
  return {
    where: { key: z.key, zone: z.zone },
    /** This card took a picture here: share it with the room. */
    took(source, blob) {
      if (!inRoom() || !source) return;
      const id = newId();
      z.taken.add(id);
      localIds.add(id);
      picOwn(z.key, id);
      onFrom(null);
      endIncoming(z.key); // this app's own picture is the newest now
      // shared: what this app reads from it goes to the room in one write (useCardState.js)
      if (z.shared) { z.reading = id; cardState.startReading(z.module, z.card, id); }
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
      // shared: the live channel only says a picture is coming (the reading follows); the server keeps it
      if (z.shared) { roomWrite('picture', fields, form, { t: 'card', key: z.key, added: { ...added, kind: 'pic', type: file.type } }).catch(() => {}); return; }
      if (file.size > FAST_PIC_BYTES) { roomWrite('picture', fields, form).catch(() => {}); return; }
      base64Of(file)
        .then((data) => ({ t: 'card', key: z.key, added: { ...added, kind: 'pic', type: file.type, data } }), () => null)
        .then((fast) => roomWrite('picture', fields, form, fast))
        .catch(() => {});
    },
    /** The module has read the picture it took (its onImage is done): the reading goes to the room. */
    readDone() {
      if (!z.reading) return;
      const id = z.reading;
      z.reading = null;
      cardState.endReading(z.module, z.card, id);
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
let cardState = { has: () => false, drop: () => {}, startReading: () => {}, endReading: () => {}, get: () => undefined };
export function setCardStateHooks(hooks) { cardState = hooks; }

if (typeof document !== 'undefined') {
  // capture: before the module's own click handler starts the card over
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-card-clear]');
    if (!b || !inRoom()) return;
    const where = whereIs(b);
    if (!where) return;
    const old = logs.get(where.key);
    endIncoming(where.key);
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
