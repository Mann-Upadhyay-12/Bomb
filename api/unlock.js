// POST /api/unlock {salt} → the key that opens this page's sealed code (scripts/lock-site.mjs), for a
// logged-in user who is allowed in. Only this site's own pages can ask: another site, or a saved copy
// opened from a file, gets nothing.
import { bytesToB64, lockKey, readSession, sessionSecret } from '../lib/session.js';
import { accessFor, updateUser } from '../lib/users.js';
import { json, sameOrigin } from '../lib/web.js';

const SEEN_EVERY_MS = 10 * 60e3;

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403);
  const secret = sessionSecret();
  if (!secret) return json({ error: 'setup' }, 503);
  const s = await readSession(request, secret);
  if (!s) return json({ state: 'guest' }, 401);

  let a;
  try { a = await accessFor(s.id); }
  catch (e) { console.error('Access check failed', e); return json({ error: 'db' }, 503); }
  if (a.state !== 'allowed') return json({ state: a.state }, 403);

  const body = await request.json().catch(() => ({}));
  const salt = String(body?.salt || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(salt)) return json({ error: 'salt' }, 400);

  // "last seen" for the admin page, written at most every few minutes
  const seen = Date.parse(a.user?.last_seen || 0) || 0;
  if (a.user && Date.now() - seen > SEEN_EVERY_MS) {
    await updateUser(s.id, { last_seen: new Date().toISOString() }).catch((e) => console.error('last_seen', e));
  }

  return json({
    key: bytesToB64(await lockKey(secret, salt)),
    account: { name: a.user?.username || s.name, admin: a.admin, og: a.og },
  });
}
