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
const live = { sent: [], deliver: null, status: null, presence: null };
globalThis.window = {
  __BB_ROOM_TRANSPORT__: {
    connect(o) {
      live.deliver = o.onMessage; live.status = o.onStatus; live.presence = o.onPresence;
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

let client, shared, cards, board, timing, cardState;
before(async () => {
  client = await import('../src/core/room/roomClient.js');
  shared = await import('../src/core/sharedSetting.js');
  await import('../src/core/room/roomSync.js');
  cards = await import('../src/core/room/roomCards.js');
  board = await import('../src/core/room/roomBoard.js');
  timing = await import('../src/core/room/roomTiming.js');
  cardState = await import('../src/core/room/useCardState.js');
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

// ── the timing line (roomTiming.js) ─────────────────────────────────────────────────────────────

test('timing: a teammate\'s ping is answered; our ping\'s answer gives the round trip and their clock', async () => {
  live.sent.length = 0;
  live.deliver({ t: 'ping', from: MATE, tab: 'mate-tab', at: Date.now(), p: 1234.5 });
  assert.deepEqual(live.sent.map((m) => [m.t, m.to, m.from, m.p]), [['pong', 'mate-tab', ME, 1234.5]]);
  live.sent.length = 0;
  live.deliver({ t: 'ping', from: ME, tab: 'my-other-tab', at: Date.now(), p: 1 }); // our own other tab: no answer
  assert.equal(live.sent.length, 0);

  // their clock runs 5 s ahead of ours; the answer took 100 ms there and back
  live.deliver({ t: 'pong', to: client.TAB, from: MATE, at: Date.now() + 5000, p: performance.now() - 100 });
  const link = timing.roomTimingNow().links[MATE];
  assert.ok(Math.abs(link.rtt - 100) <= 5, String(link.rtt));
  assert.ok(Math.abs(link.offset - 5050) <= 10, String(link.offset));
  live.deliver({ t: 'pong', to: 'someone-else', from: MATE, at: Date.now(), p: performance.now() - 900 });
  assert.equal(timing.roomTimingNow().links[MATE].n, 1); // not ours: ignored

  // a tap they sent 70 ms ago (their clock) took ~70 ms to get here
  live.deliver(msg({ t: 'put', key: 'set:bombvision_knob_rules', value: 'K', mid: 'mid-cccccccc-1', fast: 1, at: Date.now() - 70 + 5050 }));
  const change = timing.roomTimingNow().change;
  assert.equal(change.from, MATE);
  assert.ok(Math.abs(change.trip - 70) <= 10, String(change.trip));
});

test('timing: a teammate\'s picture: trip, in the card, answer; one pasted here: answer', async () => {
  const win = { dataset: { module: 'mines' }, querySelectorAll: () => [el] };
  const el = { closest: (sel) => (sel === '[data-module]' ? win : sel === '[data-card]' ? { dataset: { card: '0' } } : null) };
  const zone = cards.attachCardZone(el, (src, done) => setTimeout(done, 15));
  const data = Buffer.from([137, 80, 78, 71]).toString('base64');
  live.deliver(msg({ t: 'card', key: 'card:mines:0', added: { id: 'entry-dddddddd-1', kind: 'pic', type: 'image/png', zone: 0, from: MATE, at: Date.now(), data }, mid: 'mid-dddddddd-1', fast: 1, at: Date.now() - 80 + 5050 }));
  await wait(40);
  let rec = timing.roomTimingNow().pics.find((p) => p.id === 'entry-dddddddd-1');
  assert.equal(rec.via, 'fast');
  assert.ok(Math.abs(rec.trip - 80) <= 10, String(rec.trip));
  assert.ok(rec.load >= 10, String(rec.load));
  assert.equal(rec.answer, null);
  board.noteAnswer({ module: 'mines', card: 0 }, 'p1', 'A5 C4');
  rec = timing.roomTimingNow().pics.find((p) => p.id === 'entry-dddddddd-1');
  assert.ok(rec.answer >= rec.load, `${rec.answer} ${rec.load}`);
  assert.equal(rec.done, true);

  // pasted here: the time until the card's answer changed
  zone.took({ type: 'url', url: 'https://cdn.discordapp.com/m.png' });
  await wait(25);
  board.noteAnswer({ module: 'mines', card: 0 }, 'p1', 'B2');
  const own = timing.roomTimingNow().pics[0];
  assert.equal(own.own, true);
  assert.ok(own.answer >= 20, String(own.answer));
  zone.detach();

  const lines = timing.timingLines(timing.roomTimingNow(), { me: ME, members: [ME, MATE], who: (id) => (id === MATE ? 'Yuza' : 'you'), label: (m) => (m === 'mines' ? 'Mines' : m) });
  assert.match(lines[0], /^Live link, there and back: Yuza \d+ ms$/);
  assert.match(lines[1], /^Mines #1 · pasted here · answer after \d+ ms$/);
  assert.match(lines[2], /^Mines #1 · from Yuza · fast way · trip \d+ ms · in the card after \d+ ms · answer after \d+ ms$/);
  assert.ok(lines.some((l) => /^Last tap or text from Yuza: trip \d+ ms · \d+ s ago$/.test(l)));
});

// ── shared reading (roomCards.js + useCardState.js): only the app that took a picture reads it ──────

const zoneEl = (module, card = 0) => {
  const win = { dataset: { module }, querySelectorAll: () => [el] };
  const el = { closest: (sel) => (sel === '[data-module]' ? win : sel === '[data-card]' ? { dataset: { card: String(card) } } : null) };
  return el;
};

test('shared reading, the app that took the picture: the live channel says a picture is coming (no bytes), then the reading in one message', async () => {
  const loads = [];
  const zone = cards.attachCardZone(zoneEl('cube'), (src, done) => { loads.push(src); done(true); }, () => {}, { shared: true });
  live.sent.length = 0; posts.length = 0;
  const file = new File([new Uint8Array(2000)], 'cube.png', { type: 'image/png' });
  zone.took({ type: 'file', file }, file);
  await wait(10);
  const ann = live.sent.find((m) => m.t === 'card');
  assert.equal(ann.key, 'card:cube:0');
  assert.equal(ann.added.kind, 'pic');
  assert.equal(ann.added.data, undefined); // the picture itself goes to the server only
  assert.ok(posts.some((p) => p.action === 'picture'));

  // the module reads it: its values wait for the end of the reading …
  cardState.writeCardValue('cube', 0, 'cells', { U: ['W'], F: ['G'], R: ['R'] }, false);
  cardState.writeCardValue('cube', 0, 'solution', 'R U', false);
  cardState.writeCardValue('cube', 0, 'solution', "R U F'", false);
  await wait(10);
  assert.equal(live.sent.filter((m) => m.t === 'put' || m.t === 'puts').length, 0);
  // … then go together, with the picture's id
  zone.readDone();
  await wait(10);
  const puts = live.sent.filter((m) => m.t === 'puts');
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].items.map((it) => [it.key, it.value]), [
    ['state:cube:0:cells', { U: ['W'], F: ['G'], R: ['R'] }],
    ['state:cube:0:solution', "R U F'"],
    ['state:cube:0:pictureRead', ann.added.id],
  ]);
  const post = posts.find((p) => p.action === 'puts');
  assert.deepEqual([post.body.module, post.body.card, post.body.items.length, post.body.mid], ['cube', 0, 3, puts[0].mid]);
  assert.equal(loads.length, 0);
  // after the reading, the module's own changes stay here again (a person's tap still goes)
  live.sent.length = 0;
  cardState.writeCardValue('cube', 0, 'solution', 'U', false);
  await wait(10);
  assert.equal(live.sent.length, 0);
  zone.detach();
});

test('shared reading, a teammate: UPDATING from the picture\'s arrival until their reading; the picture isn\'t read here', async () => {
  const loads = [];
  const zone = cards.attachCardZone(zoneEl('piano'), (src, done) => { loads.push(src); done(true); }, () => {}, { shared: true });
  const id = 'entry-pppppppp-1';
  live.deliver(msg({ t: 'card', key: 'card:piano:0', added: { id, kind: 'pic', type: 'image/png', zone: 0, from: MATE, at: Date.now() }, mid: 'mid-pppppppp-1', fast: 1 }));
  await wait(10);
  assert.equal(cards.cardUpdatingNow('piano', 0).from, MATE);
  assert.equal(loads.length, 0);
  const items = [
    { key: 'state:piano:0:notes', value: [{ pos: 0, acc: 0 }, { pos: 4, acc: 0 }] },
    { key: 'state:piano:0:placed', value: [true, true] },
    { key: 'state:piano:0:pictureRead', value: id },
  ];
  live.deliver(msg({ t: 'puts', key: 'card:piano:0', items, mid: 'mid-pppppppp-2', fast: 1 }));
  await wait(10);
  assert.equal(cards.cardUpdatingNow('piano', 0), null);
  assert.deepEqual(cardState.cardValue('piano', 0, 'notes'), [{ pos: 0, acc: 0 }, { pos: 4, acc: 0 }]);
  assert.deepEqual(cardState.cardValue('piano', 0, 'placed'), [true, true]);
  // the server's copy (same mid) changes nothing; the server's list gives the picture its id
  live.deliver(msg({ t: 'puts', key: 'card:piano:0', items, mid: 'mid-pppppppp-2' }));
  live.deliver(msg({ t: 'card', key: 'card:piano:0', value: { pics: [{ id, kind: 'pic', pic: 'pic-1', type: 'image/png', zone: 0, from: MATE }], cleared: 0 }, added: { id, kind: 'pic', pic: 'pic-1', from: MATE }, mid: 'mid-pppppppp-1' }));
  await wait(10);
  assert.equal(cards.cardUpdatingNow('piano', 0), null);
  assert.equal(loads.length, 0);
  const rec = timing.roomTimingNow().pics.find((p) => p.id === id);
  assert.ok(rec.read != null);
  zone.detach();
});

test('a card read the usual way: UPDATING until this app has read the teammate\'s picture', async () => {
  let finish;
  const zone = cards.attachCardZone(zoneEl('maze', 3), (src, done) => { finish = done; }, () => {});
  const data = Buffer.from([137, 80, 78, 71]).toString('base64');
  live.deliver(msg({ t: 'card', key: 'card:maze:3', added: { id: 'entry-mmmmmmmm-1', kind: 'pic', type: 'image/png', zone: 0, from: MATE, at: Date.now(), data }, mid: 'mid-mmmmmmmm-1', fast: 1 }));
  await wait(10);
  assert.equal(cards.cardUpdatingNow('maze', 3).from, MATE);
  finish(true);
  await wait(10);
  assert.equal(cards.cardUpdatingNow('maze', 3), null);
  zone.detach();
});

test('which module a teammate has open comes as a live message at once, and an older presence doesn\'t undo it', () => {
  live.presence({ 'mate-tab': [{ id: MATE, module: 'wires', role: '', at: Date.now() - 5000 }] });
  assert.equal(client.roomNow().online[MATE].module, 'wires');
  live.deliver({ t: 'where', from: MATE, tab: 'mate-tab', module: 'mines', role: 'helper', at: Date.now() });
  assert.deepEqual(client.roomNow().online[MATE], { module: 'mines', role: 'helper' });
  live.presence({ 'mate-tab': [{ id: MATE, module: 'wires', role: '', at: Date.now() - 4000 }] });
  assert.equal(client.roomNow().online[MATE].module, 'mines');
  live.deliver({ t: 'where', from: '399999999999999999', module: 'maze', at: Date.now() }); // not a member
  assert.equal(client.roomNow().online['399999999999999999'], undefined);
});

test('the answers board: an answer goes at once, a quick correction 300 ms later', async () => {
  await wait(320); // an earlier test's last answer
  live.sent.length = 0;
  board.noteAnswer({ module: 'wof', card: 2 }, 'p', 'FIRST');
  await wait(10);
  assert.deepEqual(live.sent.filter((m) => m.t === 'ans').map((m) => m.value), [{ a: 'FIRST' }]);
  board.noteAnswer({ module: 'wof', card: 2 }, 'p', 'SECOND');
  await wait(10);
  assert.equal(live.sent.filter((m) => m.t === 'ans').length, 1);
  await wait(320);
  assert.deepEqual(live.sent.filter((m) => m.t === 'ans').map((m) => m.value), [{ a: 'FIRST' }, { a: 'SECOND' }]);
});

test('shared reading: no reading from the teammate (an app from before the update): this app reads the picture after 6 s', async (t) => {
  const loads = [];
  const zone = cards.attachCardZone(zoneEl('wof', 4), (src, done) => { loads.push(src); done(true); }, () => {}, { shared: true });
  const data = Buffer.from([137, 80, 78, 71]).toString('base64'); // an old app still sends the bytes
  live.deliver(msg({ t: 'card', key: 'card:wof:4', added: { id: 'entry-oooooooo-1', kind: 'pic', type: 'image/png', zone: 0, from: MATE, at: Date.now(), data }, mid: 'mid-oooooooo-1', fast: 1 }));
  await wait(20);
  assert.equal(loads.length, 0);
  assert.ok(cards.cardUpdatingNow('wof', 4));
  await wait(6100);
  assert.equal(loads.length, 1);
  assert.equal(cards.cardUpdatingNow('wof', 4), null);
  zone.detach();
});
