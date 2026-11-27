// Rooms ("colab mode", docs/rooms-plan.md): lib/rooms.js and api/room.js against a fake Supabase
// (tests/helpers/fakeSupabase.js). No network.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SESSION_COOKIE, newSession, signToken } from '../lib/session.js';
import { newCode, newTopic, parseSize, cleanup, IDLE_MS, KEEP_ENDED_MS, broadcast } from '../lib/rooms.js';
import { CODE_ALPHABET, normCode, showCode, roomKeyOk, roomKeyKept, cardOf, ROOM_SETTINGS, ROOM_MEMORY, ROOM_KEPT, levelOk, levelValue, levelSig, levelName } from '../src/core/room/roomKeys.js';
import { fakeSupabase } from './helpers/fakeSupabase.js';
import * as api from '../api/room.js';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const SITE = 'https://bomb.example';
const P = { host: '200000000000000001', b: '200000000000000002', c: '200000000000000003', d: '200000000000000004', e: '200000000000000005', blocked: '200000000000000006' };
// players of their own for the later tests (each player has a write rate limit that lasts across tests)
const Q = { host: '200000000000000011', b: '200000000000000012', h2: '200000000000000013', b2: '200000000000000014' };

let sb;
beforeEach(() => {
  Object.assign(process.env, {
    SESSION_SECRET: SECRET, SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'service-key',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  });
  delete process.env.ADMIN_IDS;
  delete process.env.OG_IDS;
  sb = fakeSupabase({ url: 'https://db.example', key: 'service-key' });
  globalThis.fetch = sb.fetch;
  // every player is a different allowed user (accessFor keeps answers for a while: fresh ids per test)
  for (const id of [...Object.values(P), ...Object.values(Q)]) sb.tables.bomb_users.push({ discord_id: id, username: `Player${id.slice(-1)}`, avatar: null, status: 'allowed', expires_at: null });
});

const cookieFor = async (id) => `${SESSION_COOKIE}=${await signToken(newSession({ id, name: 'x' }), SECRET)}`;
async function call(who, action, body, { method = 'POST', origin = SITE, query = '' } = {}) {
  const headers = { cookie: await cookieFor(who) };
  if (origin) headers.origin = origin;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  const req = new Request(`${SITE}/api/room?action=${action}${query}`, { method, headers, body: method === 'GET' ? undefined : payload });
  const res = await (method === 'GET' ? api.GET(req) : api.POST(req));
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()), type };
}
const state = (who) => call(who, 'state', undefined, { method: 'GET' });
const lastBroadcast = () => sb.broadcasts[sb.broadcasts.length - 1];

// ── codes and keys ──────────────────────────────────────────────────────────────────────────────

test('room codes: 6 characters from the easy-to-read alphabet, every character equally likely', () => {
  for (let i = 0; i < 200; i++) {
    const c = newCode();
    assert.equal(c.length, 6);
    assert.ok([...c].every((ch) => CODE_ALPHABET.includes(ch)), c);
  }
  assert.ok(!/[01ILO]/.test(CODE_ALPHABET));
  // bytes 248–255 are thrown away (256 isn't a multiple of 31): they'd make A–H more likely
  let calls = 0;
  const bytes = (n) => { calls++; return new Uint8Array(n).fill(calls === 1 ? 250 : 31); };
  assert.equal(newCode(bytes), 'AAAAAA'); // 31 % 31 = 0 → 'A'; the first batch (all 250) was refused
  assert.equal(calls, 2);
  assert.match(newTopic(), /^bomb-room-[0-9a-f]{32}$/);
});

test('a typed or pasted code is read with or without the dash, any case, or from an invite line', () => {
  assert.equal(normCode('k7qx-2m'), 'K7QX2M');
  assert.equal(normCode(' K7QX 2M '), 'K7QX2M');
  assert.equal(normCode('Join my bomb room: K7QX2M → https://x/#play=bomb&room=K7QX2M'), 'K7QX2M');
  assert.equal(normCode('join my bomb room: K7QX-2M → '), 'K7QX2M');
  assert.equal(normCode('room: K7QX2M or ABCDEF'), null, 'two codes: not a guess');
  assert.equal(normCode('K7QX2'), null);
  assert.equal(normCode('K7QX2O'), null); // O isn't in the alphabet
  assert.equal(showCode('K7QX2M'), 'K7QX-2M');
});

