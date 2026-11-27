// Rooms ("colab mode", docs/rooms-plan.md): 2–4 logged-in players share one bomb. The tables
// (supabase/bomb_rooms.sql) are closed to browsers; only this server, with the secret key, reads and
// writes them. Browsers only listen on the room's live channel (Supabase Realtime), whose name is a
// secret topic that only members get.
import { rest, supabase } from './users.js';
import { CODE_ALPHABET, CODE_LENGTH, MAX_CARD_PICS, roomKeyKept } from '../src/core/room/roomKeys.js';

export const SIZES = [2, 3, 4];
export const IDLE_MS = 6 * 3600e3;          // a room with no write or join for 6 h ends
export const KEEP_ENDED_MS = 24 * 3600e3;   // and is deleted (with its items and pictures) a day later
export const MAX_VALUE_BYTES = 128 * 1024;  // one item (a manual, a table); pictures go separately
export const MAX_PICTURE_BYTES = 3 * 1024 * 1024;
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']; // GIFs: Limbo, Simon, Morse
const LIVE_MAX_BYTES = 200 * 1024;          // Realtime's free plan takes 256 KB a message

const T = { rooms: 'bomb_rooms', members: 'bomb_room_members', items: 'bomb_room_items', pictures: 'bomb_room_pictures', users: 'bomb_users' };
const q = encodeURIComponent;
const iso = (t) => new Date(t).toISOString();

/** A refusal the API answers with: { error: code } and an HTTP status. */
export class RoomError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/**
 * A new room code. Each character must be equally likely: 256 isn't a multiple of 31, so a byte of
 * 248 or more is thrown away (rejection sampling) instead of folding it onto the first letters.
 */
export function newCode(bytes = randomBytes) {
  const n = CODE_ALPHABET.length, limit = 256 - (256 % n);
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const b of bytes(CODE_LENGTH * 2)) {
      if (b < limit && out.length < CODE_LENGTH) out += CODE_ALPHABET[b % n];
    }
  }
  return out;
}

