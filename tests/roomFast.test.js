// The fast way of a room (src/core/room/roomClient.js): a change goes on the live channel from the app
// itself, and the server's copy of it (same mid) isn't applied twice. Runs the real roomClient,
// roomSync and roomCards in Node with a stand-in live channel and server. No network.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ME = '300000000000000001', MATE = '300000000000000002';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── stand-ins: the browser bits these files use, the live channel and /api/room ─────────────────
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
});
const live = { sent: [], deliver: null, status: null };
globalThis.window = {
  __BB_ROOM_TRANSPORT__: {
    connect(o) {
      live.deliver = o.onMessage; live.status = o.onStatus;
      return { track() {}, send: (p) => live.sent.push(JSON.parse(JSON.stringify(p))), close() {} };
    },
  },
};
const posts = [];
globalThis.fetch = async (url, init = {}) => {
  const action = /action=([a-z-]+)/.exec(String(url))[1];
  let body = null;
  if (init.body instanceof FormData) body = Object.fromEntries([...init.body.entries()].filter(([k]) => k !== 'image'));
  else if (init.body) body = JSON.parse(init.body);
  posts.push({ action, body });
  const room = { id: 'r1', code: 'K7QX2M', topic: 'bomb-room-test', game: 1, size: 4, locked: false, host: ME, me: ME, members: [{ id: ME, name: 'Me' }, { id: MATE, name: 'Mate' }], realtime: { url: 'https://db.example', key: 'k' } };
  const out = action === 'create' ? { room, items: [] } : { ok: true };
  return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

let client, shared, cards;
before(async () => {
  client = await import('../src/core/room/roomClient.js');
  shared = await import('../src/core/sharedSetting.js');
  await import('../src/core/room/roomSync.js');
  cards = await import('../src/core/room/roomCards.js');
  await client.createRoom(4);
  for (let i = 0; i < 20 && !live.status; i++) await wait(5); // the live channel loads
  live.status('SUBSCRIBED');
  assert.equal(client.roomNow().status, 'live');
});

const msg = (fields) => ({ game: 1, tab: 'mate-tab', from: MATE, at: Date.now(), ...fields });

test('a change goes on the live channel at once, with the same id the server gets', async () => {
  live.sent.length = 0; posts.length = 0;
  shared.setSharedSetting('bombvision_serial', 'AB3C4');
  await wait(10);
  assert.equal(live.sent.length, 1);
  const f = live.sent[0];
  assert.deepEqual({ t: f.t, key: f.key, value: f.value, fast: f.fast, from: f.from, game: f.game, tab: f.tab },
    { t: 'put', key: 'set:bombvision_serial', value: 'AB3C4', fast: 1, from: ME, game: 1, tab: client.TAB });
  const put = posts.find((p) => p.action === 'put');
  assert.equal(put.body.mid, f.mid);
  assert.ok(/^[A-Za-z0-9-]{8,40}$/.test(f.mid));
});

test('typing: the first change at once, then the latest one every 300 ms', async () => {
  await wait(350);
  live.sent.length = 0;
  shared.setSharedSetting('bombvision_logic_vars', 'P');
  shared.setSharedSetting('bombvision_logic_vars', 'PQ');
  shared.setSharedSetting('bombvision_logic_vars', 'PQR');
  await wait(10);
  assert.deepEqual(live.sent.map((m) => m.value), ['P']);
  await wait(330);
  assert.deepEqual(live.sent.map((m) => m.value), ['P', 'PQR']);
  await wait(330);
  assert.equal(live.sent.length, 2); // nothing new: the window closed
});

test('a teammate\'s change is applied once: the server\'s copy (same mid) is skipped, a newer one isn\'t', async () => {
  live.deliver(msg({ t: 'put', key: 'set:bombvision_wires_manual', value: 'FAST', mid: 'mid-aaaaaaaa-1', fast: 1 }));
  assert.equal(shared.peekSharedSetting('bombvision_wires_manual'), 'FAST');
  live.deliver(msg({ t: 'put', key: 'set:bombvision_wires_manual', value: 'STALE', mid: 'mid-aaaaaaaa-1' }));
  assert.equal(shared.peekSharedSetting('bombvision_wires_manual'), 'FAST');
  live.deliver(msg({ t: 'put', key: 'set:bombvision_wires_manual', value: 'NEWER', mid: 'mid-aaaaaaaa-2' }));
  assert.equal(shared.peekSharedSetting('bombvision_wires_manual'), 'NEWER');
  // an app's change for another game is dropped
  live.deliver(msg({ t: 'put', key: 'set:bombvision_wires_manual', value: 'OLD GAME', mid: 'mid-aaaaaaaa-3', fast: 1, game: 0 }));
  assert.equal(shared.peekSharedSetting('bombvision_wires_manual'), 'NEWER');
});

test('a picture that comes the fast way loads into the card once, with its bytes; a link too', async () => {
  const loads = [];
  const win = { dataset: { module: 'maze' }, querySelectorAll: () => [el] };
  const el = { closest: (sel) => (sel === '[data-module]' ? win : sel === '[data-card]' ? { dataset: { card: '0' } } : null) };
  const zone = cards.attachCardZone(el, (src, done) => { loads.push(src); done(); });

  const bytes = [137, 80, 78, 71, 1, 2, 3];
  const data = Buffer.from(bytes).toString('base64');
  const added = { id: 'entry-aaaaaaaa-1', kind: 'pic', type: 'image/png', zone: 0, from: MATE, at: Date.now() };
  live.deliver(msg({ t: 'card', key: 'card:maze:0', added: { ...added, data }, mid: 'mid-bbbbbbbb-1', fast: 1 }));
  await wait(20);
  assert.equal(loads.length, 1);
  assert.equal(loads[0].type, 'file');
  assert.deepEqual([...new Uint8Array(await loads[0].file.arrayBuffer())], bytes);

  // the server's copy: the card's whole list with the saved picture's id; nothing loads twice
  const saved = { ...added, pic: '11111111-2222-3333-4444-555555555555' };
  live.deliver(msg({ t: 'card', key: 'card:maze:0', value: { pics: [saved], cleared: 0 }, added: saved, mid: 'mid-bbbbbbbb-1' }));
  await wait(20);
  assert.equal(loads.length, 1);

  live.deliver(msg({ t: 'card', key: 'card:maze:0', added: { id: 'entry-aaaaaaaa-2', kind: 'link', url: 'https://cdn.discordapp.com/x.png', zone: 0, from: MATE, at: Date.now() }, mid: 'mid-bbbbbbbb-2', fast: 1 }));
  await wait(20);
  assert.deepEqual(loads.slice(1), [{ type: 'url', url: 'https://cdn.discordapp.com/x.png' }]);

  // not a picture or an https link: left out
  live.deliver(msg({ t: 'card', key: 'card:maze:0', added: { id: 'entry-aaaaaaaa-3', kind: 'link', url: 'http://x.example/a.png', zone: 0 }, mid: 'mid-bbbbbbbb-3', fast: 1 }));
  live.deliver(msg({ t: 'card', key: 'card:maze:0', added: { id: 'entry-aaaaaaaa-4', kind: 'pic', type: 'text/html', data, zone: 0 }, mid: 'mid-bbbbbbbb-4', fast: 1 }));
  await wait(20);
  assert.equal(loads.length, 2);
  zone.detach();
});

test('too big for one live message: only the server gets it', async () => {
  await wait(350);
  live.sent.length = 0; posts.length = 0;
  shared.setSharedSetting('bombvision_astro_stars', 'x'.repeat(client.FAST_MAX_CHARS + 10));
  await wait(10);
  assert.equal(live.sent.length, 0);
  assert.equal(posts.filter((p) => p.action === 'put').length, 1);
});