test('size: 2, 3 or 4, and 4 when not given', () => {
  assert.equal(parseSize(undefined), 4);
  assert.equal(parseSize('2'), 2);
  assert.equal(parseSize(3), 3);
  assert.equal(parseSize(5), null);
  assert.equal(parseSize(1), null);
});

test('the room shares every per-game key New game clears, and nothing that is the device\'s own', () => {
  const src = readFileSync(new URL('../src/core/newGame.js', import.meta.url), 'utf8');
  const listed = (name) => [...src.split(`export const ${name}`)[1].split('];')[0].matchAll(/\['([^']+)'/g)].map((m) => m[1]);
  for (const k of listed('GAME_SAVED')) assert.ok(k in ROOM_SETTINGS, `${k} (GAME_SAVED) is not shared`);
  assert.ok('bombvision_serial' in ROOM_SETTINGS); // GAME_SAVED names it SERIAL_KEY
  for (const k of listed('GAME_MEMORY')) assert.ok(k in ROOM_MEMORY, `${k} (GAME_MEMORY) is not shared`);
  assert.ok(roomKeyOk('set:bombvision_password_words') && roomKeyKept('set:bombvision_password_words'));
  assert.ok(roomKeyOk('mem:laundry_manual') && !roomKeyKept('mem:laundry_manual'));
  assert.ok(roomKeyOk('count:password') && roomKeyOk('card:password:2'));
  assert.deepEqual(cardOf('card:password:2'), { module: 'password', card: 2 });
  for (const k of ['set:bombvision_theme', 'set:bombvision_blackjack_shapes', 'mem:whatever', 'card:password:9', 'card:Pass word:1', 'levels', 'x'])
    assert.ok(!roomKeyOk(k), k);
  assert.equal(Object.keys(ROOM_KEPT).length, 3);
});

// ── create / join / leave ───────────────────────────────────────────────────────────────────────

test('create: the host gets the code and topic; a member gets the topic but not the code', async () => {
  const made = await call(P.host, 'create', { size: 3 });
  assert.equal(made.status, 200);
  const room = made.body.room;
  assert.match(room.code, /^[A-Z2-9]{6}$/);
  assert.match(room.topic, /^bomb-room-/);
  assert.equal(room.size, 3);
  assert.equal(room.host, P.host);
  assert.deepEqual(room.realtime, { url: 'https://db.example', key: 'sb_publishable_test' });
  assert.deepEqual(room.members.map((m) => m.id), [P.host]);

  const joined = await call(P.b, 'join', { code: showCode(room.code).toLowerCase() });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.room.code, null, 'members never see the code');
  assert.equal(joined.body.room.topic, room.topic);
  assert.deepEqual(joined.body.room.members.map((m) => m.name), ['Player1', 'Player2']);
  assert.deepEqual(lastBroadcast(), { topic: room.topic, event: 'room', payload: { t: 'members', from: P.b, at: lastBroadcast().payload.at } });

  assert.equal((await state(P.host)).body.room.code, room.code);
  assert.equal((await state(P.b)).body.room.code, null);
  assert.equal((await state(P.c)).body.room, null);
});

test('create refuses a size outside 2–4, and only logged-in, allowed, same-site callers get in', async () => {
  assert.equal((await call(P.host, 'create', { size: 5 })).status, 400);
  assert.equal((await call(P.host, 'create', { size: 2 }, { origin: 'https://evil.example' })).status, 403);
  const anon = await api.POST(new Request(`${SITE}/api/room?action=create`, { method: 'POST', headers: { origin: SITE }, body: '{}' }));
  assert.equal(anon.status, 401);
  sb.tables.bomb_users.find((u) => u.discord_id === P.blocked).status = 'blocked';
  assert.equal((await call(P.blocked, 'create', {})).status, 403);
});

