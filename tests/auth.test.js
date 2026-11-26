// The website's login (optional: only rooms need it), permissions and page lock (lib/, api/,
// scripts/lock-site.mjs), against a fake Discord and a fake Supabase: no network.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SESSION_COOKIE, STATE_COOKIE, lockKey, newSession, readSession, safeNext, sessionSecret, signToken, verifyToken } from '../lib/session.js';
import { accessFor, accessOf, adminChange, adminIds, publicKeyMistake } from '../lib/users.js';
import { sealPage, lockSite, PUBLISHED } from '../scripts/lock-site.mjs';
import * as login from '../api/auth/login.js';
import * as callback from '../api/auth/callback.js';
import * as me from '../api/auth/me.js';
import * as logout from '../api/auth/logout.js';
import * as unlock from '../api/unlock.js';
import * as admin from '../api/admin.js';
import * as report from '../api/report.js';
import { reportMessage, reportWebhook } from '../lib/report.js';
import { ogIds, isOg } from '../lib/users.js';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const SITE = 'https://bomb.example';
const OWNER = '100000000000000001';
const OG = '400000000000000004';

// ── fake Supabase (bomb_users) and Discord ────────────────────────────────────────────────────────
let db;          // discord_id → row
let discordUsers; // code → Discord user
let dbDown;
let webhookCalls; // what the ⚑ reports sent to the Discord webhook
let webhookStatus;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const method = init.method || 'GET';
  const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'discord.com' && u.pathname.startsWith('/api/webhooks/')) {
    webhookCalls.push({ url: u, body: init.body });
    return ok(webhookStatus === 200 ? { id: '1' } : { message: 'Unknown Webhook' }, webhookStatus);
  }
  if (u.host === 'db.example') {
    if (dbDown) throw new TypeError('fetch failed');
    assert.equal(init.headers.apikey, 'service-key');
    assert.equal(u.pathname, '/rest/v1/bomb_users');
    const id = (u.searchParams.get('discord_id') || '').replace(/^eq\./, '');
    if (method === 'GET') return ok(id ? (db.has(id) ? [db.get(id)] : []) : [...db.values()]);
    if (method === 'POST') {
      const row = { created_at: new Date().toISOString(), expires_at: null, ...JSON.parse(init.body) };
      db.set(row.discord_id, row);
      return ok([row], 201);
    }
    if (method === 'PATCH') {
      if (!db.has(id)) return ok([]);
      db.set(id, { ...db.get(id), ...JSON.parse(init.body) });
      return ok([db.get(id)]);
    }
  }
  if (u.href === 'https://discord.com/api/oauth2/token') {
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('redirect_uri'), `${SITE}/api/auth/callback`);
    const user = discordUsers[form.get('code')];
    return user ? ok({ access_token: 'tok-' + form.get('code') }) : ok({ error: 'invalid_grant' }, 400);
  }
  if (u.href === 'https://discord.com/api/users/@me') {
    const code = init.headers.Authorization.replace('Bearer tok-', '');
    return ok(discordUsers[code]);
  }
  throw new Error('unexpected fetch ' + url);
};

beforeEach(() => {
  Object.assign(process.env, {
    SESSION_SECRET: SECRET, SUPABASE_URL: 'https://db.example/rest/v1/', SUPABASE_SERVICE_KEY: 'service-key',
    DISCORD_CLIENT_ID: 'client', DISCORD_CLIENT_SECRET: 'shh', ADMIN_IDS: OWNER,
  });
  delete process.env.NEW_USERS;
  delete process.env.DISCORD_REDIRECT_URI;
  delete process.env.OG_IDS;
  delete process.env.REPORT_WEBHOOK;
  db = new Map();
  dbDown = false;
  webhookCalls = [];
  webhookStatus = 200;
  discordUsers = {
    owner: { id: OWNER, username: 'owner', global_name: 'The Owner', avatar: null },
    friend: { id: '200000000000000002', username: 'friend', global_name: 'Friend', avatar: 'abc' },
    sneaky: { id: '300000000000000003', username: 'sneaky', global_name: '<img src=x onerror=alert(1)>', avatar: null },
    og: { id: OG, username: 'yuza6', global_name: 'Yuki', avatar: null },
  };
});

// ── helpers ───────────────────────────────────────────────────────────────────────────────────────
const req = (path, { cookies = {}, headers = {}, ...init } = {}) => new Request(SITE + path, {
  ...init,
  headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
});
const setCookies = (res) => Object.fromEntries(res.headers.getSetCookie().map((c) => {
  const [kv] = c.split(';');
  const i = kv.indexOf('=');
  return [kv.slice(0, i), kv.slice(i + 1)];
}));

