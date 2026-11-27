// /api/room?action=…: rooms ("colab mode", docs/rooms-plan.md). One file for every action: the Hobby
// plan allows 12 functions, and this keeps the site at 8.
//
// Every call: same site (POSTs), logged in, allowed (accessFor), then the action's own checks. Rooms are
// the one part of the site that needs a login (the solver is open to everyone): 401 login when not
// logged in, 403 not-allowed { state: waiting | blocked | expired } when /admin hasn't allowed them.
//   GET  state                 the room you're in: members + everything it shares this game, or { room: null }
//   GET  picture&id=…          one of your room's pictures (a card's screenshot)
//   GET  warm                  nothing (no login needed): wakes the function up before the room needs it
//   POST create   { size }     a new room (2–4, default 4); you're the host. You leave any room you were in
//   POST join     { code }     404 unknown / ended · 423 locked · 409 full · 403 kicked
//   POST leave                 the host's role passes on; the last one out ends the room
//   POST end                   host only: closes the room for everyone
//   POST lock     { locked }   host only: nobody new can join
// The writes below also take mid, the change's id: the app sends the change on the live channel itself
// as well (fast), and the copy sent from here carries the same id so each app applies it once.
//   POST put      { key, value, game, tab }   a shared item (roomKeys.js); 409 when the game moved on.
//                              key 'level' (the level the room plays) is host only
//   POST puts     { module, card, items: [{ key, value }], game, tab }   a card's reading: several of its
//                              state: values in one write (the app that read the picture sends them)
//   POST card     { module, card, url, id, game, tab }   a card took a picture from a link (shared as it is)
//   POST picture  multipart: module, card, id, game, tab, image   a card took a picture file
//   POST clear    { module, card, game, tab }   a card's CLEAR, for the room (its state: items go too)
//   POST answer   { module, card, answer, game, tab }   the answer this card shows in your app, for the
//                              answers board ('' takes it off)
//   POST kick     { id }       host only: removes a member for good; the room gets a new secret topic
//   POST new-game              host only: the room's game number goes up; every app clears its game
// Old rooms are cleaned up when a room is made and at most hourly on any action (lib/rooms.js).
// Every change is sent to the room's live channel (lib/rooms.js broadcast).
import { readSession, sessionSecret } from '../lib/session.js';
import { accessFor } from '../lib/users.js';
import { json, sameOrigin } from '../lib/web.js';
import {
  RoomError, MAX_VALUE_BYTES, MAX_PICTURE_BYTES, PICTURE_TYPES, parseSize, currentRoom, createRoom, joinRoom,
  leaveRoom, endRoom, setLocked, nextGame, putItem, putItems, addCardPic, clearCard, roomItems, savePicture, loadPicture,
  broadcast, roomView, kickMember, putAnswer, listMembers, cleanupNow,
} from '../lib/rooms.js';
import { normCode, roomKeyOk, roomKeyKept, MAX_CARDS, MAX_ANSWER_CHARS, ansKey, LEVEL_KEY, levelOk, stateOf, MAX_PUTS } from '../src/core/room/roomKeys.js';

// About 10 writes a second per person (typing in a manual box is debounced by the app already)
const BURST = 20, PER_SEC = 10;
const buckets = new Map();
function slow(id, now = Date.now()) {
  const b = buckets.get(id) || { n: BURST, at: now };
  b.n = Math.min(BURST, b.n + ((now - b.at) / 1000) * PER_SEC);
  b.at = now;
  if (b.n < 1) { buckets.set(id, b); return true; }
  b.n -= 1;
  buckets.set(id, b);
  if (buckets.size > 500) buckets.delete(buckets.keys().next().value);
  return false;
}

const MODULE_RE = /^[a-z0-9]{2,20}$/;
const cardKey = (module, card) => {
  const n = Number(card);
  return MODULE_RE.test(String(module || '')) && Number.isInteger(n) && n >= 0 && n < MAX_CARDS ? `card:${module}:${n}` : null;
};
const newId = () => crypto.randomUUID();

/** Logged in and allowed → { id, name }; else a Response to send back. */
async function who(request) {
  const secret = sessionSecret();
  if (!secret) return json({ error: 'setup' }, 503);
  const s = await readSession(request, secret);
  if (!s) return json({ error: 'login' }, 401);
  let a;
  try { a = await accessFor(s.id); }
  catch (e) { console.error('Access check failed', e); return json({ error: 'db' }, 503); }
  if (a.state !== 'allowed') return json({ error: 'not-allowed', state: a.state === 'unknown' ? 'waiting' : a.state }, 403);
  return { id: s.id, name: a.user?.username || s.name || 'Player' };
}