test('join: unknown, ended, locked, full and kicked are refused with their own answers', async () => {
  assert.equal((await call(P.b, 'join', { code: 'ABCDEF' })).status, 404);
  assert.equal((await call(P.b, 'join', { code: 'nope' })).status, 400);

  const { room } = (await call(P.host, 'create', { size: 2 })).body;
  assert.equal((await call(P.b, 'join', { code: room.code })).status, 200);
  const full = await call(P.c, 'join', { code: room.code });
  assert.deepEqual([full.status, full.body.error], [409, 'full']);
  // the same person again (another tab, a reload) is not a new member
  assert.equal((await call(P.b, 'join', { code: room.code })).status, 200);
  assert.equal(sb.tables.bomb_room_members.length, 2);

  const r2 = (await call(P.c, 'create', { size: 4 })).body.room;
  assert.equal((await call(P.d, 'lock', { locked: true })).status, 404, 'not in a room');
  assert.equal((await call(P.c, 'lock', { locked: true })).status, 200);
  assert.deepEqual((await call(P.d, 'join', { code: r2.code })).body, { error: 'locked' });
  await call(P.c, 'lock', { locked: false });
  sb.tables.bomb_room_members.push({ room_id: r2.id, discord_id: P.e, joined_at: new Date().toISOString(), left_at: null, kicked: true });
  assert.deepEqual((await call(P.e, 'join', { code: r2.code })).body, { error: 'kicked' });

  assert.equal((await call(P.c, 'end')).status, 200);
  assert.deepEqual(lastBroadcast().payload.t, 'end');
  assert.deepEqual((await call(P.d, 'join', { code: r2.code })).body, { error: 'not-found' });
});

test('one room at a time: joining another room leaves the first; the host role passes on; the last one out ends it', async () => {
  const r1 = (await call(P.host, 'create', {})).body.room;
  await call(P.b, 'join', { code: r1.code });
  await call(P.c, 'join', { code: r1.code });
  const r2 = (await call(P.d, 'create', {})).body.room;
  await call(P.c, 'join', { code: r2.code });
  assert.equal((await state(P.c)).body.room.id, r2.id);
  assert.deepEqual((await state(P.b)).body.room.members.map((m) => m.id), [P.host, P.b]);

  assert.equal((await call(P.host, 'leave')).status, 200);
  const after = (await state(P.b)).body.room;
  assert.equal(after.host, P.b, 'the longest-joined member is the host now');
  assert.equal(after.code, r1.code, 'and sees the code');
  await call(P.b, 'leave');
  assert.ok(sb.tables.bomb_rooms.find((r) => r.id === r1.id).ended_at, 'the last one out ends the room');
  assert.equal((await call(P.e, 'join', { code: r1.code })).status, 404);
});

test('a taken code (another open room has it) is tried again with a new one', async () => {
  const first = (await call(P.host, 'create', {})).body.room;
  // the next codes the server picks: the taken one, then a free one
  const real = crypto.getRandomValues.bind(crypto);
  let n = 0;
  crypto.getRandomValues = (arr) => {
    if (arr.length === 12 && n < 2) {
      const want = n++ === 0 ? first.code : 'ZZZZZZ';
      [...want].forEach((ch, i) => { arr[i] = CODE_ALPHABET.indexOf(ch); });
      for (let i = 6; i < 12; i++) arr[i] = 0;
      return arr;
    }
    return real(arr);
  };
  try {
    const second = (await call(P.b, 'create', {})).body.room;
    assert.equal(second.code, 'ZZZZZZ');
  } finally { crypto.getRandomValues = real; }
});

// ── what the room shares ───────────────────────────────────────────────────────────────────────

test('put: shared keys only, a size limit, and a write from before New game is refused', async () => {
  const { room } = (await call(P.host, 'create', {})).body;
  await call(P.b, 'join', { code: room.code });

  const ok = await call(P.b, 'put', { key: 'set:bombvision_serial', value: 'AB3CD7', game: 1 });
  assert.equal(ok.status, 200);
  assert.deepEqual(lastBroadcast().payload, { t: 'put', key: 'set:bombvision_serial', value: 'AB3CD7', game: 1, tab: '', from: P.b, at: lastBroadcast().payload.at });
  assert.equal(lastBroadcast().topic, room.topic);

  assert.equal((await call(P.b, 'put', { key: 'set:bombvision_theme', value: 'x', game: 1 })).status, 400);
  assert.equal((await call(P.b, 'put', { key: 'card:password:0', value: {}, game: 1 })).status, 400, 'cards go through card / picture');
  assert.equal((await call(P.b, 'put', { key: 'mem:laundry_manual', value: 'x'.repeat(140 * 1024), game: 1 })).status, 413);
  assert.equal((await call(P.b, 'put', { key: 'count:password', value: 12, game: 1 })).status, 400);
  assert.equal((await call(P.b, 'put', { key: 'count:password', value: 3, game: 1 })).status, 200);
  assert.equal((await call(P.c, 'put', { key: 'set:bombvision_serial', value: 'X', game: 1 })).status, 404, 'not a member');

  const items = (await state(P.host)).body.items;
  assert.deepEqual(items.map((i) => [i.key, i.value, i.from_id]).sort(), [['count:password', 3, P.b], ['set:bombvision_serial', 'AB3CD7', P.b]]);
});