/** Log in through /api/auth/login and /api/auth/callback as one of the fake Discord users. */
async function logIn(code, next = '/') {
  const start = await login.GET(req('/api/auth/login?next=' + encodeURIComponent(next)));
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get('location'));
  assert.equal(to.origin + to.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(to.searchParams.get('scope'), 'identify');
  const state = to.searchParams.get('state');
  const pending = setCookies(start)[STATE_COOKIE];
  const back = await callback.GET(req(`/api/auth/callback?code=${code}&state=${state}`, { cookies: { [STATE_COOKIE]: pending } }));
  return { res: back, session: setCookies(back)[SESSION_COOKIE] };
}

const asUser = (session, extra = {}) => ({ cookies: { [SESSION_COOKIE]: session }, ...extra });
const sameSite = { origin: SITE, 'content-type': 'application/json' };

// ── sessions ──────────────────────────────────────────────────────────────────────────────────────
test('a session token only verifies unaltered, with the same secret', async () => {
  const t = await signToken({ id: '1', name: 'a', iat: 5 }, SECRET);
  assert.deepEqual(await verifyToken(t, SECRET), { id: '1', name: 'a', iat: 5 });
  assert.equal(await verifyToken(t, SECRET + 'x'), null);
  const [p, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ id: '2', name: 'a', iat: 5 })).toString('base64url');
  assert.equal(await verifyToken(`${forged}.${sig}`, SECRET), null);
  assert.equal(await verifyToken(p, SECRET), null);
  assert.equal(await verifyToken(undefined, SECRET), null);
});

test('sessions end after 30 days; a short or missing secret trusts nothing', async () => {
  const old = await signToken(newSession({ id: '1', name: 'a' }, Date.now() - 31 * 864e5), SECRET);
  assert.equal(await readSession(req('/', { cookies: { [SESSION_COOKIE]: old } }), SECRET), null);
  assert.equal(sessionSecret({ SESSION_SECRET: 'short' }), null);
  assert.equal(sessionSecret({}), null);
  assert.equal(await verifyToken(await signToken({ id: '1' }, SECRET), null), null);
});

test('after login only a path on this site is followed', () => {
  assert.equal(safeNext('/bomb'), '/bomb');
  assert.equal(safeNext('/#play=heist'), '/#play=heist');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null,
    '/\t/evil.example', '/\n/evil.example', '/\r\n/evil.example', '/\\/evil.example', '\t//evil.example']) {
    assert.equal(safeNext(bad), '/', JSON.stringify(bad));
  }
  // whatever comes out stays on this site when a browser follows it
  for (const n of ['/bomb', '/%09/evil.example', '/a b', '/x?y=//evil.example#//z']) {
    assert.equal(new URL(safeNext(n), 'https://bomb.example').host, 'bomb.example', JSON.stringify(n));
  }
});

test('access: allowed, time-limited, waiting, blocked', () => {
  const now = Date.parse('2026-11-24T00:00:00Z');
  assert.equal(accessOf({ status: 'allowed', expires_at: null }, now), 'allowed');
  assert.equal(accessOf({ status: 'allowed', expires_at: '2026-11-25T00:00:00Z' }, now), 'allowed');
  assert.equal(accessOf({ status: 'allowed', expires_at: '2026-11-23T00:00:00Z' }, now), 'expired');
  assert.equal(accessOf({ status: 'waiting' }, now), 'waiting');
  assert.equal(accessOf({ status: 'blocked' }, now), 'blocked');
  assert.equal(accessOf({ status: 'something else' }, now), 'blocked');
  assert.equal(accessOf(null, now), 'unknown');
  assert.equal(adminChange('allow_7d', now).expires_at, '2026-12-01T00:00:00.000Z');
  assert.deepEqual(adminChange('allow', now), { status: 'allowed', expires_at: null });
  assert.equal(adminChange('drop table', now), null);
});

// ── the page lock ─────────────────────────────────────────────────────────────────────────────────
const CODE = 'const SECRET_SOLVER="syReadKeypadTile";document.getElementById("root").textContent="app ran";';
const HTML = `<!doctype html><html><head><script defer src="https://cdn.example/chess.js"></script>
<script type="module" crossorigin>${CODE}</script><style>body{color:red}</style></head><body><div id="root"></div></body></html>`;

