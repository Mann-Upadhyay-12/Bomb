// Signed session cookies for the site's Discord login (optional; needed for rooms). Web Crypto only
// (the API functions in api/).
//   token = base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload, SESSION_SECRET))

export const SESSION_COOKIE = '__Host-bb_session'; // __Host-: Secure, Path=/, this host only
export const STATE_COOKIE = '__Host-bb_oauth';     // the login in progress (state + where to return)
export const SESSION_DAYS = 30;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlFromBytes(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** Standard base64 (what the browser's atob reads). */
export function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function bytesFromB64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

/** The secret from the environment, or null: nothing is signed or trusted without one. */
export function sessionSecret(env = process.env) {
  const s = String(env.SESSION_SECRET || '').trim();
  return s.length >= 32 ? s : null;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64urlFromBytes(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

function sameString(a, b) { // constant time for equal lengths
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export async function signToken(data, secret) {
  const payload = b64urlFromBytes(enc.encode(JSON.stringify(data)));
  return `${payload}.${await hmac(secret, payload)}`;
}

/** The payload, or null when the token is missing, altered or signed with another secret. */
export async function verifyToken(token, secret) {
  if (!secret || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  if (!sameString(token.slice(dot + 1), await hmac(secret, payload))) return null;
  try { return JSON.parse(dec.decode(bytesFromB64url(payload))); } catch { return null; }
}

/**
 * The AES-256 key that opens a page sealed by scripts/lock-site.mjs: HMAC(secret, 'bb-lock:' + salt).
 * The build and /api/unlock both derive it from SESSION_SECRET, so it is never stored anywhere.
 */
export async function lockKey(secret, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('bb-lock:' + salt)));
}

/** A new session for a Discord user: { id, name, iat }. */
export function newSession(user, now = Date.now()) {
  return { id: String(user.id), name: String(user.name || ''), iat: now };
}

/** The session in a request's cookies, or null (also when it is older than SESSION_DAYS). */
export async function readSession(request, secret, now = Date.now()) {
  const s = await verifyToken(parseCookies(request.headers.get('cookie'))[SESSION_COOKIE], secret);
  if (!s || !s.id || !Number.isFinite(s.iat) || now - s.iat > SESSION_DAYS * 864e5) return null;
  return s;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function cookie(name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * A path on this site to return to after logging in ("/bomb#play=…"); anything else → "/".
 * Read the way a browser reads a Location header (it drops tabs and newlines, and takes \ for /), so
 * "/<tab>/evil.example" can't turn into //evil.example and send someone to another site.
 */
export function safeNext(next) {
  const n = String(next || '');
  if (!n.startsWith('/') || n.length > 300) return '/';
  const base = 'https://this-site.invalid';
  try {
    const u = new URL(n, base);
    return u.origin === base ? u.pathname + u.search + u.hash : '/';
  } catch { return '/'; }
}
