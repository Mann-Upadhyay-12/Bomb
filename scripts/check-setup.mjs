#!/usr/bin/env node
// Checks the website's login settings at the start of a Vercel build (vercel.json runs it first). The
// settings are marked Sensitive in Vercel, so the build is the only place that can see them. Prints
// ✓ / ✗ per setting (never a value) and stops the build when logging in couldn't work, so a typo never
// replaces the live site with one where nobody can log in (rooms and /admin need it; the solver doesn't).
//
//   SESSION_SECRET          32+ characters
//   SUPABASE_URL            answers, and the table bomb_users exists (supabase/bomb_users.sql)
//   SUPABASE_SERVICE_KEY    the secret key (not the publishable / anon one), accepted by Supabase
//   DISCORD_CLIENT_ID/SECRET accepted by Discord (a client-credentials token request)
//   ADMIN_IDS               holds a Discord user ID
//   OG_IDS, REPORT_WEBHOOK  optional (the OGs; where ⚑ reports go): a note when one is set but unusable
//   rooms                   optional: the room tables (supabase/bomb_rooms.sql) and SUPABASE_PUBLISHABLE_KEY
//
// SKIP_SETUP_CHECK=1 skips it.
import { pathToFileURL } from 'node:url';
import { sessionSecret } from '../lib/session.js';
import { TABLE, adminIds, ogIds, publicKeyMistake } from '../lib/users.js';
import { reportWebhook } from '../lib/report.js';
import { siteUrl } from './lock-site.mjs';