/** What the browser does with a sealed page and the key /api/unlock gives it. */
function openSealed(html, keyB64) {
  const m = /id="bb-sealed" data-salt="([^"]+)" data-iv="([^"]+)">([^<]+)<\/script>/.exec(html);
  return crypto.subtle.importKey('raw', Buffer.from(keyB64, 'base64'), 'AES-GCM', false, ['decrypt'])
    .then((k) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m[2], 'base64') }, k, Buffer.from(m[3], 'base64')))
    .then((z) => ({ salt: m[1], code: gunzipSync(Buffer.from(z)).toString() }));
}

test('a sealed page holds no readable code, only the loader', async () => {
  const sealed = await sealPage(HTML, SECRET, SITE);
  assert.ok(!sealed.includes('syReadKeypadTile'));
  assert.ok(!sealed.includes('type="module"'));
  assert.ok(sealed.includes('<script defer src="https://cdn.example/chess.js">'), 'other scripts stay');
  assert.ok(sealed.includes('body{color:red}'), 'CSS stays');
  assert.ok(sealed.includes(JSON.stringify(SITE)), 'the "only runs on" screen links the site');
  const salt = /data-salt="([^"]+)"/.exec(sealed)[1];
  const key = Buffer.from(await lockKey(SECRET, salt)).toString('base64');
  assert.equal((await openSealed(sealed, key)).code, CODE);
  const wrong = Buffer.from(await lockKey(SECRET + 'x', salt)).toString('base64');
  await assert.rejects(openSealed(sealed, wrong));
  assert.notEqual(/data-salt="([^"]+)"/.exec(await sealPage(HTML, SECRET, SITE))[1], salt, 'a new salt every build');
});

test('the deploy keeps only the site pages and refuses a build without them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-'));
  for (const f of ['dixie.html', 'yuza.html', 'bomb.html']) writeFileSync(join(dir, f), HTML);
  for (const f of ['login.html', 'stockfish.js', 'bombs.html', 'maze.html', 'HeistMannHiHiHellowHi.html']) writeFileSync(join(dir, f), 'x');
  await lockSite(dir, SECRET, SITE);
  assert.deepEqual(readdirSync(dir).sort(), [...PUBLISHED].sort());
  assert.ok(!readFileSync(join(dir, 'bomb.html'), 'utf8').includes('syReadKeypadTile'));
  const empty = mkdtempSync(join(tmpdir(), 'lock-'));
  await assert.rejects(lockSite(empty, SECRET, SITE), /missing/);
});

// ── the whole flow ────────────────────────────────────────────────────────────────────────────────
/** POST /api/unlock for a sealed page → { status, key, account }. */
async function unlockAs(session, { headers = sameSite } = {}) {
  const sealed = await sealPage(HTML, SECRET, SITE);
  const salt = /data-salt="([^"]+)"/.exec(sealed)[1];
  const r = await unlock.POST(req('/api/unlock', { ...(session ? asUser(session) : {}), method: 'POST', headers, body: JSON.stringify({ salt }) }));
  const data = await r.json();
  return { status: r.status, ...data, code: data.key ? (await openSealed(sealed, data.key)).code : null };
}

test('a guest opens the solver without logging in (account null); a forged session is a guest', async () => {
  const g = await unlockAs(null);
  assert.equal(g.status, 200);
  assert.equal(g.code, CODE, 'the page runs for a guest');
  assert.equal(g.account, null);
  const forged = await signToken({ id: OWNER, name: 'x', iat: Date.now() }, 'another-secret-0123456789abcdef01234');
  const f = await unlockAs(forged);
  assert.equal(f.account, null, 'a session signed with another secret counts for nothing');
  assert.equal((await me.GET(req('/api/auth/me'))).status, 200);
  assert.equal((await (await me.GET(req('/api/auth/me'))).json()).state, 'guest');
});

test('a first login gets in, lands where it started, and can unlock the page', async () => {
  const { res, session } = await logIn('friend', '/bomb');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/bomb');
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE));
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
  assert.equal(db.get('200000000000000002').status, 'allowed');
  assert.equal(db.get('200000000000000002').username, 'Friend');

  const info = await (await me.GET(req('/api/auth/me', asUser(session)))).json();
  assert.equal(info.state, 'allowed');
  assert.equal(info.admin, false);

  const u = await unlockAs(session);
  assert.equal(u.status, 200);
  assert.equal(u.code, CODE);
  assert.deepEqual(u.account, { name: 'Friend', admin: false, og: false, state: 'allowed' });
});

