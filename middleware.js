// Vercel Routing Middleware: runs before every page and file of the site (not /api, /login, /admin,
// which check for themselves). Only a logged-in user who is allowed in gets through; everyone else
// is sent to /login (pages) or refused (files).
import { readSession, sessionSecret } from './lib/session.js';
import { accessFor } from './lib/users.js';

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api/|login|admin|favicon\\.ico).*)'],
};

export default async function middleware(request) {
  const secret = sessionSecret();
  const s = secret ? await readSession(request, secret) : null;
  let state = 'guest';
  if (s) {
    try { state = (await accessFor(s.id)).state; }
    catch (e) { console.error('Access check failed', e); state = 'error'; }
  }
  if (state === 'allowed') return; // on to the page

  const url = new URL(request.url);
  const isPage = request.headers.get('sec-fetch-dest') === 'document' || (request.headers.get('accept') || '').includes('text/html');
  if (!isPage) {
    return new Response(state === 'error' ? 'Could not check your access, try again.' : 'Log in on the site first.', {
      status: state === 'error' ? 503 : 401,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: { Location: `/login?next=${next}${state === 'error' ? '&error=db' : ''}`, 'Cache-Control': 'no-store' },
  });
}