test('New game: host only; the old game\'s items are gone from state, kept word lists stay', async () => {
  const { room } = (await call(P.host, 'create', {})).body;
  await call(P.b, 'join', { code: room.code });
  await call(P.b, 'put', { key: 'set:bombvision_serial', value: 'AB3CD7', game: 1 });
  await call(P.b, 'put', { key: 'set:bombvision_password_words', value: 'ABOUT AFTER', game: 1 });

  const no = await call(P.b, 'new-game');
  assert.deepEqual([no.status, no.body.error], [403, 'host-only']);
  const yes = await call(P.host, 'new-game');
  assert.deepEqual(yes.body, { ok: true, game: 2 });
  assert.equal(lastBroadcast().payload.t, 'new-game');
  assert.equal(lastBroadcast().payload.game, 2);

  const s = (await state(P.b)).body;
  assert.equal(s.room.game, 2);
  assert.deepEqual(s.items.map((i) => i.key), ['set:bombvision_password_words']);
  // a paste that left before the New game reached this member: refused, and told the new game
  const late = await call(P.b, 'put', { key: 'set:bombvision_serial', value: 'OLD', game: 1 });
  assert.deepEqual([late.status, late.body], [409, { error: 'old-game', game: 2 }]);
  // kept lists don't belong to a game
  assert.equal((await call(P.b, 'put', { key: 'set:bombvision_password_words', value: 'ABOUT', game: 1 })).status, 200);
});

test('cards: links and files are added to the card\'s list, CLEAR empties it, pictures stay in the room', async () => {
  const { room } = (await call(P.host, 'create', {})).body;
  await call(P.b, 'join', { code: room.code });

  const link = await call(P.host, 'card', { module: 'password', card: 1, url: 'https://cdn.discordapp.com/attachments/1/2/p.png?ex=1', id: 'entry-0001', game: 1, tab: 'tab-a' });
  assert.equal(link.status, 200);
  assert.equal(link.body.added.kind, 'link');
  assert.equal(link.body.added.id, 'entry-0001', 'the app picks the entry id');
  assert.equal(lastBroadcast().payload.tab, 'tab-a');
  assert.equal(lastBroadcast().payload.t, 'card');
  assert.equal(lastBroadcast().payload.key, 'card:password:1');
  assert.equal((await call(P.host, 'card', { module: 'password', card: 1, url: 'javascript:alert(1)', game: 1 })).status, 400);
  assert.equal((await call(P.host, 'card', { module: 'password', card: 9, url: 'https://x.example/a.png', game: 1 })).status, 400);

  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const form = new FormData();
  form.set('module', 'password'); form.set('card', '1'); form.set('game', '1');
  form.set('image', new Blob([png], { type: 'image/png' }), 'p.png');
  const up = await call(P.b, 'picture', form);
  assert.equal(up.status, 200);
  assert.equal(up.body.value.pics.length, 2);
  assert.deepEqual(up.body.value.pics.map((p) => p.kind), ['link', 'pic']);

  const got = await call(P.host, 'picture', undefined, { method: 'GET', query: `&id=${up.body.added.pic}` });
  assert.equal(got.status, 200);
  assert.equal(got.type, 'image/png');
  assert.deepEqual([...got.body], [...png]);
  assert.equal((await call(P.c, 'picture', undefined, { method: 'GET', query: `&id=${up.body.added.pic}` })).status, 404, 'not a member');

  const bad = new FormData();
  bad.set('module', 'password'); bad.set('card', '1'); bad.set('game', '1');
  bad.set('image', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'x.svg');
  assert.equal((await call(P.b, 'picture', bad)).status, 415);

  // at most 6 pictures per card: the oldest go
  for (let i = 0; i < 6; i++) await call(P.host, 'card', { module: 'password', card: 1, url: `https://x.example/${i}.png`, game: 1 });
  let item = (await state(P.b)).body.items.find((i) => i.key === 'card:password:1');
  assert.deepEqual(item.value.pics.map((p) => p.url), [0, 1, 2, 3, 4, 5].map((i) => `https://x.example/${i}.png`));

  const cleared = await call(P.b, 'clear', { module: 'password', card: 1, game: 1 });
  assert.deepEqual(cleared.body.value, { pics: [], cleared: 1 });
  assert.equal(lastBroadcast().payload.t, 'clear');
  item = (await state(P.host)).body.items.find((i) => i.key === 'card:password:1');
  assert.deepEqual(item.value, { pics: [], cleared: 1 });
});

