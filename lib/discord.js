// "Log in with Discord" (OAuth2, scope identify: Discord tells us who you are, nothing else).
//
// Environment:
//   DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET   from discord.com/developers → your app → OAuth2
//   DISCORD_REDIRECT_URI (optional)            default: <this site>/api/auth/callback; it must be listed
//                                              under Redirects in the Discord app, exactly

const clean = (s) => String(s || '').trim().replace(/^["']|["']$/g, '');

export function discordReady(env = process.env) {
  return !!(clean(env.DISCORD_CLIENT_ID) && clean(env.DISCORD_CLIENT_SECRET));
}

export function redirectUri(request, env = process.env) {
  return clean(env.DISCORD_REDIRECT_URI) || new URL('/api/auth/callback', request.url).href;
}

export function authorizeUrl(request, state, env = process.env) {
  const q = new URLSearchParams({
    client_id: clean(env.DISCORD_CLIENT_ID),
    redirect_uri: redirectUri(request, env),
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'none', // someone who already said yes once isn't asked again
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

/** The Discord user behind an OAuth code: { id, name, handle, avatar }. Throws a short reason. */
export async function discordUser(request, code, env = process.env) {
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clean(env.DISCORD_CLIENT_ID),
      client_secret: clean(env.DISCORD_CLIENT_SECRET),
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(request, env),
    }),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!token.access_token) {
    console.error('Discord token exchange failed', tokenRes.status, token);
    throw new Error(token.error === 'invalid_client' ? 'discord_secret' : 'discord_token');
  }
  const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } });
  const u = await userRes.json().catch(() => ({}));
  if (!userRes.ok || !u.id) {
    console.error('Discord user lookup failed', userRes.status, u);
    throw new Error('discord_user');
  }
  return { id: String(u.id), name: u.global_name || u.username, handle: u.username, avatar: u.avatar || null };
}
