// GET /api/auth/login?next=/path → Discord's "Authorize" screen. A signed cookie remembers the login in
// progress (a random state Discord must send back, and the page to return to).
import { STATE_COOKIE, cookie, safeNext, sessionSecret, signToken } from '../../lib/session.js';
import { authorizeUrl, discordReady } from '../../lib/discord.js';
import { databaseReady } from '../../lib/users.js';
import { redirect } from '../../lib/web.js';

export async function GET(request) {
  const secret = sessionSecret();
  if (!secret || !discordReady() || !databaseReady()) return redirect('/login?error=setup');
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const state = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url');
  const pending = await signToken({ state, next, exp: Date.now() + 10 * 60e3 }, secret);
  return redirect(authorizeUrl(request, state), [cookie(STATE_COOKIE, pending, 600)]);
}
