// Who may use the site. Users live in Supabase, table bomb_users (supabase/bomb_users.sql makes it);
// the server talks to it with the service key, so the table stays closed to everyone else.
//
// Environment (Vercel → Settings → Environment Variables):
//   SUPABASE_URL           https://xxxx.supabase.co (NEXT_PUBLIC_SUPABASE_URL also works)
//   SUPABASE_SERVICE_KEY   the SECRET key, sb_secret_… or the legacy service_role key (SUPABASE_SECRET_KEY and
//                          SUPABASE_SERVICE_ROLE_KEY also work). Not the publishable / anon key.
//   ADMIN_IDS              the owner's Discord user ID (the number; <@123…> works too), several comma-separated:
//                          always let in, can open /admin
//   OG_IDS                 optional, same format: the OGs (Yuza and Dixie, the first two players): always let in
//                          like the owner, can't be blocked or time-limited, can look at /admin (not change it)
//                          and get the ⚑ wrong-answer button (api/report.js)
//   NEW_USERS              "allow" (default): a first login gets in at once; "wait": it waits for /admin

export const TABLE = 'bomb_users';

const clean = (s) => String(s || '').trim().replace(/^["']|["']$/g, '');

function supabase(env = process.env) {
  const url = clean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = clean(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY);
  return url && key ? { url, key } : null;
}

export function databaseReady(env = process.env) { return !!supabase(env); }

/** The public key (publishable sb_publishable_…, or the old anon JWT) can't read bomb_users: say so. */
export function publicKeyMistake(key) {
  if (key.startsWith('sb_publishable_')) return true;
  try { return JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString()).role === 'anon'; } catch { return false; }
}

async function rest(path, init = {}) {
  const db = supabase();
  if (!db) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set');
  if (publicKeyMistake(db.key)) {
    throw new Error('SUPABASE_SERVICE_KEY holds the public (publishable / anon) key, which cannot read the users table. '
      + 'Use the secret key: Supabase → Project Settings → API Keys → Secret keys (sb_secret_…), or the legacy service_role key.');
  }
  const res = await fetch(`${db.url}/rest/v1/${path}`, {
    ...init,
    // the secret key goes in both headers (Supabase accepts a non-JWT Bearer only when it equals apikey)
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

const byId = (id) => `${TABLE}?discord_id=eq.${encodeURIComponent(id)}`;

export async function getUser(id) {
  const rows = await rest(`${byId(id)}&select=*`);
  return rows[0] || null;
}
export async function listUsers() {
  return rest(`${TABLE}?select=*&order=created_at.desc`);
}
export async function createUser(row) {
  const rows = await rest(TABLE, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
  forget(row.discord_id);
  return rows[0];
}
export async function updateUser(id, fields) {
  const rows = await rest(byId(id), { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(fields) });
  forget(id);
  return rows[0] || null;
}

export function adminIds(env = process.env) {
  return clean(env.ADMIN_IDS || env.ADMIN_ID).match(/\d{5,25}/g) || []; // "123…", "<@123…>", "a, b": just the numbers
}
export const isAdmin = (id, env = process.env) => adminIds(env).includes(String(id));

export function ogIds(env = process.env) {
  return clean(env.OG_IDS).match(/\d{5,25}/g) || [];
}
export const isOg = (id, env = process.env) => !isAdmin(id, env) && ogIds(env).includes(String(id));
/** The owner and the OGs: always let in, never blocked or time-limited. */
export const isLockProof = (id, env = process.env) => isAdmin(id, env) || isOg(id, env);

/** The status a first login gets. */
export function newUserStatus(env = process.env) {
  return /^wait/i.test(clean(env.NEW_USERS)) ? 'waiting' : 'allowed';
}

/** A user's row → 'allowed' | 'waiting' | 'blocked' | 'expired' | 'unknown' (no row). */
export function accessOf(user, now = Date.now()) {
  if (!user) return 'unknown';
  if (user.status === 'allowed') return user.expires_at && Date.parse(user.expires_at) <= now ? 'expired' : 'allowed';
  if (user.status === 'waiting') return 'waiting';
  return 'blocked';
}

// One visit asks several times (the page, then its unlock): remember each answer for a few seconds.
// A block made in /admin reaches every server within ACCESS_MEMORY_MS.
export const ACCESS_MEMORY_MS = 20_000;
const memory = new Map();
function forget(id) { memory.delete(String(id)); }

/**
 * { state, admin, og, user } for a Discord ID. The owner (ADMIN_IDS) and the OGs (OG_IDS) are always
 * let in, even when the database can't be reached. Throws when the database fails for anyone else.
 */
export async function accessFor(id, { fresh = false, now = Date.now() } = {}) {
  id = String(id);
  const admin = isAdmin(id);
  const og = isOg(id);
  const kept = memory.get(id);
  if (!fresh && kept && now - kept.at < ACCESS_MEMORY_MS) return kept.value;
  let user;
  try { user = await getUser(id); }
  catch (e) { if (admin || og) return { state: 'allowed', admin, og, user: null }; throw e; }
  const value = { state: admin || og ? 'allowed' : accessOf(user, now), admin, og, user };
  memory.set(id, { at: now, value });
  if (memory.size > 500) memory.delete(memory.keys().next().value);
  return value;
}

/** The changes an /admin action makes to a user. */
export function adminChange(action, now = Date.now()) {
  const days = { allow_1d: 1, allow_7d: 7, allow_30d: 30 }[action];
  if (action === 'allow') return { status: 'allowed', expires_at: null };
  if (days) return { status: 'allowed', expires_at: new Date(now + days * 864e5).toISOString() };
  if (action === 'block') return { status: 'blocked' };
  if (action === 'wait') return { status: 'waiting' };
  return null;
}

export function avatarUrl(id, avatar) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`;
  let n = 0;
  try { n = Number((BigInt(id) >> 22n) % 6n); } catch {}
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
}