test('unlock refuses other sites and bad salts', async () => {
  const { session } = await logIn('friend');
  const body = JSON.stringify({ salt: 'abcdefghijklmnopqrstuv' });
  assert.equal((await unlock.POST(req('/api/unlock', { method: 'POST', headers: { origin: 'https://copycat.example' }, body }))).status, 403, 'a guest on another site');
  assert.equal((await unlock.POST(req('/api/unlock', asUser(session, { method: 'POST', headers: { origin: 'https://copycat.example' }, body })))).status, 403);
  assert.equal((await unlock.POST(req('/api/unlock', asUser(session, { method: 'POST', body })))).status, 403, 'no Origin at all');
  assert.equal((await unlock.POST(req('/api/unlock', asUser(session, { method: 'POST', headers: sameSite, body: '{"salt":"../x"}' })))).status, 400);
});

test('with NEW_USERS=wait a first login waits for rooms (the solver still opens); the owner always gets in', async () => {
  process.env.NEW_USERS = 'wait';
  const { res, session } = await logIn('friend', '/bomb#play=bomb&room=K7QX2M');
  assert.equal(res.headers.get('location'), '/bomb#play=bomb&room=K7QX2M', 'back where the login started, invite and all');
  assert.equal(db.get('200000000000000002').status, 'waiting');
  const u = await unlockAs(session);
  assert.equal(u.code, CODE);
  assert.equal(u.account.state, 'waiting');
  assert.equal((await (await me.GET(req('/api/auth/me', asUser(session)))).json()).state, 'waiting');
  const owner = await logIn('owner', '/admin');
  assert.equal(owner.res.headers.get('location'), '/admin');
  assert.equal(db.get(OWNER).status, 'allowed');
});

test('the login has to come back with its own state', async () => {
  const start = await login.GET(req('/api/auth/login'));
  const pending = setCookies(start)[STATE_COOKIE];
  const bad = await callback.GET(req('/api/auth/callback?code=friend&state=someone-elses', { cookies: { [STATE_COOKIE]: pending } }));
  assert.equal(bad.headers.get('location'), '/login?error=state');
  const none = await callback.GET(req('/api/auth/callback?code=friend&state=x'));
  assert.equal(none.headers.get('location'), '/login?error=state');
  const cancelled = await callback.GET(req('/api/auth/callback?error=access_denied&state=x'));
  assert.equal(cancelled.headers.get('location'), '/login?error=cancelled');
  assert.equal(db.size, 0);
});

test('without the settings, login says it is not set up', async () => {
  delete process.env.DISCORD_CLIENT_SECRET;
  assert.equal((await login.GET(req('/api/auth/login'))).headers.get('location'), '/login?error=setup');
  assert.equal((await (await me.GET(req('/api/auth/me'))).json()).ready, false);
});

test('the owner blocks and time-limits people from /admin', async () => {
  const friend = await logIn('friend');
  await logIn('sneaky');
  const owner = await logIn('owner');

  const notOwner = await admin.GET(req('/admin', asUser(friend.session)));
  assert.equal(notOwner.status, 403);
  assert.match(await notOwner.text(), /200000000000000002/, 'tells you your Discord ID for ADMIN_IDS');
  assert.equal((await admin.GET(req('/admin'))).headers.get('location'), '/login?next=/admin');

  const list = await admin.GET(req('/admin', asUser(owner.session)));
  assert.equal(list.status, 200);
  const page = await list.text();
  assert.ok(page.includes('Friend') && page.includes('@sneaky'));
  assert.ok(!page.includes('<img src=x onerror'), 'names are escaped');
  assert.ok(page.includes('&lt;img src=x onerror=alert(1)&gt;'));

  const form = (id, action, origin = SITE) => req('/admin', asUser(owner.session, {
    method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id, action }).toString(),
  }));
  assert.equal((await admin.POST(form('200000000000000002', 'block', 'https://evil.example'))).status, 403);
  assert.equal((await admin.POST(req('/admin', asUser(friend.session, { method: 'POST', headers: { origin: SITE }, body: 'id=1&action=block' })))).status, 403);

  const done = await admin.POST(form('200000000000000002', 'block'));
  assert.equal(done.status, 303);
  assert.match(done.headers.get('location'), /done=block/);
  assert.equal(db.get('200000000000000002').status, 'blocked');
  const blocked = await unlockAs(friend.session);
  assert.equal(blocked.code, CODE, 'a blocked account still gets the solver');
  assert.equal(blocked.account.state, 'blocked', '… but not rooms');

  await admin.POST(form('200000000000000002', 'allow_1d'));
  assert.equal((await accessFor('200000000000000002', { fresh: true })).state, 'allowed');
  const expires = Date.parse(db.get('200000000000000002').expires_at);
  assert.ok(Math.abs(expires - Date.now() - 864e5) < 60e3);
  const later = await accessFor('200000000000000002', { fresh: true, now: expires + 1 });
  assert.equal(later.state, 'expired');
});

