// The room you're in ("colab mode", docs/rooms-plan.md): joining, leaving, the live channel and the
// room's state. What the room shares is handled by roomSync.js (manuals, lists) and roomCards.js
// (module pictures, counts, CLEAR); they plug in here with roomPart().
//
// Live updates come from Supabase Realtime, on the room's secret topic (plus presence: who's online,
// their module, their 💣 / 📖 tag). A change goes two ways at once (roomWrite):
//   - the fast way: this app sends it on the live channel itself, so teammates get it from the nearest
//     Realtime server without a trip to the site's server (Tokyo) first;
//   - the sure way: the site's server checks it, saves it (reloads, late joiners) and sends it too.
// Both copies carry the same message id (mid), and each app applies a change once. Without a live
// connection the app reads /api/room?action=state every few seconds instead.
import { useSyncExternalStore } from 'react';
import { roomKeyKept, normCode } from './roomKeys.js';
import { linkMeasured, changeArrived, resetRoomTiming } from './roomTiming.js';

/** This page load (two tabs of one person are two tabs, one member). */
export const TAB = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).slice(0, 18);

const ROLE_KEY = 'bombvision_room_role';
const POLL_MS = 4000;
// A message sent on the live channel by an app: Realtime's free plan takes 256 KB, so a bigger one only
// goes the sure way (the server tells everyone to read it from /api/room).
// 240 KB arrived in a test, 300 KB was dropped (Supabase's free plan: 256 KB a message)
export const FAST_MAX_CHARS = 236 * 1024;
const newMid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

let S = {
  gate: null,        // why rooms can't be used yet: null (not checked) · '' (they can) · guest · waiting · blocked · expired · error
  status: 'off',     // off · joining · live · polling (no live connection: reads state every few s)
  room: null,        // roomView from the server
  online: {},        // discord id → { module, role }
  error: '',         // the last thing that went wrong, said in the bar (no toasts in the bomb app)
  note: '',          // the last thing that happened ("The host ended the room")
  newGame: null,     // { game, by, at }: the last New game, for the button's "✓ NEW GAME STARTED (by …)"
  role: readRole(),
  module: '',
};
const listeners = new Set();
const set = (patch) => { S = { ...S, ...patch }; listeners.forEach((l) => l()); };

export const roomNow = () => S;
export const inRoom = () => Boolean(S.room);
export const myId = () => (S.room ? S.room.me : null);
export function useRoom() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => S);
}

/** On the website (not the offline bomb.html, not the dev server): the 👥 ROOM button shows, logged in
 *  or not. Using rooms needs a login (roomGate). */
export function roomsAvailable() {
  if (typeof window === 'undefined') return false;
  if (typeof __BOMB_ONLY__ !== 'undefined' && __BOMB_ONLY__) return false;
  return Boolean(window.__BB_SITE__ || window.__BB_ACCOUNT__);
}

/** From the page's account (scripts/lock-site.mjs): '' when rooms can be used, else why not. */
function gateOf(account) {
  if (!account) return 'guest';
  // an account without a state is from before login became optional: it was only given to allowed users
  return !account.state || account.state === 'allowed' ? '' : account.state;
}