async function readJson(request) {
  try { return (await request.json()) || {}; } catch { return {}; }
}

async function withRoom(me, fn) {
  const room = await currentRoom(me.id);
  if (!room) return json({ error: 'no-room' }, 404);
  return fn(room);
}

const hostOnly = (room, me) => (room.host_id === me.id ? null : json({ error: 'host-only' }, 403));

export async function GET(request) {
  if (new URL(request.url).searchParams.get('action') === 'warm') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  const me = await who(request);
  if (me instanceof Response) return me;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  try {
    if (action === 'state') {
      const room = await currentRoom(me.id);
      if (!room) return json({ room: null });
      return json({ room: await roomView(room, me.id), items: await roomItems(room) });
    }
    if (action === 'picture') {
      return await withRoom(me, async (room) => {
        const pic = await loadPicture(room, url.searchParams.get('id'));
        if (!pic) return json({ error: 'not-found' }, 404);
        return new Response(pic.bytes, { headers: { 'Content-Type': pic.type, 'Cache-Control': 'private, max-age=86400, immutable' } });
      });
    }
    return json({ error: 'action' }, 400);
  } catch (e) {
    console.error('Room GET failed', action, e);
    return json({ error: 'db' }, 503);
  }
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403);
  const me = await who(request);
  if (me instanceof Response) return me;
  const action = new URL(request.url).searchParams.get('action');
  try {
    return await act(action, request, me);
  } catch (e) {
    if (e instanceof RoomError) return json({ error: e.code }, e.status);
    console.error('Room action failed', action, e);
    return json({ error: 'db' }, 503);
  }
}