test('if the database is down, the solver still opens, the owner keeps rooms and others are asked to retry', async (t) => {
  const friend = await logIn('friend');
  const owner = await logIn('owner');
  dbDown = true;
  const quiet = console.error;
  console.error = () => {}; // the expected "Access check failed" lines
  t.after(() => { console.error = quiet; });
  assert.equal((await unlockAs(owner.session)).account.state, 'allowed');
  const down = await unlockAs(friend.session);
  assert.equal(down.code, CODE);
  assert.equal(down.account.state, 'error');
  const f = await accessFor('200000000000000002', { fresh: true }).catch((e) => e);
  assert.ok(f instanceof Error);
  const res = await me.GET(req('/api/auth/me', asUser(friend.session)));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).state, 'error');
});

test('logging out clears the session cookie', async () => {
  const res = logout.GET();
  assert.equal(res.headers.get('location'), '/login?bye=1');
  assert.match(res.headers.getSetCookie()[0], new RegExp(`^${SESSION_COOKIE}=; .*Max-Age=0`));
});

test('the public Supabase key is refused with a clear message; NEXT_PUBLIC_SUPABASE_URL works', async () => {
  const anonJwt = 'x.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.y';
  const serviceJwt = 'x.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.y';
  assert.equal(publicKeyMistake('sb_publishable_abc'), true);
  assert.equal(publicKeyMistake(anonJwt), true);
  assert.equal(publicKeyMistake('sb_secret_abc'), false);
  assert.equal(publicKeyMistake(serviceJwt), false);

  process.env.SUPABASE_SERVICE_KEY = 'sb_publishable_abc';
  await assert.rejects(accessFor('200000000000000002', { fresh: true }), /publishable.*secret key/s);
  const owner = await signToken(newSession({ id: OWNER, name: 'o' }), SECRET);
  const page = await admin.GET(req('/admin', { cookies: { [SESSION_COOKIE]: owner } }));
  assert.equal(page.status, 503);
  assert.match(await page.text(), /Secret keys/);

  process.env.SUPABASE_SERVICE_KEY = 'service-key';
  delete process.env.SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example';
  const { session } = await logIn('friend');
  assert.ok(session);
  assert.equal(db.get('200000000000000002').status, 'allowed');
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

test('ADMIN_IDS takes the number however it is pasted', () => {
  assert.deepEqual(adminIds({ ADMIN_IDS: '123456789012345678' }), ['123456789012345678']);
  assert.deepEqual(adminIds({ ADMIN_IDS: '<@123456789012345678>' }), ['123456789012345678']);
  assert.deepEqual(adminIds({ ADMIN_IDS: '<@!123456789012345678>, 223456789012345678' }), ['123456789012345678', '223456789012345678']);
  assert.deepEqual(adminIds({ ADMIN_ID: '"123456789012345678"' }), ['123456789012345678']);
  assert.deepEqual(adminIds({ ADMIN_IDS: 'mann' }), []);
});

// ── the build's setup check (scripts/check-setup.mjs) ─────────────────────────────────────────────
import { checkSetup } from '../scripts/check-setup.mjs';

const GOOD = {
  SESSION_SECRET: SECRET, SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'sb_secret_abc',
  DISCORD_CLIENT_ID: '1234567890123456789', DISCORD_CLIENT_SECRET: 'shh', ADMIN_IDS: OWNER,
  VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'bomb.example',
};
async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await fn(); } finally { globalThis.fetch = real; }
}
const answer = ({ table = 200, tableBody = '[]', discord = 200, discordDown = false } = {}) => async (url, init) => {
  if (String(url).startsWith('https://db.example/rest/v1/bomb_users')) return new Response(tableBody, { status: table });
  if (url === 'https://discord.com/api/v10/oauth2/token') {
    if (discordDown) throw new TypeError('fetch failed');
    assert.match(init.headers.Authorization, /^Basic /);
    return new Response('{}', { status: discord });
  }
  throw new Error('unexpected ' + url);
};

test('setup check: good settings pass, and it names the Discord redirect to add', async () => {
  const { lines, problems } = await withFetch(answer(), () => checkSetup(GOOD));
  assert.deepEqual(problems, []);
  assert.ok(lines.some((l) => l.includes('https://bomb.example/api/auth/callback')));
  assert.ok(!lines.join('\n').includes(SECRET) && !lines.join('\n').includes('sb_secret_abc'), 'never prints a value');
});

