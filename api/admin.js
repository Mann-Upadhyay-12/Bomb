// /admin (vercel.json rewrites it here): the owner's page. Lists everyone who has logged in and lets you
// allow them (no limit, or for 1 / 7 / 30 days) or block them. Only Discord IDs in ADMIN_IDS can change
// anything; the OGs (OG_IDS) can open it to look. Nobody can block or time-limit the owner or an OG.
import { readSession, sessionSecret } from '../lib/session.js';
import { ACCESS_MEMORY_MS, accessOf, adminChange, avatarUrl, isAdmin, isLockProof, isOg, listUsers, updateUser } from '../lib/users.js';
import { esc, html, page, redirect, sameOrigin } from '../lib/web.js';

const ACTIONS = [
  ['allow', 'Allow (no limit)'],
  ['allow_1d', 'Allow for 1 day'],
  ['allow_7d', 'Allow for 7 days'],
  ['allow_30d', 'Allow for 30 days'],
  ['block', 'Block'],
];
const DONE = { allow: 'allowed with no limit', allow_1d: 'allowed for 1 day', allow_7d: 'allowed for 7 days', allow_30d: 'allowed for 30 days', block: 'blocked' };

async function who(request) {
  const secret = sessionSecret();
  return secret ? readSession(request, secret) : null;
}

function notAdmin(s) {
  return html(page('Admin', `<h1>ADMIN</h1><div class="card">
<p>You're logged in as <b>${esc(s.name)}</b>, but this page is only for the site's owner.</p>
<p class="dim">If you are the owner: in Vercel open the project → Settings → Environment Variables, add
<code>ADMIN_IDS</code> = <code>${esc(s.id)}</code> (your Discord ID), then redeploy.</p>
<p><a class="btn ghost" href="/">Back to the solver</a></p></div>`), 403);
}

export async function POST(request) {
  const s = await who(request);
  if (!s || !isAdmin(s.id)) return html('Forbidden', 403);
  if (!sameOrigin(request)) return html('Forbidden: this form only works from the admin page', 403);
  const form = await request.formData();
  const id = String(form.get('id') || '');
  const action = String(form.get('action') || '');
  const change = adminChange(action);
  if (!/^\d{5,25}$/.test(id) || !change) return redirect('/admin?err=bad', [], 303);
  if (isLockProof(id)) return redirect('/admin?err=protected', [], 303);
  try {
    const u = await updateUser(id, change);
    if (!u) return redirect('/admin?err=missing', [], 303);
    return redirect(`/admin?done=${action}&who=${encodeURIComponent(u.username || id)}`, [], 303);
  } catch (e) {
    console.error('Admin update failed', e);
    return redirect('/admin?err=db', [], 303);
  }
}

const when = (iso) => iso ? `<time datetime="${esc(iso)}">${esc(new Date(iso).toISOString().slice(0, 16).replace('T', ' '))} UTC</time>` : '—';

function badge(u, now) {
  const a = accessOf(u, now);
  if (a === 'allowed' && u.expires_at) return `<span class="b lim">Allowed · <time class="left" datetime="${esc(u.expires_at)}">until ${esc(u.expires_at.slice(0, 10))}</time></span>`;
  return { allowed: '<span class="b ok">Allowed</span>', waiting: '<span class="b wait">Waiting</span>', blocked: '<span class="b no">Blocked</span>', expired: '<span class="b exp">Time ran out</span>' }[a];
}

function row(u, now, me, viewOnly) {
  const owner = isAdmin(u.discord_id);
  const og = isOg(u.discord_id);
  const pick = accessOf(u, now) === 'allowed' ? 'block' : 'allow'; // the likely next step comes preselected
  const actions = owner ? `<span class="dim">Owner: always allowed</span>`
    : og ? `<span class="dim">OG: always allowed</span>`
    : viewOnly ? `<span class="dim">View only</span>`
    : `<form method="post" action="/admin"><input type="hidden" name="id" value="${esc(u.discord_id)}">
<select name="action" aria-label="Change access for ${esc(u.username)}">${ACTIONS.map(([v, l]) => `<option value="${v}"${v === pick ? ' selected' : ''}>${l}</option>`).join('')}</select>
<button class="btn" type="submit">Save</button></form>`;
  return `<tr data-state="${accessOf(u, now)}">
<td><div class="who"><img src="${esc(avatarUrl(u.discord_id, u.avatar))}" alt="" width="36" height="36" loading="lazy">
<div><b>${esc(u.username || '?')}</b>${u.discord_id === me ? ' <span class="dim">(you)</span>' : ''}<div class="dim">@${esc(u.handle || '?')} · ${esc(u.discord_id)}</div></div></div></td>
<td>${owner ? '<span class="b owner">OWNER</span>' : og ? '<span class="b og">OG</span>' : badge(u, now)}</td>
<td class="dim"><span class="lbl">Joined </span>${when(u.created_at)}</td>
<td class="dim"><span class="lbl">Last seen </span>${when(u.last_seen)}</td>
<td>${actions}</td></tr>`;
}

