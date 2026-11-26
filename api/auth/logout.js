// GET /api/auth/logout → forget the session on this browser.
import { SESSION_COOKIE, cookie } from '../../lib/session.js';
import { redirect } from '../../lib/web.js';

export function GET() {
  return redirect('/login?bye=1', [cookie(SESSION_COOKIE, '', 0)]);
}