/** The login link: Discord, then back to this very page (an invite's #…&room=CODE included). */
export function loginHref() {
  return `/api/auth/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
}

/** Asks the site again whether this browser may use rooms (after the owner allowed them, or a hiccup). */
export async function recheckAccess() {
  let me;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    me = await res.json();
  } catch (e) {
    set({ gate: 'error', error: 'Can’t reach the site — check your connection.' });
    return;
  }
  if (me.state === 'guest') window.__BB_ACCOUNT__ = null;
  else window.__BB_ACCOUNT__ = { ...(window.__BB_ACCOUNT__ || {}), name: me.name || '', admin: !!me.admin, og: !!me.og, state: me.state };
  set({ gate: gateOf(window.__BB_ACCOUNT__), error: '' });
  if (S.gate === '') bootRoom();
}

/** The invite code in the address bar (#…&room=CODE), if any. */
export function pendingInvite() {
  if (typeof location === 'undefined') return '';
  return normCode(new URLSearchParams(location.hash.replace(/^#/, '')).get('room') || '') || '';
}

/** A member's name, by Discord id. */
export function nameOf(id) {
  const m = S.room && S.room.members.find((x) => x.id === id);
  return m ? m.name : 'a teammate';
}

// ── parts: roomSync.js, roomCards.js ─────────────────────────────────────────────────────────────
// { onItems(items, { first }), onMessage(msg), onNewGame(), onLeave() }
const parts = [];
export function roomPart(p) { parts.push(p); }
const each = (fn, ...a) => parts.forEach((p) => { if (p[fn]) { try { p[fn](...a); } catch (e) { console.error('Room part failed', fn, e); } } });

// ── the server ───────────────────────────────────────────────────────────────────────────────────
const SAYS = {
  'not-found': 'No open room with that code (it may have ended).',
  full: 'That room is full.',
  locked: 'The host locked that room.',
  kicked: 'You can’t join that room.',
  code: 'A room code has 6 letters / digits, like K7QX-2M.',
  login: 'Log in again to use rooms.',
  'not-allowed': 'Your access has run out.',
  'host-only': 'Only the host can do that.',
  member: 'They’re not in the room any more.',
  'no-room': 'You’re not in a room any more.',
  setup: 'Rooms aren’t set up on the site yet.',
  db: 'The site couldn’t reach its database. Try again.',
  slow: 'Too many changes at once — wait a second.',
  'too-big': 'That’s too big to share.',
  type: 'Only PNG, JPEG, WebP or GIF pictures can be shared.',
};
export const sayError = (e) => SAYS[e && e.code] || (e && e.code === 'net' ? 'Can’t reach the site — check your connection.' : `Something went wrong (${(e && (e.code || e.message)) || '?'}).`);

/** One call to /api/room. Throws an Error with .code (the server's error, or 'net'). */
let lastCall = 0; // the last request to the server (warm(): one every few minutes keeps it awake)
export async function roomApi(action, { body, form, method = 'POST', query = '' } = {}) {
  let res;
  lastCall = Date.now();
  try {
    res = await fetch(`/api/room?action=${action}${query}`, {
      method,
      credentials: 'same-origin',
      headers: form || method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : form || JSON.stringify(body || {}),
    });
  } catch (e) {
    throw Object.assign(new Error('net'), { code: 'net' });
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* a picture, or an empty answer */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.error || `http-${res.status}`, status: res.status, data });
  return data;
}

/** A write that belongs to the room's current game (put, card, picture, clear). A 409 means the host
 *  started a new game meanwhile: catch up and drop the write.
 *  fast: the message teammates should get at once ({ t, key, value | added, … }, shaped like the
 *  server's), sent on the live channel before the server has it. Leave it out to go only the sure way. */
export async function roomWrite(action, fields, form = null, fast = null) {
  if (!S.room) return null;
  const game = S.room.game;
  const mid = newMid();
  heard(mid); // our own: if it comes back from the server, it's already applied here
  if (fast) sendFast({ ...fast, game, tab: TAB, from: S.room.me, at: Date.now(), mid, fast: 1 });
  try {
    if (form) {
      for (const [k, v] of Object.entries({ ...fields, game, tab: TAB, mid })) form.set(k, String(v));
      return await roomApi(action, { form });
    }
    return await roomApi(action, { body: { ...fields, game, tab: TAB, mid } });
  } catch (e) {
    if (e.code === 'old-game' || e.code === 'no-room') { refresh(); return null; }
    if (lockedOut(e)) return null;
    set({ error: sayError(e) });
    throw e;
  }
}

// ── joining and leaving ─────────────────────────────────────────────────────────────────────────

// created: this app just made the room (it has nothing yet; roomLevel.js gives it the host's level)
function enter(data, { first, created = false }) {
  const was = S.room;
  set({ room: data.room, error: '', note: first ? '' : S.note });
  if (!was || was.topic !== data.room.topic) connect(data.room);
  each('onItems', data.items || [], { first, created });
}

export async function createRoom(size) {
  set({ status: 'joining', error: '' });
  try {
    if (S.room) await leaveQuietly();
    enter(await roomApi('create', { body: { size } }), { first: true, created: true });
  } catch (e) { if (!lockedOut(e)) set({ status: S.room ? S.status : 'off', error: sayError(e) }); }
}

export async function joinRoom(text) {
  const code = normCode(text);
  if (!code) { set({ error: SAYS.code }); return false; }
  set({ status: 'joining', error: '' });
  try {
    enter(await roomApi('join', { body: { code } }), { first: true });
    return true;
  } catch (e) {
    if (!lockedOut(e)) set({ status: S.room ? S.status : 'off', error: sayError(e) });
    return false;
  }
}

/** Reads the room again: after a reconnect, a members change, or every few s without a live channel. */
let refreshing = null;
export function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const data = await roomApi('state', { method: 'GET' });
      if (!data.room) { if (S.room) gone('You’re no longer in the room (it ended or timed out).'); return; }
      const newer = S.room && data.room.game > S.room.game;
      if (newer) startGame(data.room.game, null);
      enter(data, { first: !S.room });
    } catch (e) {
      if (!lockedOut(e) && S.room) set({ error: sayError(e) });
    } finally { refreshing = null; }
  })();
  return refreshing;
}

async function leaveQuietly() {
  try { await roomApi('leave'); } catch (e) { /* the room may be gone already */ }
  gone('');
}
export async function leaveRoom() { await leaveQuietly(); set({ note: 'You left the room.' }); }

export async function endRoom() {
  try { await roomApi('end'); gone('You ended the room.'); } catch (e) { set({ error: sayError(e) }); }
}

/** The host removes a member for good (they can't join again). */
export async function kickMember(id) {
  try {
    const data = await roomApi('kick', { body: { id } });
    if (data.room) enter({ room: data.room, items: [] }, { first: false });
    set({ note: `${nameOf(id)} was removed from the room.` });
  } catch (e) { if (!lockedOut(e)) set({ error: sayError(e) }); }
}

export async function lockRoom(locked) {
  try { await roomApi('lock', { body: { locked } }); await refresh(); } catch (e) { set({ error: sayError(e) }); }
}

/** The server says this browser can't use rooms (logged out, blocked, out of time): out of the room,
 *  and the panel says why. True when that was it. */
function lockedOut(e) {
  if (!e || (e.code !== 'login' && e.code !== 'not-allowed')) return false;
  if (e.code === 'login') window.__BB_ACCOUNT__ = null;
  else if (window.__BB_ACCOUNT__) window.__BB_ACCOUNT__ = { ...window.__BB_ACCOUNT__, state: (e.data && e.data.state) || 'blocked' };
  if (S.room) gone('');
  set({ gate: gateOf(window.__BB_ACCOUNT__), status: 'off', error: '' });
  return true;
}

function gone(note) {
  disconnect();
  resetRoomTiming();
  presence = {};
  for (const id of Object.keys(said)) delete said[id];
  each('onLeave');
  set({ room: null, status: 'off', online: {}, note, error: '' });
}

// ── New game (host only) ────────────────────────────────────────────────────────────────────────
let startNewGameFn = null;
/** newGame.js hands its startNewGame here (no import cycle). */
export function setNewGameFn(fn) { startNewGameFn = fn; }

function startGame(game, by) {
  if (!S.room || game <= S.room.game) return;
  each('onNewGame', () => { if (startNewGameFn) startNewGameFn(); });
  set({ room: { ...S.room, game }, newGame: { game, by, at: Date.now() } });
}

/** The host's New game: the room's game number goes up and every member's app clears its game. */
export async function roomNewGame() {
  const data = await roomApi('new-game');
  startGame(data.game, S.room.me);
  return data.game;
}

/**
 * Sends a key's changes: the first at once, then at most one every `ms` (the latest), so a tap reaches
 * the room straight away and typing goes in batches. pending.has(key) stays true while more may follow
 * (a teammate's change to that key meanwhile is older than ours). send(key, value) does the write.
 */
export function sendSoon(pending, key, value, send, ms = 300) {
  const p = pending.get(key);
  if (p) { p.value = value; p.dirty = true; return; }
  const entry = { value, dirty: false, timer: null };
  pending.set(key, entry);
  const tick = () => {
    if (pending.get(key) !== entry) return;
    if (!entry.dirty) { pending.delete(key); return; }
    entry.dirty = false;
    send(key, entry.value);
    entry.timer = setTimeout(tick, ms);
  };
  send(key, value);
  entry.timer = setTimeout(tick, ms);
}

// ── the live channel ────────────────────────────────────────────────────────────────────────────
let live = null;      // { track(meta), send(payload), close() }
let pollTimer = null;
let connectSeq = 0;

// the ids of the changes this app has applied (or sent): the second copy of each is skipped
const mids = new Set();
function heard(mid) {
  mids.add(mid);
  if (mids.size > 600) mids.delete(mids.values().next().value);
}

// The timing line (roomTiming.js): a ping every 20 s while live; each teammate's app answers at once
const PING_MS = 20000;
const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let pingTimer = null;
function ping() {
  if (!live || !live.send || S.status !== 'live' || !S.room) return;
  live.send({ t: 'ping', from: S.room.me, tab: TAB, at: Date.now(), p: perf() });
}
function startPinging() {
  stopPinging();
  ping();
  pingTimer = setInterval(ping, PING_MS);
  if (pingTimer && pingTimer.unref) pingTimer.unref();
}
function stopPinging() { clearInterval(pingTimer); pingTimer = null; }

// The server sleeps after a few idle minutes, and waking it adds ~0.5 s to the next save (the fast way
// doesn't wait for it, but a join, a reload or a big picture does). While in a room with the tab open:
// a tiny request when nothing went to the server for 4 minutes.
const WARM_MS = 4 * 60e3;
function warm() {
  if (!S.room || (typeof document !== 'undefined' && document.hidden) || Date.now() - lastCall < WARM_MS) return;
  lastCall = Date.now();
  fetch('/api/room?action=warm', { method: 'GET', credentials: 'same-origin', cache: 'no-store' }).catch(() => {});
}
if (typeof setInterval !== 'undefined') { const t = setInterval(warm, 60e3); if (t && t.unref) t.unref(); }

/** The fast way: straight onto the live channel (only while it's connected; the server sends it too). */
function sendFast(payload) {
  if (!live || !live.send || S.status !== 'live') return;
  let size = 0;
  try { size = JSON.stringify(payload).length; } catch (e) { return; }
  if (size > FAST_MAX_CHARS) return;
  live.send(payload);
}

function onMessage(msg) {
  if (!msg || !S.room) return;
  // the timing line's ping (roomTiming.js): answer a teammate's, time our own
  if (msg.t === 'ping') {
    if (msg.from !== S.room.me && live && live.send) live.send({ t: 'pong', to: msg.tab, from: S.room.me, at: Date.now(), p: msg.p });
    return;
  }
  if (msg.t === 'pong') {
    if (msg.to === TAB && Number.isFinite(msg.p)) {
      const rtt = perf() - msg.p;
      linkMeasured(msg.from, rtt, msg.at - (Date.now() - rtt / 2)); // their clock − ours
    }
    return;
  }
  // the same change from the app that made it (fast) and from the server (sure): apply the first.
  // A card's copy from the server still goes through: it has the server's picture ids, and the card
  // skips a picture it has already loaded
  if (msg.mid) {
    const again = mids.has(msg.mid);
    heard(msg.mid);
    if (again && msg.t !== 'card') return;
  }
  if (msg.t === 'where') { if (msg.from !== S.room.me) heardWhere(msg); return; }
  if (msg.t === 'members') { refresh(); ping(); sayWhere(); return; }
  if (msg.t === 'kick') {
    // the host removed someone; the room moved to a new topic. Them: out. Everyone else: re-read the
    // room, which hands over the new topic (enter() reconnects)
    if (msg.id === S.room.me) gone('The host removed you from the room.');
    else refresh();
    return;
  }
  if (msg.t === 'end') { gone(msg.from === S.room.me ? 'You ended the room.' : `${nameOf(msg.from)} ended the room.`); return; }
  if (msg.t === 'new-game') { startGame(msg.game, msg.from); return; }
  if (msg.game != null && msg.game !== S.room.game && !roomKeyKept(msg.key || '')) {
    if (msg.game > S.room.game) refresh(); // a New game we missed
    return;
  }
  if (msg.big) { refresh(); return; } // too big for one live message: read it from the server
  if (msg.fast && msg.from !== S.room.me && msg.t !== 'card') changeArrived(msg.from, msg.at, msg.key);
  each('onMessage', msg);
}

// Who is online comes from presence. Which module each one has open (and their tag) also comes as a
// live message the moment it changes ('where'): presence takes at most 5 updates per 30 s, so it lags
// up to 6 s. The newer of the two wins.
let presence = {};   // discord id → { module, role, at } from presence
const said = {};     // discord id → { module, role, at } from their 'where' messages
function showOnline() {
  const out = {};
  for (const [id, p] of Object.entries(presence)) {
    const w = said[id];
    const pick = w && w.at >= (p.at || 0) ? w : p;
    out[id] = { module: pick.module || '', role: pick.role || '' };
  }
  set({ online: out });
}
function online(state) {
  // presence: key = a tab; several tabs of one person show as one member
  const out = {};
  for (const metas of Object.values(state || {})) {
    for (const m of metas) if (m && m.id) out[m.id] = { module: m.module || '', role: m.role || '', at: Number(m.at) || 0 };
  }
  presence = out;
  showOnline();
}
function heardWhere(msg) {
  if (!S.room.members.some((m) => m.id === msg.from) || !Number.isFinite(msg.at)) return;
  const old = said[msg.from];
  if (old && old.at > msg.at) return;
  said[msg.from] = { module: String(msg.module || '').slice(0, 20), role: String(msg.role || '').slice(0, 20), at: msg.at };
  if (presence[msg.from]) showOnline();
}
function sayWhere() {
  if (live && live.send && S.status === 'live' && S.room) live.send({ t: 'where', from: S.room.me, tab: TAB, module: S.module, role: S.role, at: Date.now() });
}

let trackTimer = null, lastTrack = 0;
function track() {
  sayWhere(); // at once, to everyone listening
  // presence allows few updates (5 per 30 s): send at most one every 6 s, the latest one
  clearTimeout(trackTimer);
  const wait = Math.max(0, lastTrack + 6000 - Date.now());
  trackTimer = setTimeout(() => {
    lastTrack = Date.now();
    if (live && S.room) live.track({ id: S.room.me, module: S.module, role: S.role, at: Date.now() });
  }, wait);
}

/** Supabase Realtime (@supabase/realtime-js, the live part of supabase-js), loaded only once someone is
 *  in a room. A test page can set window.__BB_ROOM_TRANSPORT__ (same shape) to stand in for it. */
async function realtimeTransport() {
  if (typeof window !== 'undefined' && window.__BB_ROOM_TRANSPORT__) return window.__BB_ROOM_TRANSPORT__;
  const { RealtimeClient } = await import('@supabase/realtime-js');
  return {
    connect({ url, key, topic, presenceKey, onMessage: got, onPresence, onStatus }) {
      // as supabase-js sets it up: wss://<project>.supabase.co/realtime/v1, the public key as apikey and token
      const ws = new URL('realtime/v1', url.replace(/\/*$/, '/'));
      ws.protocol = ws.protocol.replace('http', 'ws');
      const client = new RealtimeClient(ws.href, { params: { apikey: key }, accessToken: async () => key });
      const ch = client.channel(topic, { config: { presence: { key: presenceKey } } });
      ch.on('broadcast', { event: 'room' }, ({ payload }) => got(payload));
      ch.on('presence', { event: 'sync' }, () => onPresence(ch.presenceState()));
      ch.subscribe((status) => onStatus(status));
      return {
        track: (meta) => { Promise.resolve(ch.track(meta)).catch(() => {}); },
        send: (payload) => { Promise.resolve(ch.send({ type: 'broadcast', event: 'room', payload })).catch(() => {}); },
        close: () => { Promise.resolve(client.removeChannel(ch)).catch(() => {}).finally(() => Promise.resolve(client.disconnect()).catch(() => {})); },
      };
    },
  };
}

async function connect(room) {
  disconnect();
  const seq = ++connectSeq;
  startPolling(); // until the live channel says it's subscribed
  if (!room.realtime) return;
  let transport;
  try { transport = await realtimeTransport(); } catch (e) { console.error('Realtime failed to load', e); return; }
  if (seq !== connectSeq) return;
  let down = false;
  live = transport.connect({
    url: room.realtime.url, key: room.realtime.key, topic: room.topic, presenceKey: TAB,
    onMessage, onPresence: online,
    onStatus: (status) => {
      if (seq !== connectSeq) return;
      if (status === 'SUBSCRIBED') {
        stopPolling();
        startPinging();
        set({ status: 'live' });
        lastTrack = 0; track();
        if (down) refresh(); // messages sent while we were away are gone: read the room again
        down = false;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        down = true;
        stopPinging();
        startPolling();
      }
    },
  });
}

function disconnect() {
  stopPinging();
  connectSeq++;
  stopPolling();
  if (live) { live.close(); live = null; }
}

function startPolling() {
  if (S.room && S.status !== 'polling') set({ status: 'polling' });
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    refresh();
  }, POLL_MS);
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

// ── presence: the module you have open and your 💣 / 📖 tag ─────────────────────────────────────
function readRole() {
  try { return localStorage.getItem(ROLE_KEY) || ''; } catch (e) { return ''; }
}
export function setRole(role) {
  try { localStorage.setItem(ROLE_KEY, role); } catch (e) { /* kept for this visit only */ }
  set({ role });
  track();
}
export function setOpenModule(module) {
  if (module === S.module) return;
  set({ module });
  if (S.room) track();
}

// ── start-up ────────────────────────────────────────────────────────────────────────────────────
let booted = false;
/** Once, when the app starts: an invite link (#…&room=CODE) joins; else carry on in the room you were in.
 *  Not logged in (or not allowed): nothing happens, and an invite stays in the address bar, so logging in
 *  from the room panel comes back to it and joins. */
export async function bootRoom() {
  if (booted || !roomsAvailable()) return;
  if (S.gate == null) set({ gate: gateOf(window.__BB_ACCOUNT__) });
  if (S.gate !== '') return;
  booted = true;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = hash.get('room');
  if (code) {
    // the code leaves the address bar, so a member can't pass the room on by accident
    hash.delete('room');
    const rest = hash.toString();
    history.replaceState(null, '', location.pathname + location.search + (rest ? `#${rest}` : ''));
    if (await joinRoom(code)) return;
  }
  await refresh();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { if (S.room) refresh(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.room) refresh(); });
  }
}

/** The host's invite line, ready for Discord. */
export function inviteLine(room) {
  const url = `${location.origin}/#play=bomb&room=${room.code}`;
  return `Join my bomb room: ${room.code} → ${url}`;
}
