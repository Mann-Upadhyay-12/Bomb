// Small helpers for the site's functions (api/) and middleware.js: Web Request → Response.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE } });
}

export function html(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
}

export function redirect(location, cookies = [], status = 302) {
  const headers = new Headers({ Location: location, ...NO_STORE });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status, headers });
}

/** True when a POST comes from this site's own pages (not a form or script on another site). */
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  const own = [new URL(request.url).host, request.headers.get('x-forwarded-host'), request.headers.get('host')];
  return own.some((h) => h && h.split(',')[0].trim() === host);
}

/** A whole page in the site's dark style (the admin page and error pages). */
export function page(title, body, { wide = false } = {}) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#14161b;color:#e8e6e1;font:15px/1.5 'IBM Plex Sans',system-ui,sans-serif;
  display:flex;justify-content:center;padding:32px 16px}
main{width:100%;max-width:${wide ? 1040 : 460}px}
h1{font:700 15px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.14em;color:#d9a35b;margin:0 0 18px}
.card{background:#1d2027;border:1px solid #333845;border-radius:14px;padding:22px}
p{margin:0 0 12px} .dim{color:#9aa0ab;font-size:13px}
a{color:#d9a35b}
code{font:13px ui-monospace,monospace;background:#14161b;border:1px solid #333845;border-radius:6px;padding:1px 6px;word-break:break-all}
.btn{display:inline-block;border:1px solid #d9a35b;background:#d9a35b;color:#14161b;border-radius:9px;padding:9px 16px;
  font:600 14px system-ui,sans-serif;text-decoration:none;cursor:pointer}
.btn.ghost{background:transparent;color:#e8e6e1;border-color:#3a3f4b}
</style></head><body><main>${body}</main></body></html>`;
}