/** The live channel's name: 128 random bits. Knowing the code isn't enough to listen. */
export const newTopic = (bytes = randomBytes) => `bomb-room-${[...bytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

/** The size a host asked for: 2, 3 or 4 (4 when not given), else null. */
export function parseSize(v) {
  if (v == null || v === '') return 4;
  const n = Number(v);
  return SIZES.includes(n) ? n : null;
}

const idle = (room, now) => now - Date.parse(room.last_active) > IDLE_MS;
const active = (m) => !m.left_at && !m.kicked;

// ── rooms and members ────────────────────────────────────────────────────────────────────────────

/** Ends rooms idle for 6 h and deletes rooms ended over a day ago (their items and pictures go too). */
export async function cleanup(now = Date.now()) {
  await rest(`${T.rooms}?ended_at=is.null&last_active=lt.${q(iso(now - IDLE_MS))}`, { method: 'PATCH', body: JSON.stringify({ ended_at: iso(now) }) });
  await rest(`${T.rooms}?ended_at=lt.${q(iso(now - KEEP_ENDED_MS))}`, { method: 'DELETE' });
}

// The clean-up runs by itself: when a room is made, and at most once an hour on any room action (per
// server). There's no scheduled job: a quiet site has nothing to clean, and the next room action
// catches up (an idle room already counts as ended when it's read).
export const CLEANUP_EVERY_MS = 3600e3;
let lastCleanup = 0;
export async function cleanupNow(now = Date.now(), { force = false } = {}) {
  if (!force && now - lastCleanup < CLEANUP_EVERY_MS) return false;
  lastCleanup = now;
  try { await cleanup(now); return true; } catch (e) { console.error('Room clean-up failed', e); return false; }
}

async function getRoom(id) {
  const rows = await rest(`${T.rooms}?id=eq.${q(id)}&select=*`);
  return rows[0] || null;
}

/** The open rooms someone is in (normally one). */
async function openRoomsOf(id, now) {
  const rows = await rest(`${T.members}?discord_id=eq.${q(id)}&left_at=is.null&kicked=is.false&select=room_id`);
  if (!rows.length) return [];
  const rooms = await rest(`${T.rooms}?id=in.(${rows.map((r) => q(r.room_id)).join(',')})&ended_at=is.null&select=*`);
  return rooms.filter((r) => !idle(r, now));
}

/** The room someone is in now, or null. */
export async function currentRoom(id, now = Date.now()) {
  const rooms = await openRoomsOf(id, now);
  return rooms.sort((a, b) => Date.parse(b.last_active) - Date.parse(a.last_active))[0] || null;
}

/** The members in a room now, longest-joined first. */
export async function listMembers(roomId) {
  const rows = await rest(`${T.members}?room_id=eq.${q(roomId)}&select=*&order=joined_at.asc`);
  return rows.filter(active).sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at));
}

/** Their Discord names and avatars, from bomb_users. */
export async function namesOf(ids) {
  if (!ids.length) return new Map();
  const rows = await rest(`${T.users}?discord_id=in.(${ids.map(q).join(',')})&select=discord_id,username,avatar`);
  return new Map(rows.map((r) => [r.discord_id, r]));
}

async function touch(room, now) {
  if (now - Date.parse(room.last_active) < 60e3) return; // at most once a minute
  await rest(`${T.rooms}?id=eq.${q(room.id)}`, { method: 'PATCH', body: JSON.stringify({ last_active: iso(now) }) });
}

/** A new room with this person as host (they leave any room they were in). Retries a taken code. */
export async function createRoom(hostId, size, now = Date.now()) {
  await cleanupNow(now, { force: true });
  for (const r of await openRoomsOf(hostId, now)) await leaveRoom(r, hostId, now);
  for (let tries = 1; ; tries++) {
    try {
      const rows = await rest(T.rooms, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ code: newCode(), topic: newTopic(), host_id: hostId, size, last_active: iso(now) }),
      });
      const room = rows[0];
      await rest(T.members, { method: 'POST', body: JSON.stringify({ room_id: room.id, discord_id: hostId, joined_at: iso(now) }) });
      return room;
    } catch (e) {
      // 409: the code is taken by another open room (the unique index) → another code
      if (!/Supabase 409/.test(e.message) || tries >= 5) throw e;
    }
  }
}

/** Joins the open room with this code. 404 unknown / ended, 403 kicked, 423 locked, 409 full. */
export async function joinRoom(code, id, now = Date.now()) {
  const rows = await rest(`${T.rooms}?code=eq.${q(code)}&ended_at=is.null&select=*`);
  const room = rows[0];
  if (!room || idle(room, now)) throw new RoomError(404, 'not-found');
  const all = await rest(`${T.members}?room_id=eq.${q(room.id)}&select=*`);
  const mine = all.find((m) => m.discord_id === id);
  if (mine && mine.kicked) throw new RoomError(403, 'kicked');
  if (mine && !mine.left_at) return { room, joined: false }; // already in (another tab, a reload)
  if (room.locked) throw new RoomError(423, 'locked');
  if (all.filter(active).length >= room.size) throw new RoomError(409, 'full');
  for (const r of await openRoomsOf(id, now)) if (r.id !== room.id) await leaveRoom(r, id, now);
  if (mine) {
    await rest(`${T.members}?room_id=eq.${q(room.id)}&discord_id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify({ left_at: null, joined_at: iso(now) }) });
  } else {
    await rest(T.members, { method: 'POST', body: JSON.stringify({ room_id: room.id, discord_id: id, joined_at: iso(now) }) });
  }
  await touch(room, now);
  return { room, joined: true };
}