test('clean-up ends rooms idle for 6 h and deletes rooms ended a day ago with everything in them', async () => {
  const t0 = Date.now();
  const iso = (t) => new Date(t).toISOString();
  sb.tables.bomb_rooms.push(
    { id: 'r-idle', code: 'AAAAAA', topic: 't1', host_id: P.host, size: 4, game: 1, locked: false, last_active: iso(t0 - IDLE_MS - 1000), ended_at: null },
    { id: 'r-old', code: 'BBBBBB', topic: 't2', host_id: P.b, size: 4, game: 1, locked: false, last_active: iso(t0 - 3 * 864e5), ended_at: iso(t0 - KEEP_ENDED_MS - 1000) },
    { id: 'r-live', code: 'CCCCCC', topic: 't3', host_id: P.c, size: 4, game: 1, locked: false, last_active: iso(t0), ended_at: null },
  );
  sb.tables.bomb_room_items.push({ room_id: 'r-old', game: 1, key: 'set:bombvision_serial', value: 'X', from_id: P.b });
  sb.tables.bomb_room_pictures.push({ id: 'p1', room_id: 'r-old', mime: 'image/png', data: 'AA==' });
  sb.tables.bomb_room_members.push({ room_id: 'r-idle', discord_id: P.host, joined_at: iso(t0 - IDLE_MS - 1000), left_at: null, kicked: false });

  assert.equal((await state(P.host)).body.room, null, 'an idle room is not your room any more');
  await cleanup(t0);
  assert.ok(sb.tables.bomb_rooms.find((r) => r.id === 'r-idle').ended_at);
  assert.ok(!sb.tables.bomb_rooms.find((r) => r.id === 'r-old'));
  assert.equal(sb.tables.bomb_room_items.length, 0);
  assert.equal(sb.tables.bomb_room_pictures.length, 0);
  assert.ok(!sb.tables.bomb_rooms.find((r) => r.id === 'r-live').ended_at);
});

test('broadcast: the secret key, one message to the room\'s topic; a big value is left for /state', async () => {
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url: String(url), init }; return new Response(null, { status: 202 }); };
  assert.equal(await broadcast('bomb-room-x', { t: 'put', key: 'k', value: 'v' }), true);
  assert.equal(seen.url, 'https://db.example/realtime/v1/api/broadcast');
  assert.equal(seen.init.headers.apikey, 'service-key');
  assert.deepEqual(JSON.parse(seen.init.body), { messages: [{ topic: 'bomb-room-x', event: 'room', payload: { t: 'put', key: 'k', value: 'v' } }] });
  await broadcast('bomb-room-x', { t: 'put', key: 'k', value: 'x'.repeat(300 * 1024) });
  assert.deepEqual(JSON.parse(seen.init.body).messages[0].payload, { t: 'put', key: 'k', big: true });
  // Realtime down: the write still counts (members catch up from /state)
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  const err = console.error; console.error = () => {};
  try { assert.equal(await broadcast('bomb-room-x', { t: 'members' }), false); } finally { console.error = err; }
});

// ── phase 4–6 (2026-11-26): login gate, kick, answers board, card state ─────────────────────────

test('rooms are the part that needs a login: a guest gets 401 login, a waiting account 403 with its state', async () => {
  const anon = await api.GET(new Request(`${SITE}/api/room?action=state`));
  assert.equal(anon.status, 401);
  assert.deepEqual(await anon.json(), { error: 'login' });
  const late = '200000000000000007'; // a new id: accessFor remembers answers for a few seconds
  sb.tables.bomb_users.push({ discord_id: late, username: 'Late', avatar: null, status: 'waiting', expires_at: null });
  const waiting = await call(late, 'create', {});
  assert.deepEqual([waiting.status, waiting.body], [403, { error: 'not-allowed', state: 'waiting' }]);
});