test('setup check: a preview without settings says to use --prod', async () => {
  const { problems } = await checkSetup({ VERCEL_ENV: 'preview' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /vercel --prod/);
});

test('setup check: each wrong setting is named', async () => {
  const wrong = { ...GOOD, SESSION_SECRET: 'short', SUPABASE_SERVICE_KEY: 'sb_publishable_x', DISCORD_CLIENT_ID: 'mybot', ADMIN_IDS: 'mann' };
  const { problems } = await withFetch(answer(), () => checkSetup(wrong));
  assert.equal(problems.length, 4);
  assert.match(problems.join('\n'), /SESSION_SECRET is shorter/);
  assert.match(problems.join('\n'), /publishable/);
  assert.match(problems.join('\n'), /Application ID/);
  assert.match(problems.join('\n'), /ADMIN_IDS has no Discord user ID/);

  const noTable = await withFetch(answer({ table: 404, tableBody: '{"code":"PGRST205","message":"Could not find the table"}' }), () => checkSetup(GOOD));
  assert.match(noTable.problems.join('\n'), /bomb_users\.sql/);
  const badKey = await withFetch(answer({ table: 401, tableBody: '{"message":"Invalid API key"}' }), () => checkSetup(GOOD));
  assert.match(badKey.problems.join('\n'), /refused SUPABASE_SERVICE_KEY/);
  const badSecret = await withFetch(answer({ discord: 401 }), () => checkSetup(GOOD));
  assert.match(badSecret.problems.join('\n'), /Discord rejected/);
  const discordDown = await withFetch(answer({ discordDown: true }), () => checkSetup(GOOD));
  assert.deepEqual(discordDown.problems, [], 'Discord being unreachable during a build does not stop it');
});

// ── the OGs (OG_IDS) ──────────────────────────────────────────────────────────────────────────────
test('OG_IDS: OGs always get in, even when blocked, out of time or with the database down', async (t) => {
  assert.deepEqual(ogIds({ OG_IDS: '<@400000000000000004>, 500000000000000005' }), ['400000000000000004', '500000000000000005']);
  assert.equal(isOg(OWNER, { ADMIN_IDS: OWNER, OG_IDS: OWNER }), false, 'the owner stays the owner');
  process.env.OG_IDS = OG;
  process.env.NEW_USERS = 'wait';
  const { res, session } = await logIn('og', '/bomb');
  assert.equal(res.headers.get('location'), '/bomb', 'not left waiting');
  db.set(OG, { ...db.get(OG), status: 'blocked' }); // as if blocked by hand in Supabase
  assert.equal((await accessFor(OG, { fresh: true })).state, 'allowed');
  db.set(OG, { ...db.get(OG), status: 'allowed', expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await accessFor(OG, { fresh: true })).state, 'allowed');

  const info = await (await me.GET(req('/api/auth/me', asUser(session)))).json();
  assert.equal(info.og, true);
  assert.equal(info.admin, false);
  assert.deepEqual((await unlockAs(session)).account, { name: 'Yuki', admin: false, og: true, state: 'allowed' });

  dbDown = true;
  const quiet = console.error;
  console.error = () => {};
  t.after(() => { console.error = quiet; });
  assert.equal((await accessFor(OG, { fresh: true })).state, 'allowed');
});

test('OGs can look at /admin but change nothing; nobody can block the owner or an OG', async () => {
  process.env.OG_IDS = OG;
  const friend = await logIn('friend');
  const og = await logIn('og');
  const owner = await logIn('owner');

  const look = await admin.GET(req('/admin', asUser(og.session)));
  assert.equal(look.status, 200);
  const page = await look.text();
  assert.match(page, /View only/);
  assert.ok(page.includes('Friend'));
  assert.ok(!page.includes('<form'), 'no buttons for an OG');
  assert.ok(!page.includes('NEW_USERS'), 'no Vercel setup notes for an OG');

  const post = (session, id, action) => admin.POST(req('/admin', asUser(session, {
    method: 'POST', headers: { origin: SITE, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id, action }).toString(),
  })));
  assert.equal((await post(og.session, '200000000000000002', 'block')).status, 403, 'an OG cannot block');
  assert.equal(db.get('200000000000000002').status, 'allowed');

  const ownerPage = await (await admin.GET(req('/admin', asUser(owner.session)))).text();
  assert.match(ownerPage, /OG: always allowed/);
  assert.equal((ownerPage.match(/<form/g) || []).length, 1, 'a form for Friend only, not for the owner or the OG');
  const tried = await post(owner.session, OG, 'block');
  assert.match(tried.headers.get('location'), /err=protected/);
  assert.equal(db.get(OG).status, 'allowed');
  assert.match(await post(owner.session, OWNER, 'allow_1d').then((x) => x.headers.get('location')), /err=protected/);
  assert.equal(db.get(OWNER).expires_at, null);
});