async function act(action, request, me) {
  const now = Date.now();
  const tell = (room, payload) => broadcast(room.topic, { ...payload, from: me.id, at: now });

  if (action === 'create') {
    const size = parseSize((await readJson(request)).size);
    if (!size) return json({ error: 'size' }, 400);
    const room = await createRoom(me.id, size, now);
    return json({ room: await roomView(room, me.id), items: [] });
  }

  if (action === 'join') {
    const code = normCode((await readJson(request)).code);
    if (!code) return json({ error: 'code' }, 400);
    const { room, joined } = await joinRoom(code, me.id, now);
    if (joined) await tell(room, { t: 'members' });
    return json({ room: await roomView(room, me.id), items: await roomItems(room) });
  }

  if (slow(me.id, now)) return json({ error: 'slow' }, 429);
  await cleanupNow(now);

  return withRoom(me, async (room) => {
    if (action === 'leave') {
      await leaveRoom(room, me.id, now);
      await tell(room, { t: 'members' });
      return json({ ok: true });
    }
    if (action === 'end') {
      const no = hostOnly(room, me); if (no) return no;
      await endRoom(room, now);
      await tell(room, { t: 'end' });
      return json({ ok: true });
    }
    if (action === 'lock') {
      const no = hostOnly(room, me); if (no) return no;
      const { locked } = await readJson(request);
      await setLocked(room, locked);
      await tell(room, { t: 'members' });
      return json({ ok: true, locked: Boolean(locked) });
    }
    if (action === 'kick') {
      const no = hostOnly(room, me); if (no) return no;
      const id = String((await readJson(request)).id || '');
      if (!/^\d{5,25}$/.test(id) || id === me.id) return json({ error: 'member' }, 400);
      if (!(await listMembers(room.id)).some((m) => m.discord_id === id)) return json({ error: 'member' }, 404);
      const moved = await kickMember(room, id, now);
      // the last message on the old topic: the kicked member learns it, the rest re-read the room and
      // move to the new topic (which the kicked member never gets)
      await tell(room, { t: 'kick', id });
      return json({ ok: true, room: await roomView(moved, me.id) });
    }
    if (action === 'new-game') {
      const no = hostOnly(room, me); if (no) return no;
      const next = await nextGame(room, now);
      await tell(room, { t: 'new-game', game: next.game });
      return json({ ok: true, game: next.game });
    }

    // the rest belong to one game: a write from before the host's New game is refused
    const isForm = action === 'picture';
    const body = isForm ? null : await readJson(request);
    let form = null;
    if (isForm) {
      try { form = await request.formData(); } catch { return json({ error: 'form' }, 400); }
    }
    const field = (k) => (form ? (typeof form.get(k) === 'string' ? form.get(k) : '') : body[k]);
    const oldGame = (key) => !roomKeyKept(key) && Number(field('game')) !== room.game;
    // the app's tab: it skips its own changes when they come back on the live channel
    const tab = String(field('tab') || '').slice(0, 40);
    // the change's id: the app may have sent it on the live channel already (roomClient.js), and each
    // app applies one copy
    const givenMid = String(field('mid') || '');
    const mid = /^[A-Za-z0-9-]{8,40}$/.test(givenMid) ? givenMid : undefined;
    // a picture entry's id is picked by the app, so the card that took it knows it already has it
    const given = String(field('id') || '');
    const entryId = /^[A-Za-z0-9-]{8,40}$/.test(given) ? given : newId();
    const zone = Math.min(9, Math.max(0, Math.trunc(Number(field('zone'))) || 0)); // which drop box in the card

    if (action === 'put') {
      const key = String(body.key || '');
      if (!roomKeyOk(key) || key.startsWith('card:')) return json({ error: 'key' }, 400);
      if (oldGame(key)) return json({ error: 'old-game', game: room.game }, 409);
      const value = body.value === undefined ? null : body.value;
      const size = JSON.stringify(value).length;
      if (size > MAX_VALUE_BYTES) return json({ error: 'too-big' }, 413);
      if (key.startsWith('count:') && !(Number.isInteger(value) && value >= 1 && value <= MAX_CARDS)) return json({ error: 'value' }, 400);
      if (key === LEVEL_KEY) {
        const no = hostOnly(room, me); if (no) return no;
        if (!levelOk(value)) return json({ error: 'value' }, 400);
      }
      await putItem(room, key, value, me.id, now);
      await tell(room, { t: 'put', key, value, game: room.game, tab, mid });
      return json({ ok: true });
    }

    if (action === 'puts') {
      const key = cardKey(field('module'), field('card'));
      if (!key) return json({ error: 'card' }, 400);
      if (oldGame(key)) return json({ error: 'old-game', game: room.game }, 409);
      const [, module, n] = key.split(':');
      const list = Array.isArray(body.items) ? body.items : [];
      if (!list.length || list.length > MAX_PUTS) return json({ error: 'items' }, 400);
      const items = [];
      for (const it of list) {
        const s = stateOf(it && it.key);
        // only this card's state: values
        if (!s || s.module !== module || s.card !== Number(n)) return json({ error: 'key' }, 400);
        items.push({ key: it.key, value: it.value === undefined ? null : it.value });
      }
      if (JSON.stringify(items).length > MAX_VALUE_BYTES) return json({ error: 'too-big' }, 413);
      await putItems(room, items, me.id, now);
      await tell(room, { t: 'puts', key, items, game: room.game, tab, mid });
      return json({ ok: true });
    }

    if (action === 'answer') {
      const key = cardKey(field('module'), field('card'));
      if (!key) return json({ error: 'card' }, 400);
      if (oldGame(key)) return json({ error: 'old-game', game: room.game }, 409);
      const answer = String(body.answer ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER_CHARS);
      const [, module, n] = key.split(':');
      const aKey = ansKey(module, Number(n), me.id);
      await putAnswer(room, aKey, answer || null, me.id, now);
      await tell(room, { t: 'ans', key: aKey, value: answer ? { a: answer } : null, game: room.game, tab, mid });
      return json({ ok: true });
    }

    if (action === 'card' || action === 'picture' || action === 'clear') {
      const key = cardKey(field('module'), field('card'));
      if (!key) return json({ error: 'card' }, 400);
      if (oldGame(key)) return json({ error: 'old-game', game: room.game }, 409);
      let value, added = null;
      if (action === 'clear') {
        value = await clearCard(room, key, me.id, now);
      } else if (action === 'card') {
        const url = String(body.url || '');
        if (!/^https:\/\/[^\s]{1,2000}$/.test(url)) return json({ error: 'url' }, 400);
        added = { id: entryId, kind: 'link', url, zone, from: me.id, at: now };
        value = await addCardPic(room, key, added, me.id, now);
      } else {
        const f = form.get('image');
        if (!f || typeof f !== 'object' || !PICTURE_TYPES.includes(f.type)) return json({ error: 'type' }, 415);
        if (!(f.size > 0 && f.size <= MAX_PICTURE_BYTES)) return json({ error: 'too-big' }, 413);
        const pic = await savePicture(room, f.type, new Uint8Array(await f.arrayBuffer()));
        added = { id: entryId, kind: 'pic', pic, type: f.type, zone, from: me.id, at: now };
        value = await addCardPic(room, key, added, me.id, now);
      }
      await tell(room, { t: action === 'clear' ? 'clear' : 'card', key, value, added, game: room.game, tab, mid });
      return json({ ok: true, value, added });
    }

    return json({ error: 'action' }, 400);
  });
}