test('kick: host only; the kicked member is out for good and the room moves to a new secret topic', async () => {
  const { room } = (await call(P.host, 'create', {})).body;
  await call(P.b, 'join', { code: room.code });
  await call(P.c, 'join', { code: room.code });
  const oldTopic = room.topic;

  assert.deepEqual((await call(P.b, 'kick', { id: P.c })).body, { error: 'host-only' });
  assert.equal((await call(P.host, 'kick', { id: P.host })).status, 400, 'not yourself');
  assert.equal((await call(P.host, 'kick', { id: P.d })).status, 404, 'not a member');

  const k = await call(P.host, 'kick', { id: P.c });
  assert.equal(k.status, 200);
  assert.notEqual(k.body.room.topic, oldTopic);
  assert.deepEqual(k.body.room.members.map((m) => m.id), [P.host, P.b]);
  const msg = lastBroadcast();
  assert.equal(msg.topic, oldTopic, 'told on the old topic: the last message there');
  assert.deepEqual([msg.payload.t, msg.payload.id], ['kick', P.c]);

  assert.equal((await state(P.c)).body.room, null);
  assert.deepEqual((await call(P.c, 'join', { code: room.code })).body, { error: 'kicked' });
  const b = (await state(P.b)).body.room;
  assert.equal(b.topic, k.body.room.topic, 'the others get the new topic');
});

test('answers board: each member writes their own answer per card; empty takes it off; old games refused', async () => {
  const { room } = (await call(Q.host, 'create', {})).body;
  await call(Q.b, 'join', { code: room.code });
  assert.equal((await call(Q.host, 'answer', { module: 'password', card: 1, answer: '  CLOCK  ', game: 1, tab: 't1' })).status, 200);
  assert.deepEqual(lastBroadcast().payload, { t: 'ans', key: `ans:password:1:${Q.host}`, value: { a: 'CLOCK' }, game: 1, tab: 't1', from: Q.host, at: lastBroadcast().payload.at });
  await call(Q.b, 'answer', { module: 'password', card: 1, answer: 'CLOAK', game: 1 });
  let items = (await state(Q.host)).body.items.filter((i) => i.key.startsWith('ans:'));
  assert.deepEqual(items.map((i) => [i.key, i.value.a]).sort(), [[`ans:password:1:${Q.host}`, 'CLOCK'], [`ans:password:1:${Q.b}`, 'CLOAK']]);

  await call(Q.b, 'answer', { module: 'password', card: 1, answer: '', game: 1 });
  assert.equal(lastBroadcast().payload.value, null);
  items = (await state(Q.host)).body.items.filter((i) => i.key.startsWith('ans:'));
  assert.deepEqual(items.map((i) => i.key), [`ans:password:1:${Q.host}`]);

  assert.equal((await call(Q.b, 'answer', { module: 'password', card: 12, answer: 'X', game: 1 })).status, 400);
  assert.equal((await call(Q.b, 'put', { key: `ans:password:1:${Q.host}`, value: { a: 'FAKE' }, game: 1 })).status, 400, "nobody writes someone else's answer");
  const long = await call(Q.b, 'answer', { module: 'mines', card: 0, answer: 'A1 '.repeat(400), game: 1 });
  assert.equal(long.status, 200);
  assert.ok(lastBroadcast().payload.value.a.length <= 400);
  await call(Q.host, 'new-game');
  assert.equal((await call(Q.b, 'answer', { module: 'password', card: 1, answer: 'X', game: 1 })).status, 409);
});

