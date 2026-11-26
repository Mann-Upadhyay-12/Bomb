// POST /api/unlock {salt} → the key that opens this page's sealed code (scripts/lock-site.mjs). Everyone
// gets it, logged in or not (login is only needed for rooms). Only this site's own pages can ask:
// another site, or a saved copy opened from a file, gets nothing.
//
// → { key, account }. account is null for a guest. For someone logged in it's
// { name, admin, og, state }; state is their access to rooms ('allowed' | 'waiting' | 'blocked' |
// 'expired' | 'error' when the database couldn't be asked). The solver itself never depends on it.
import { bytesToB64, lockKey, readSession, sessionSecret } from '../lib/session.js';
import { accessFor, updateUser } from '../lib/users.js';
import { json, sameOrigin } from '../lib/web.js';

const SEEN_EVERY_MS = 10 * 60e3;

/** The logged-in account for the page, or null. Never throws: the solver opens either way. */
async function accountOf(request, secret) {
  const s = await readSession(request, secret);
  if (!s) return null;
  let a;
  try { a = await accessFor(s.id); }
  catch (e) {
    console.error('Access check failed', e);
    return { name: s.name, admin: false, og: false, state: 'error' };
  }
  // "last seen" for the admin page, written at most every few minutes
  const seen = Date.parse(a.user?.last_seen || 0) || 0;
  if (a.user && Date.now() - seen > SEEN_EVERY_MS) {
    await updateUser(s.id, { last_seen: new Date().toISOString() }).catch((e) => console.error('last_seen', e));
  }
  return { name: a.user?.username || s.name, admin: a.admin, og: a.og, state: a.state === 'unknown' ? 'waiting' : a.state };
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403);
  const secret = sessionSecret();
  if (!secret) return json({ error: 'setup' }, 503);

  const body = await request.json().catch(() => ({}));
  const salt = String(body?.salt || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(salt)) return json({ error: 'salt' }, 400);

  return json({
    key: bytesToB64(await lockKey(secret, salt)),
    account: await accountOf(request, secret),
  });
}