/** Leaves a room. The host's role goes to the longest-joined member; the last one out ends it. */
export async function leaveRoom(room, id, now = Date.now()) {
  await rest(`${T.members}?room_id=eq.${q(room.id)}&discord_id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify({ left_at: iso(now) }) });
  const left = await listMembers(room.id);
  if (!left.length) return endRoom(room, now);
  if (room.host_id === id) {
    await rest(`${T.rooms}?id=eq.${q(room.id)}`, { method: 'PATCH', body: JSON.stringify({ host_id: left[0].discord_id }) });
  }
  return null;
}

export async function endRoom(room, now = Date.now()) {
  await rest(`${T.rooms}?id=eq.${q(room.id)}`, { method: 'PATCH', body: JSON.stringify({ ended_at: iso(now) }) });
}

/** The host's lock: nobody new can join (members who left can't come back either). */
export async function setLocked(room, locked) {
  await rest(`${T.rooms}?id=eq.${q(room.id)}`, { method: 'PATCH', body: JSON.stringify({ locked: Boolean(locked) }) });
}

/** The host's New game: the room's game number goes up, and every member clears their game data. The
 *  old game's items and pictures are never read again, so they go (the kept word lists, game 0, stay). */
export async function nextGame(room, now = Date.now()) {
  const rows = await rest(`${T.rooms}?id=eq.${q(room.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ game: room.game + 1, last_active: iso(now) }),
  });
  const next = rows[0] || { ...room, game: room.game + 1 };
  try {
    await rest(`${T.items}?room_id=eq.${q(room.id)}&game=gt.0&game=lt.${next.game}`, { method: 'DELETE' });
    await rest(`${T.pictures}?room_id=eq.${q(room.id)}&created_at=lt.${q(iso(now))}`, { method: 'DELETE' });
  } catch (e) { console.error('Clearing the old game failed', e); } // they go with the room anyway
  return next;
}

/**
 * The host removes someone. They can't join again (kicked), and the room gets a new secret topic: the
 * live channel they were listening on goes quiet. Everyone else re-reads the room (told on the old
 * topic, the last message sent there) and moves to the new one. → the room with its new topic
 */