test('card state: state:<module>:<n>:<name> is shared; a CLEAR of the card drops it; New game drops old pictures', async () => {
  const { room } = (await call(Q.h2, 'create', {})).body;
  await call(Q.b2, 'join', { code: room.code });
  assert.equal((await call(Q.b2, 'put', { key: 'state:hangman:0:guessed', value: ['E', 'A'], game: 1 })).status, 200);
  assert.equal((await call(Q.b2, 'put', { key: 'state:hangman:1:guessed', value: ['T'], game: 1 })).status, 200);
  assert.equal((await call(Q.b2, 'put', { key: 'state:hangman:0:bad name!', value: 1, game: 1 })).status, 400);
  assert.equal((await call(Q.b2, 'put', { key: 'state:Hangman:0:x', value: 1, game: 1 })).status, 400);
  await call(Q.h2, 'card', { module: 'hangman', card: 0, url: 'https://x.example/h.png', game: 1 });
  await call(Q.h2, 'clear', { module: 'hangman', card: 0, game: 1 });
  const keys = (await state(Q.b2)).body.items.map((i) => i.key).sort();
  assert.deepEqual(keys, ['card:hangman:0', 'state:hangman:1:guessed'], 'card 0 starts over; card 1 keeps its letters');

  const form = new FormData();
  form.set('module', 'password'); form.set('card', '0'); form.set('game', '1');
  form.set('image', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'p.png');
  const up = await call(Q.b2, 'picture', form);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(sb.tables.bomb_room_pictures.length, 1);
  await new Promise((r) => setTimeout(r, 5)); // the picture is older than the New game
  await call(Q.h2, 'new-game');
  assert.equal(sb.tables.bomb_room_pictures.length, 0, "the old game's pictures go");
  assert.deepEqual(sb.tables.bomb_room_items.filter((i) => i.room_id === room.id).map((i) => i.key), [], "and its items");
});

