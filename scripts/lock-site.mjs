#!/usr/bin/env node
// Locks the built site for Vercel (vercel.json runs this after `npm run build`; a local build stays open).
//
// 1. Each app page (dixie / yuza / bomb) keeps its HTML and CSS, but its code (the one inline module
//    script: every solver, the vision code, the models) is gzipped and AES-encrypted. A small loader asks
//    /api/unlock for the key, which any page on this site gets (logged in or not: login is only for
//    rooms), and runs the code from memory. A Ctrl+S copy, a copy opened from a file or put on another
//    site has only the encrypted block, so it shows "this only runs on <site>" instead of the app.
// 2. Only what the site needs is published: the app pages, /login and stockfish.js. The old standalone
//    pages in public/ (bombs, maze, …) are left out of the deploy.
//
// The key is HMAC(SESSION_SECRET, salt): nothing secret is written to the build. Changing
// SESSION_SECRET needs a redeploy (the old pages can no longer be opened, and everyone logs in again).
//
//   node scripts/lock-site.mjs [dir]      (default dist/; needs SESSION_SECRET of 32+ characters)
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { lockKey, sessionSecret } from '../lib/session.js';

export const APP_PAGES = ['dixie.html', 'yuza.html', 'bomb.html'];
export const PUBLISHED = new Set([...APP_PAGES, 'login.html', 'stockfish.js']);

/** The page shown instead of the app, and the unlock-and-run step. Plain script, runs in <head>. */
export function loaderSource(site) {
  return `(() => {
  const SITE = ${JSON.stringify(site || '')};
  const sealed = document.getElementById('bb-sealed');
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  // the app waits for DOMContentLoaded (like the module script it was); that also waits for the deferred
  // CDN scripts, which a saved copy opened offline may never get. The lock screen only needs the body.
  const ready = () => document.readyState === 'loading'
    ? new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true })) : Promise.resolve();
  const parsed = () => document.readyState === 'loading'
    ? new Promise((r) => document.addEventListener('readystatechange', r, { once: true })) : Promise.resolve();

  async function stop(title, text, { retry = false, link = false } = {}) {
    await parsed();
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;'
      + 'padding:24px 16px;box-sizing:border-box;background:#14161b;color:#e8e6e1;font:15px/1.5 system-ui,sans-serif;text-align:center';
    const card = document.createElement('div');
    card.style.cssText = 'max-width:420px;background:#1d2027;border:1px solid #333845;border-radius:14px;padding:24px';
    const h = document.createElement('div');
    h.style.cssText = 'font:700 15px ui-monospace,monospace;letter-spacing:.12em;color:#d9a35b;margin-bottom:12px';
    h.textContent = title;
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 16px;color:#c9ccd2';
    p.textContent = text;
    card.append(h, p);
    const btn = (label, onclick, href) => {
      const a = document.createElement('a');
      a.textContent = label;
      a.style.cssText = 'display:inline-block;background:#d9a35b;color:#14161b;border-radius:9px;padding:9px 16px;font-weight:600;text-decoration:none;cursor:pointer';
      if (href) a.href = href; else a.onclick = onclick;
      card.append(a);
    };
    if (link && SITE) btn('Open ' + SITE.replace(/^https?:\\/\\//, ''), null, SITE);
    if (retry) btn('Try again', () => location.reload());
    box.append(card);
    document.body.replaceChildren(box); // a saved copy also holds a snapshot of the app's screen: drop it
  }
  const elsewhere = () => stop('THIS COPY DOESN\\u2019T RUN HERE',
    'The solver only runs on its own website.', { link: true });

  async function open() {
    if (!sealed || location.protocol === 'file:') return elsewhere();
    let res;
    try {
      res = await fetch('/api/unlock', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salt: sealed.dataset.salt }),
      });
    } catch (e) {
      return stop('CAN\\u2019T REACH THE SITE', 'Check your internet connection, then try again.', { retry: true });
    }
    if (res.status === 403) return elsewhere(); // not this site's own page
    if (res.status === 404 || res.status === 405) return elsewhere();
    if (!res.ok) return stop('COULDN\\u2019T CHECK YOUR ACCESS', 'The site had a problem. Try again in a minute.', { retry: true });
    const { key, account } = await res.json();
    const aes = await crypto.subtle.importKey('raw', bytes(key), 'AES-GCM', false, ['decrypt']);
    const zipped = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.dataset.iv) }, aes, bytes(sealed.textContent.trim()));
    sealed.remove();
    const code = await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    window.__BB_SITE__ = true; // the site's API is here (rooms, ⚑ reports)
    window.__BB_ACCOUNT__ = account || null; // null: not logged in (fine: login is only for rooms)
    await ready(); // the original module ran after the page was parsed
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try { await import(url); } finally { URL.revokeObjectURL(url); }
  }
  open().catch((e) => {
    console.error(e);
    stop('COULDN\\u2019T START', 'Reload the page. If it keeps happening, tell the owner.', { retry: true });
  });
})();`;
}

/** An app page with its inline module code sealed. */
export async function sealPage(html, secret, site) {
  const m = /<script type="module" crossorigin>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('no inline <script type="module"> to seal');
  if (/<script type="module"/.test(html.slice(m.index + m[0].length))) throw new Error('more than one module script');
  const salt = randomBytes(16).toString('base64url');
  const iv = randomBytes(12);
  const aes = await crypto.subtle.importKey('raw', await lockKey(secret, salt), 'AES-GCM', false, ['encrypt']);
  const sealed = Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, gzipSync(Buffer.from(m[1]), { level: 9 })));
  const block = `<script type="application/octet-stream" id="bb-sealed" data-salt="${salt}" data-iv="${iv.toString('base64')}">`
    + `${sealed.toString('base64')}</script>\n<script>${loaderSource(site)}</script>`;
  return html.slice(0, m.index) + block + html.slice(m.index + m[0].length);
}

export function siteUrl(env = process.env) {
  const u = String(env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (u) return u;
  return env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
}

export async function lockSite(dir, secret, site) {
  const done = [];
  for (const name of readdirSync(dir)) {
    if (!PUBLISHED.has(name)) { rmSync(join(dir, name), { recursive: true, force: true }); continue; }
    if (!APP_PAGES.includes(name)) continue;
    const file = join(dir, name);
    const before = readFileSync(file, 'utf8');
    writeFileSync(file, await sealPage(before, secret, site));
    done.push(name);
  }
  const missing = APP_PAGES.filter((p) => !done.includes(p));
  if (missing.length) throw new Error(`missing from ${dir}: ${missing.join(', ')}`);
  return done;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dir = process.argv[2] || 'dist';
  const secret = sessionSecret();
  if (!secret) {
    console.error('lock-site: SESSION_SECRET is not set (or shorter than 32 characters).\n'
      + '  Add it in Vercel → Settings → Environment Variables (any long random text), then redeploy.\n'
      + '  The build stops here so the site is never published unlocked.');
    process.exit(1);
  }
  const site = siteUrl();
  const pages = await lockSite(dir, secret, site);
  console.log(`lock-site: sealed ${pages.join(', ')} in ${dir}/ (site ${site || 'unknown'}); published: ${readdirSync(dir).join(', ')}`);
}
