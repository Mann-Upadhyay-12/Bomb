// GET /api/auth/callback?code=…&state=… — Discord sends the browser back here after "Authorize".
// Checks the state, asks Discord who this is, adds or updates them in bomb_users, sets the session.
import { SESSION_COOKIE, SESSION_DAYS, STATE_COOKIE, cookie, newSession, parseCookies, safeNext, sessionSecret, signToken, verifyToken } from '../../lib/session.js';
import { discordUser } from '../../lib/discord.js';
import { accessOf, createUser, getUser, isLockProof, newUserStatus, updateUser } from '../../lib/users.js';
import { redirect } from '../../lib/web.js';

const fail = (why) => redirect(`/login?error=${why}`, [cookie(STATE_COOKIE, '', 0)]);

export async function GET(request) {
  const secret = sessionSecret();
  if (!secret) return fail('setup');
  const q = new URL(request.url).searchParams;
  if (q.get('error')) return fail(q.get('error') === 'access_denied' ? 'cancelled' : 'discord');
  const pending = await verifyToken(parseCookies(request.headers.get('cookie'))[STATE_COOKIE], secret);
  if (!pending || pending.exp < Date.now() || !q.get('state') || pending.state !== q.get('state')) return fail('state');
  if (!q.get('code')) return fail('discord');

  let who;
  try { who = await discordUser(request, q.get('code')); }
  catch (e) { return fail(e.message); }

  let user;
  try {
    const now = new Date().toISOString();
    const known = await getUser(who.id);
    const fields = { username: who.name, handle: who.handle, avatar: who.avatar, last_seen: now };
    user = known
      ? await updateUser(who.id, fields)
      : await createUser({ discord_id: who.id, ...fields, status: isLockProof(who.id) ? 'allowed' : newUserStatus() });
  } catch (e) {
    console.error('Saving the user failed', e);
    if (!isLockProof(who.id)) return fail('db'); // the owner and the OGs get in without the database
  }

  const session = await signToken(newSession(who), secret);
  const allowed = isLockProof(who.id) || accessOf(user) === 'allowed';
  return redirect(allowed ? safeNext(pending.next) : '/login', [
    cookie(SESSION_COOKIE, session, SESSION_DAYS * 86400),
    cookie(STATE_COOKIE, '', 0),
  ]);
}