test('puts: a card\'s reading in one write — this card\'s state: values only, one live message, a size limit', async () => {
  const P = { h: '200000000000000041', b: '200000000000000042' };
  for (const id of Object.values(P)) sb.tables.bomb_users.push({ discord_id: id, username: 'P', avatar: null, status: 'allowed', expires_at: null });
  const { room } = (await call(P.h, 'create', {})).body;
  await call(P.b, 'join', { code: room.code });
  const items = [
    { key: 'state:cube:0:cells', value: { U: ['W'] } },
    { key: 'state:cube:0:solution', value: "R U F'" },
    { key: 'state:cube:0:pictureRead', value: 'entry-12345678' },
  ];
  const before = sb.broadcasts.length;
  const ok = await call(P.b, 'puts', { module: 'cube', card: 0, items, game: 1, tab: 't1', mid: 'mid-aaaaaaaa-9' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(sb.broadcasts.length, before + 1, 'one live message for the whole reading');
  const b = lastBroadcast().payload;
  assert.deepEqual([b.t, b.key, b.items.length, b.from, b.mid], ['puts', 'card:cube:0', 3, P.b, 'mid-aaaaaaaa-9']);
  const got = Object.fromEntries((await state(P.h)).body.items.filter((i) => i.key.startsWith('state:cube:0:')).map((i) => [i.key, i.value]));
  assert.deepEqual(got, Object.fromEntries(items.map((i) => [i.key, i.value])));

  const bad = async (body) => (await call(P.b, 'puts', { game: 1, ...body })).status;
  assert.equal(await bad({ module: 'cube', card: 0, items: [{ key: 'state:cube:1:cells', value: 1 }] }), 400, 'another card');
  assert.equal(await bad({ module: 'cube', card: 0, items: [{ key: 'set:bombvision_serial', value: 'X' }] }), 400, 'not card state');
  assert.equal(await bad({ module: 'cube', card: 0, items: [] }), 400);
  assert.equal(await bad({ module: 'cube', card: 0, items: Array.from({ length: 25 }, (_, i) => ({ key: `state:cube:0:k${i}`, value: i })) }), 400);
  assert.equal(await bad({ module: 'cube', card: 0, items: [{ key: 'state:cube:0:big', value: 'x'.repeat(140 * 1024) }] }), 413);
  assert.equal(await bad({ module: 'cube', card: 0, items, game: 0 }), 409, 'a write from before New game');
});

test('warm: answers at once, without a login', async () => {
  const res = await api.GET(new Request(`${SITE}/api/room?action=warm`));
  assert.equal(res.status, 204);
});

test('level: the host\'s level is the room\'s — host only, checked, kept across New games', async () => {
  const L = { host: '200000000000000021', b: '200000000000000022' };
  for (const id of Object.values(L)) sb.tables.bomb_users.push({ discord_id: id, username: 'P', avatar: null, status: 'allowed', expires_at: null });
  const { room } = (await call(L.host, 'create', {})).body;
  await call(L.b, 'join', { code: room.code });

  // a preset mission and a level from GENERATE LEVEL (only on the host's device: it travels whole)
  const preset = levelValue({ id: '1.2', label: '1.2', modules: ['Wires', 'Memory', 'The Button'] });
  const custom = levelValue({ id: 'custom-1795', label: 'Friday bomb', custom: true, modules: ['Maze', 'Maze', 'Memory'], detected: ['Maze', 'Maze', 'Memory', 'Clock'] });
  assert.deepEqual(custom, { id: 'custom-1795', label: 'Friday bomb', modules: ['Maze', 'Maze', 'Memory'], custom: true });
  assert.deepEqual(levelValue(null), { all: true });
  assert.ok(levelOk(preset) && levelOk(custom) && levelOk({ all: true }));
  for (const bad of [null, 'x', [], {}, { id: '1.2', label: '1.2', modules: [] }, { id: '1.2', label: '1.2', modules: [5] }, { id: '', label: 'x', modules: ['Maze'] }])
    assert.ok(!levelOk(bad), JSON.stringify(bad));
  assert.equal(levelSig(preset), '1.2|Wires,Memory,The Button');
  assert.deepEqual([levelName(preset), levelName(custom), levelName({ all: true })], ['MISSION 1.2', 'LEVEL Friday bomb', 'ALL MODULES']);

  const member = await call(L.b, 'put', { key: 'level', value: preset, game: 1 });
  assert.deepEqual([member.status, member.body.error], [403, 'host-only']);
  assert.equal((await call(L.host, 'put', { key: 'level', value: { id: 'x' }, game: 1 })).status, 400);
  assert.equal((await call(L.host, 'put', { key: 'level', value: custom, game: 1 })).status, 200);
  assert.deepEqual(lastBroadcast().payload.value, custom);

  // a joiner reads it with the room; New game keeps it (the next bomb is often the same level)
  await call(L.host, 'new-game');
  const s = (await state(L.b)).body;
  assert.equal(s.room.game, 2);
  assert.deepEqual(s.items.find((i) => i.key === 'level').value, custom);
  assert.ok(roomKeyKept('level'));
  // the host picks another level (a write from game 1 still lands: the level isn't one game's)
  assert.equal((await call(L.host, 'put', { key: 'level', value: { all: true }, game: 1 })).status, 200);
  assert.deepEqual((await state(L.b)).body.items.find((i) => i.key === 'level').value, { all: true });
});

test('mid: the change\'s id given by the app goes out with the server\'s copy (put, answer, card, clear); a bad one is dropped', async () => {
  const M = { host: '200000000000000031', b: '200000000000000032' };
  for (const id of Object.values(M)) sb.tables.bomb_users.push({ discord_id: id, username: 'P', avatar: null, status: 'allowed', expires_at: null });
  const { room } = (await call(M.host, 'create', {})).body;
  await call(M.b, 'join', { code: room.code });
  const game = room.game;

  assert.equal((await call(M.host, 'put', { key: 'set:bombvision_serial', value: 'AB3C4', game, tab: 't1', mid: 'mid-0000-aaaa-1' })).status, 200);
  assert.equal(lastBroadcast().payload.mid, 'mid-0000-aaaa-1');
  await call(M.host, 'answer', { module: 'maze', card: 0, answer: 'UP', game, tab: 't1', mid: 'mid-0000-aaaa-2' });
  assert.equal(lastBroadcast().payload.mid, 'mid-0000-aaaa-2');
  await call(M.b, 'card', { module: 'maze', card: 0, url: 'https://cdn.discordapp.com/a.png', id: 'entry-0000-1', game, tab: 't2', mid: 'mid-0000-aaaa-3' });
  assert.equal(lastBroadcast().payload.mid, 'mid-0000-aaaa-3');
  assert.equal(lastBroadcast().payload.added.id, 'entry-0000-1');
  await call(M.b, 'clear', { module: 'maze', card: 0, game, tab: 't2', mid: 'mid-0000-aaaa-4' });
  assert.equal(lastBroadcast().payload.mid, 'mid-0000-aaaa-4');

  await call(M.host, 'put', { key: 'set:bombvision_serial', value: 'X', game, tab: 't1', mid: 'bad mid!' });
  assert.equal(lastBroadcast().payload.value, 'X');
  assert.ok(!('mid' in lastBroadcast().payload) || lastBroadcast().payload.mid === undefined);
});