export async function GET(request) {
  const s = await who(request);
  if (!s) return redirect('/login?next=/admin');
  if (!isAdmin(s.id) && !isOg(s.id)) return notAdmin(s);
  const viewOnly = !isAdmin(s.id); // an OG: sees the list, changes nothing

  let users;
  try { users = await listUsers(); }
  catch (e) {
    console.error('Listing users failed', e);
    return html(page('Admin', `<h1>ADMIN</h1><div class="card"><p>Couldn't read the user list from Supabase.</p>
<p class="dim">${esc(e.message)}</p><p class="dim">A free Supabase project pauses after a week without use: open it at supabase.com and press Restore.</p></div>`), 503);
  }
  const now = Date.now();
  const order = { waiting: 0, expired: 1, allowed: 2, blocked: 3 };
  users.sort((a, b) => order[accessOf(a, now)] - order[accessOf(b, now)] || String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
  const count = (st) => users.filter((u) => !isLockProof(u.discord_id) && accessOf(u, now) === st).length;
  const q = new URL(request.url).searchParams;
  const note = viewOnly
    ? `<p class="note og">View only: you can see who uses the site. Only the owner can change who gets in.</p>`
    : q.get('done') && DONE[q.get('done')]
    ? `<p class="note ok">${esc(q.get('who'))} ${DONE[q.get('done')]}. It applies to their next page load (within ${ACCESS_MEMORY_MS / 1000} s).</p>`
    : q.get('err') === 'protected' ? `<p class="note no">The owner and the OGs can't be blocked or time-limited.</p>`
    : q.get('err') ? `<p class="note no">That didn't save (${esc(q.get('err'))}). Try again.</p>` : '';

  const body = `<h1>ADMIN · WHO CAN USE THE SITE</h1>
${note}
<div class="stats">
<div><b>${count('allowed')}</b>allowed</div><div><b>${count('waiting')}</b>waiting</div>
<div><b>${count('expired')}</b>time ran out</div><div><b>${count('blocked')}</b>blocked</div></div>
<div class="card flush"><table>
<thead><tr><th>User</th><th>Access</th><th>Joined</th><th>Last seen</th><th>Change</th></tr></thead>
<tbody>${users.map((u) => row(u, now, s.id, viewOnly)).join('') || '<tr><td colspan="5" class="dim">Nobody has logged in yet.</td></tr>'}</tbody>
</table></div>
<p class="dim foot">${viewOnly
    ? `New logins <b>${/^wait/i.test(process.env.NEW_USERS || '') ? 'wait here until the owner allows them' : 'get in straight away'}</b>.`
    : `New logins: <b>${/^wait/i.test(process.env.NEW_USERS || '') ? 'wait here until you allow them' : 'get in straight away'}</b>
(Vercel setting <code>NEW_USERS</code>: <code>allow</code> or <code>wait</code>). Blocking someone stops their next page load; a page they already have open keeps working until they close it.`}
· <a href="/">Solver</a> · <a href="/api/auth/logout">Log out</a></p>
<style>
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 14px}
.stats div{background:#1d2027;border:1px solid #333845;border-radius:12px;padding:10px 12px;color:#9aa0ab;font-size:12px}
.stats b{display:block;font:700 22px 'IBM Plex Mono',monospace;color:#e8e6e1}
.card.flush{padding:0;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{text-align:left;font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:#9aa0ab;text-transform:uppercase;padding:10px 14px;border-bottom:1px solid #333845}
td{padding:12px 14px;border-bottom:1px solid #2a2e37;vertical-align:middle}
tr:last-child td{border-bottom:0}
.who{display:flex;gap:10px;align-items:center}.who img{border-radius:50%;background:#333845;flex:none}
.b{display:inline-block;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:600;white-space:nowrap}
.ok{background:rgba(110,200,140,.14);color:#7fd49a}.lim{background:rgba(120,180,240,.14);color:#8cc0f0}
.wait{background:rgba(217,163,91,.16);color:#e6b874}.no{background:rgba(235,110,110,.14);color:#f08a8a}
.exp{background:rgba(160,160,170,.14);color:#b8bcc6}
.og{background:linear-gradient(90deg,rgba(142,197,255,.16),rgba(196,177,242,.2));color:#c8bdf5}
/* the owner: Cyberpunk 2077's yellow, with its red corner and cyan edge */
.b.owner{border-radius:0;letter-spacing:.14em;font-family:'IBM Plex Mono',monospace;color:#0F0A0F;background:linear-gradient(225deg,#FD0130 0 7px,#FCEE0A 7px);box-shadow:inset 3px 0 0 #00F0FF;text-shadow:1px 0 rgba(253,1,48,.55),-1px 0 rgba(0,240,255,.55)}
form{display:flex;gap:6px;flex-wrap:wrap}
select{background:#14161b;color:#e8e6e1;border:1px solid #3a3f4b;border-radius:9px;padding:8px;font:14px system-ui,sans-serif}
.btn{padding:8px 14px}
.note{border-radius:10px;padding:10px 14px;margin:0 0 14px;font-size:14px}
.foot{margin-top:14px} .foot code{word-break:normal;white-space:nowrap}
.lbl{display:none}
@media (max-width:720px){
  .stats{grid-template-columns:repeat(2,1fr)}
  thead{display:none} table,tbody,tr,td{display:block;width:100%}
  tr{padding:12px 14px;border-bottom:1px solid #2a2e37} td{padding:4px 0;border:0}
  .lbl{display:inline}
}
</style>
<script>
// "until …" → "3d 4h left" in the viewer's own time
for (const t of document.querySelectorAll('time.left')) {
  const ms = Date.parse(t.dateTime) - Date.now(), h = Math.floor(ms / 36e5);
  t.textContent = ms <= 0 ? 'ended' : h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h left' : h + 'h ' + Math.floor(ms % 36e5 / 6e4) + 'm left';
  t.title = new Date(t.dateTime).toLocaleString();
}
for (const t of document.querySelectorAll('td time:not(.left)')) { t.textContent = new Date(t.dateTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
</script>`;
  return html(page('Admin · Bomb Vision', body, { wide: true }));
}