// ── ⚑ wrong-answer reports ────────────────────────────────────────────────────────────────────────
const HOOK = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-0123456789';

test('REPORT_WEBHOOK has to be a Discord webhook link', () => {
  assert.equal(reportWebhook({ REPORT_WEBHOOK: HOOK }), HOOK);
  assert.equal(reportWebhook({ REPORT_WEBHOOK: ` "${HOOK}/" ` }), HOOK);
  assert.equal(reportWebhook({ REPORT_WEBHOOK: HOOK.replace('discord.com', 'discordapp.com') }), HOOK.replace('discord.com', 'discordapp.com'));
  assert.equal(reportWebhook({ REPORT_WEBHOOK: 'https://evil.example/api/webhooks/1/abc' }), '');
  assert.equal(reportWebhook({ REPORT_WEBHOOK: 'http://discord.com/api/webhooks/123456/abcdefghijklmnopqrstuvwxyz' }), '');
  assert.equal(reportWebhook({}), '');
});

test('a report with nothing pasted sends no pasted.txt / game-data.txt', () => {
  const { payload, files } = reportMessage({ who: { id: OG, name: 'Yuki' }, module: 'X', text: 'screen', pasted: '  ', game: '' });
  assert.deepEqual(files.map((f) => f.name), ['screen.txt']);
  assert.doesNotMatch(payload.content, /pasted\.txt|game-data\.txt/);
});

test('a report message pings nobody and fits in Discord', () => {
  const png = new Blob([new Uint8Array(10)], { type: 'image/png' });
  const { payload, files } = reportMessage({
    who: { id: OG, name: 'Yuki', handle: 'yuza6' }, module: '📡 MORSE (GIF)', card: '', answer: 'SHELL ```3.505``` @everyone',
    note: 'x'.repeat(5000) + ' @everyone', serial: 'AB1CD2', page: '/dixie', device: 'computer', text: 'screen', images: [png, png],
    pasted: '── paste 1 of 1 · 12:00:00 · ASTROLOGY · anywhere on the page (Ctrl+V) ──\nOrion 7', game: '── the serial ──\nAB1CD2',
  });
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.deepEqual(files.map((f) => f.name), ['picture-1.png', 'picture-2.png', 'screen.txt', 'pasted.txt', 'game-data.txt']);
  assert.deepEqual(payload.attachments.map((a) => a.id), [0, 1, 2, 3, 4]);
  assert.match(payload.content, /pasted\.txt/);
  assert.match(payload.content, /game-data\.txt/);
  const e = payload.embeds[0];
  assert.equal(e.image.url, 'attachment://picture-1.png');
  assert.ok(e.fields.every((f) => f.value.length <= 1024 && f.name.length <= 256));
  assert.ok(!e.fields[0].value.slice(3, -3).includes('```'), 'the answer cannot close its code block');
  assert.match(e.title, /MORSE/);
});