export async function kickMember(room, id, now = Date.now()) {
  await rest(`${T.members}?room_id=eq.${q(room.id)}&discord_id=eq.${q(id)}`, {
    method: 'PATCH', body: JSON.stringify({ kicked: true, left_at: iso(now) }),
  });
  const topic = newTopic();
  const rows = await rest(`${T.rooms}?id=eq.${q(room.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ topic, last_active: iso(now) }),
  });
  return rows[0] || { ...room, topic };
}

// ── items: what the room shares ─────────────────────────────────────────────────────────────────

/** The game an item belongs to: kept word lists live in game 0, outside any one game. */
export const gameOf = (room, key) => (roomKeyKept(key) ? 0 : room.game);

/** Saves one item (last write wins). */
export async function putItem(room, key, value, from, now = Date.now()) {
  await rest(`${T.items}?on_conflict=room_id,game,key`, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ room_id: room.id, game: gameOf(room, key), key, value, from_id: from, updated_at: iso(now) }),
  });
  await touch(room, now);
}

/** Several items in one write (a card's reading: roomCards.js). items: [{ key, value }] */
export async function putItems(room, items, from, now = Date.now()) {
  if (!items.length) return;
  await rest(`${T.items}?on_conflict=room_id,game,key`, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(items.map(({ key, value }) => ({ room_id: room.id, game: gameOf(room, key), key, value, from_id: from, updated_at: iso(now) }))),
  });
  await touch(room, now);
}

async function getItem(room, key) {
  const rows = await rest(`${T.items}?room_id=eq.${q(room.id)}&game=eq.${gameOf(room, key)}&key=eq.${q(key)}&select=value`);
  return rows[0] ? rows[0].value : null;
}

/**
 * A picture a card took: added to the card's list (oldest dropped past MAX_CARD_PICS). Every app
 * replays the list in order, so a late joiner's card ends up like everyone else's. → the new value
 */
export async function addCardPic(room, key, pic, from, now = Date.now()) {
  const old = await getItem(room, key);
  const pics = [...((old && Array.isArray(old.pics)) ? old.pics : []), pic].slice(-MAX_CARD_PICS);
  const value = { pics, cleared: (old && old.cleared) || 0 };
  await putItem(room, key, value, from, now);
  return value;
}

/** A card's CLEAR: its list empties for the room; `cleared` counts up so every app resets that card.
 *  What was typed or tapped in it (state:<module>:<n>:…) goes too: the card starts over. */
export async function clearCard(room, key, from, now = Date.now()) {
  const old = await getItem(room, key);
  const value = { pics: [], cleared: ((old && old.cleared) || 0) + 1 };
  await putItem(room, key, value, from, now);
  const state = `state:${key.slice('card:'.length)}:*`; // card:<module>:<n> → state:<module>:<n>:*
  await rest(`${T.items}?room_id=eq.${q(room.id)}&game=eq.${room.game}&key=like.${q(state)}`, { method: 'DELETE' });
  return value;
}

/** A member's answer for a card (the answers board), or null to take it off. */
export async function putAnswer(room, key, answer, from, now = Date.now()) {
  if (answer == null) {
    await rest(`${T.items}?room_id=eq.${q(room.id)}&game=eq.${room.game}&key=eq.${q(key)}`, { method: 'DELETE' });
    return;
  }
  await rest(`${T.items}?on_conflict=room_id,game,key`, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ room_id: room.id, game: room.game, key, value: { a: answer }, from_id: from, updated_at: iso(now) }),
  });
}

/** Everything the room shares for its current game, plus the kept word lists. */
export async function roomItems(room) {
  return rest(`${T.items}?room_id=eq.${q(room.id)}&game=in.(0,${room.game})&select=key,value,from_id,updated_at`);
}

// ── pictures pasted as files: kept in Postgres with the room (deleted with it, on delete cascade) ──

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

export async function savePicture(room, type, bytes) {
  const rows = await rest(T.pictures, {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ room_id: room.id, mime: type, data: b64(bytes) }),
  });
  return rows[0].id;
}

/** A picture of this room → { type, bytes }, or null. */
export async function loadPicture(room, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const rows = await rest(`${T.pictures}?id=eq.${q(id)}&room_id=eq.${q(room.id)}&select=mime,data`);
  return rows[0] ? { type: rows[0].mime, bytes: Buffer.from(rows[0].data, 'base64') } : null;
}

// ── the live channel ────────────────────────────────────────────────────────────────────────────

/**
 * Sends one message to everyone listening on the room's topic (Realtime's REST broadcast, with the
 * secret key). A value too big for one message is left out: the apps fetch it from /api/room.
 * Never throws: a missed message is caught up by the next state read.
 */
export async function broadcast(topic, payload) {
  const db = supabase();
  if (!db) return false;
  let body = JSON.stringify({ messages: [{ topic, event: 'room', payload }] });
  if (body.length > LIVE_MAX_BYTES && 'value' in payload) {
    const { value, ...rest_ } = payload;
    body = JSON.stringify({ messages: [{ topic, event: 'room', payload: { ...rest_, big: true } }] });
  }
  try {
    const res = await fetch(`${db.url}/realtime/v1/api/broadcast`, {
      method: 'POST', body,
      headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('Room broadcast answered', res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error('Room broadcast failed', e);
    return false;
  }
}

/** The public half of the live connection: the project URL and its publishable (or anon) key. */
export function realtimeConfig(env = process.env) {
  const db = supabase(env);
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');
  return db && key ? { url: db.url, key } : null;
}

/** What the app gets about a room. The code only for the host: members can't pass it on. */
export async function roomView(room, me) {
  const members = await listMembers(room.id);
  const names = await namesOf(members.map((m) => m.discord_id));
  return {
    id: room.id,
    code: room.host_id === me ? room.code : null,
    topic: room.topic,
    game: room.game,
    size: room.size,
    locked: room.locked,
    host: room.host_id,
    me,
    members: members.map((m) => {
      const u = names.get(m.discord_id) || {};
      return { id: m.discord_id, name: u.username || 'Player', avatar: u.avatar || null, joinedAt: m.joined_at };
    }),
    realtime: realtimeConfig(),
  };
}

export { getRoom };
