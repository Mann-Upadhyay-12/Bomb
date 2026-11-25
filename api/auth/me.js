// GET /api/auth/me → who this browser is logged in as and whether they may use the site (the /login
// page shows it). { state: 'guest'|'allowed'|'waiting'|'blocked'|'expired'|'error', name, id, … }
import { readSession, sessionSecret } from '../../lib/session.js';
import { discordReady } from '../../lib/discord.js';
import { accessFor, avatarUrl, databaseReady } from '../../lib/users.js';
import { json } from '../../lib/web.js';

export async function GET(request) {
  const secret = sessionSecret();
  const ready = !!secret && discordReady() && databaseReady();
  const s = secret ? await readSession(request, secret) : null;
  if (!s) return json({ state: 'guest', ready });
  try {
    const a = await accessFor(s.id, { fresh: true });
    return json({
      state: a.state === 'unknown' ? 'guest' : a.state,
      ready,
      id: s.id,
      name: a.user?.username || s.name,
      avatar: avatarUrl(s.id, a.user?.avatar),
      admin: a.admin,
      og: a.og,
      expires_at: a.user?.expires_at || null,
    });
  } catch (e) {
    console.error('Access check failed', e);
    return json({ state: 'error', ready, id: s.id, name: s.name }, 503);
  }
}