test('anyone can send a report (logged in or not), to the webhook, not too often', async (t) => {
  process.env.OG_IDS = OG;
  const quiet = console.error;
  console.error = () => {};
  t.after(() => { console.error = quiet; });
  const friend = await logIn('friend');
  const og = await logIn('og');
  let n = 0;
  const send = (session, { origin = SITE, images = 1, ip = '203.0.113.7' } = {}) => {
    const form = new FormData();
    form.append('module', '📡 MORSE (GIF)');
    form.append('answer', 'SHELL 3.505');
    form.append('note', 'should be SHELLS');
    form.append('text', 'MORSE CODE SOLVER\nSHELL 3.505');
    form.append('pasted', '── paste 1 of 1 · 12:00:00 · MORSE · box: serial ──\nAB1CD2');
    form.append('game', '── the serial (bombvision_serial) ──\nAB1CD2');
    for (let i = 0; i < images; i++) form.append('image', new Blob([new Uint8Array(20)], { type: 'image/png' }), 'p.png');
    form.append('image', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'x.svg'); // not a picture type it sends
    n++;
    return report.POST(req('/api/report', { ...(session ? asUser(session) : {}), method: 'POST', headers: { origin, 'x-forwarded-for': `${ip}, 10.0.0.1` }, body: form }));
  };

  assert.equal((await send(og.session, { origin: 'https://evil.example' })).status, 403);
  const off = await send(og.session);
  assert.equal(off.status, 503);
  assert.equal((await off.json()).error, 'setup');

  process.env.REPORT_WEBHOOK = HOOK;
  const sent = await send(og.session, { images: 9 });
  assert.equal(sent.status, 200);
  assert.equal(webhookCalls.length, 1);
  assert.equal(webhookCalls[0].url.searchParams.get('wait'), 'true');
  const body = webhookCalls[0].body;
  const payload = JSON.parse(body.get('payload_json'));
  assert.match(payload.content, /Yuki/);
  assert.match(payload.embeds[0].fields[1].value, /should be SHELLS/);
  const names = [...body.keys()].filter((k) => k.startsWith('files['));
  assert.equal(names.length, 9, '6 pictures (the most it sends; no SVG) + screen.txt, pasted.txt, game-data.txt');
  assert.ok(names.length <= 10, "Discord's most files in one message");
  const pastedFile = [...body.entries()].find(([k, v]) => k.startsWith('files[') && v.name === 'pasted.txt');
  assert.match(await pastedFile[1].text(), /AB1CD2/);
  assert.equal((await send(og.session)).status, 429, 'one every few seconds');

  // not an OG, not even logged in: both can send now
  assert.equal((await send(friend.session)).status, 200, 'a logged-in player');
  assert.match(JSON.parse(webhookCalls.at(-1).body.get('payload_json')).content, /Friend/);
  assert.equal((await send(null)).status, 200, 'a guest');
  const guest = JSON.parse(webhookCalls.at(-1).body.get('payload_json'));
  const tag = /Guest #([0-9a-f]{6})/.exec(guest.content)[1];
  assert.match(guest.embeds[0].fields[3].value, new RegExp(`Guest #${tag} \\(not logged in\\)`));
  assert.ok(!JSON.stringify(guest).includes('203.0.113.7'), 'the address itself is never sent');
  assert.ok(!JSON.stringify(guest).includes('<@'), 'no Discord mention for a guest');
  const again = await send(null, { ip: '198.51.100.9' });
  assert.equal(again.status, 200, 'another guest');
  assert.notEqual(/Guest #([0-9a-f]{6})/.exec(JSON.parse(webhookCalls.at(-1).body.get('payload_json')).content)[1], tag, 'another tag');
  assert.equal((await send(null)).status, 429, 'the first guest again, within seconds');
  assert.ok(n > 0);
});

test('a guest can send 10 reports an hour; the site at most 20 a minute', async (t) => {
  const { guestTag, GUEST_PER_HOUR, ALL_PER_MINUTE } = report;
  assert.equal(await guestTag('1.2.3.4', SECRET), await guestTag('1.2.3.4', SECRET));
  assert.notEqual(await guestTag('1.2.3.4', SECRET), await guestTag('1.2.3.5', SECRET));
  process.env.REPORT_WEBHOOK = HOOK;
  const realNow = Date.now;
  let clock = realNow() + 3 * 3600e3; // past anything the other tests sent
  Date.now = () => clock;
  t.after(() => { Date.now = realNow; });
  const send = (ip) => {
    const form = new FormData();
    form.append('answer', 'x');
    return report.POST(req('/api/report', { method: 'POST', headers: { origin: SITE, 'x-forwarded-for': ip }, body: form }));
  };
  for (let i = 0; i < GUEST_PER_HOUR; i++) {
    clock += 6000;
    assert.equal((await send('192.0.2.1')).status, 200, `report ${i + 1}`);
  }
  clock += 6000;
  const over = await send('192.0.2.1');
  assert.equal(over.status, 429);
  assert.equal((await over.json()).error, 'hourly');
  clock += 3600e3;
  assert.equal((await send('192.0.2.1')).status, 200, 'an hour later');

  // many guests at once: the site stops at ALL_PER_MINUTE (Discord takes 30 a minute per webhook)
  clock += 120e3;
  let ok = 0, busy = 0;
  for (let i = 0; i < ALL_PER_MINUTE + 5; i++) {
    const r = await send(`198.18.0.${i}`);
    if (r.status === 200) ok++;
    else if ((await r.json()).error === 'busy') busy++;
  }
  assert.equal(ok, ALL_PER_MINUTE);
  assert.equal(busy, 5);
});

test('a deleted webhook is reported as gone', async (t) => {
  process.env.ADMIN_IDS = OWNER;
  process.env.REPORT_WEBHOOK = HOOK;
  const quiet = console.error;
  console.error = () => {};
  t.after(() => { console.error = quiet; });
  webhookStatus = 404;
  const owner = await logIn('owner');
  const form = new FormData();
  form.append('answer', 'x');
  const r = await report.POST(req('/api/report', asUser(owner.session, { method: 'POST', headers: { origin: SITE }, body: form })));
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, 'webhook-gone');
});