const clean = (s) => String(s || '').trim().replace(/^["']|["']$/g, '');
const SETTINGS = ['SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'ADMIN_IDS'];

/** { lines, problems }: problems is empty when the login can work. */
export async function checkSetup(env = process.env, { timeout = 15000 } = {}) {
  const lines = [];
  const problems = [];
  const ok = (m) => lines.push(`  ✓ ${m}`);
  const bad = (m) => { lines.push(`  ✗ ${m}`); problems.push(m); };
  const note = (m) => lines.push(`  ? ${m}`);

  if (env.VERCEL_ENV === 'preview' && SETTINGS.every((k) => !clean(env[k]) && !(k === 'SUPABASE_URL' && env.NEXT_PUBLIC_SUPABASE_URL))) {
    bad('this is a Preview build, and the login settings are set for Production only. Deploy with `vercel --prod`, '
      + 'or tick Preview on each setting in Vercel too (logging in on a preview address also needs its own Discord redirect).');
    return { lines, problems };
  }

  // the session secret
  if (sessionSecret(env)) ok('SESSION_SECRET');
  else bad(clean(env.SESSION_SECRET) ? 'SESSION_SECRET is shorter than 32 characters: make one with `openssl rand -hex 32`' : 'SESSION_SECRET is not set');

  // Supabase
  const url = clean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = clean(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY);
  const urlOk = /^https:\/\/[^/\s]+$/.test(url);
  if (!url) bad('SUPABASE_URL is not set');
  else if (!urlOk) bad('SUPABASE_URL should look like https://xxxx.supabase.co (the Project URL)');
  else ok('SUPABASE_URL looks right');
  if (!key) bad('SUPABASE_SERVICE_KEY is not set');
  else if (publicKeyMistake(key)) bad('SUPABASE_SERVICE_KEY is the public (publishable / anon) key: use the secret key (sb_secret_…), Project Settings → API Keys');
  if (urlOk && key && !publicKeyMistake(key)) {
    try {
      const r = await fetch(`${url}/rest/v1/${TABLE}?select=discord_id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(timeout),
      });
      const text = r.ok ? '' : await r.text();
      if (r.ok) ok(`Supabase: the ${TABLE} table answers`);
      else if (/PGRST205|42P01|does not exist|Could not find the table/i.test(text) || r.status === 404) {
        bad(`Supabase has no ${TABLE} table: paste supabase/bomb_users.sql into the SQL Editor and Run`);
      } else if (r.status === 401 || r.status === 403) bad('Supabase refused SUPABASE_SERVICE_KEY: copy the secret key again (it may belong to another project)');
      else bad(`Supabase answered ${r.status}: ${text.slice(0, 160)}`);
    } catch (e) {
      bad(`Supabase didn't answer (${e.cause?.code || e.name}): check SUPABASE_URL, or restore the project if it is paused (supabase.com)`);
    }
    // optional: rooms (lib/rooms.js). Without them 👥 ROOM says rooms aren't set up; the rest works
    try {
      const r = await fetch(`${url}/rest/v1/bomb_room_items?select=key&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(timeout),
      });
      if (r.ok) ok('Supabase: the room tables answer');
      else note('Supabase has no room tables: paste supabase/bomb_rooms.sql into the SQL Editor and Run, for 👥 ROOM (optional)');
    } catch (e) { note("Supabase didn't answer about the room tables (optional)"); }
  }
  // optional: the public key the apps listen with (Realtime). Without it rooms still work, by checking every 4 s
  const publicKey = clean(env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (publicKey) ok('SUPABASE_PUBLISHABLE_KEY (rooms update live)');
  else note('SUPABASE_PUBLISHABLE_KEY is not set: rooms update every 4 s instead of live (optional; Project Settings → API Keys → Publishable key)');

  // Discord
  const id = clean(env.DISCORD_CLIENT_ID);
  const secret = clean(env.DISCORD_CLIENT_SECRET);
  const idOk = /^\d{15,25}$/.test(id);
  if (!id) bad('DISCORD_CLIENT_ID is not set');
  else if (!idOk) bad('DISCORD_CLIENT_ID should be the Application ID (a long number), from the Discord app → OAuth2 → Client ID');
  if (!secret) bad('DISCORD_CLIENT_SECRET is not set');
  if (idOk && secret) {
    try {
      const r = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' }),
        signal: AbortSignal.timeout(timeout),
      });
      if (r.ok) ok('Discord accepts DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET');
      else if (r.status === 401) bad('Discord rejected DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET: in the Discord app → OAuth2, Reset Secret and paste the new one (and check the Client ID)');
      else note(`Discord answered ${r.status}, so the client secret couldn't be checked; carrying on`);
    } catch (e) {
      note(`Discord didn't answer (${e.cause?.code || e.name}), so the client secret couldn't be checked; carrying on`);
    }
  }

  // the owner
  const admins = adminIds(env);
  if (admins.length) ok(`ADMIN_IDS: ${admins.length} owner${admins.length > 1 ? 's' : ''}`);
  else bad(clean(env.ADMIN_IDS) ? 'ADMIN_IDS has no Discord user ID (the long number) in it' : 'ADMIN_IDS is not set: your Discord user ID, or nobody can open /admin');

  // optional: the OGs, and the Discord channel the ⚑ wrong-answer reports go to (neither stops the build)
  const ogs = ogIds(env);
  if (ogs.length) ok(`OG_IDS: ${ogs.length} OG${ogs.length > 1 ? 's' : ''}`);
  else note(clean(env.OG_IDS) ? 'OG_IDS has no Discord user ID (the long number) in it, so nobody is an OG' : 'OG_IDS is not set: nobody is an OG (optional)');
  if (reportWebhook(env)) ok('REPORT_WEBHOOK');
  else note(clean(env.REPORT_WEBHOOK) ? "REPORT_WEBHOOK isn't a Discord webhook link (https://discord.com/api/webhooks/…), so ⚑ reports can't be sent"
    : 'REPORT_WEBHOOK is not set: the ⚑ wrong-answer button says reports are off (optional)');

  const site = siteUrl(env);
  if (site) lines.push(`  · Discord app → OAuth2 → Redirects must list ${site}/api/auth/callback (this can't be checked from here)`);
  return { lines, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.env.SKIP_SETUP_CHECK === '1') {
    console.log('check-setup: skipped (SKIP_SETUP_CHECK=1)');
  } else {
    const { lines, problems } = await checkSetup();
    console.log(`check-setup: the website's login settings\n${lines.join('\n')}`);
    if (problems.length) {
      console.error(`\ncheck-setup: ${problems.length} to fix in Vercel → Settings → Environment Variables (or Supabase / Discord), then deploy again.\n`
        + 'The build stops here, so the site you have now stays as it is.');
      process.exit(1);
    }
  }
}
