// POST /api/report: the ⚑ "wrong answer?" button under an answer (src/core/report.js). Anyone on the
// site can send one, logged in or not: what a module answered, its pictures and its text on screen go to
// the owner's Discord channel (REPORT_WEBHOOK, see lib/report.js). A logged-in sender shows by name, a
// guest as "Guest #a1b2c3" (a tag made from their address and SESSION_SECRET: the same for each report
// they send, and it doesn't show the address). multipart/form-data: module, card, answer, note, serial,
// page, device, text, pasted, game, and up to MAX_IMAGES `image` files.
// room_card (card:<module>:<n>): sent from a card while in a room. For a logged-in member of a room, a
// second message follows with the room's copy of that card: its pictures from the server (who pasted
// each), every member's answer and the card's values (lib/report.js roomReportMessage).
import { readSession, sessionSecret } from '../lib/session.js';
import { accessFor } from '../lib/users.js';
import { json, sameOrigin } from '../lib/web.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES, reportMessage, reportWebhook, gatherRoomReport, roomReportMessage, roomLinkOk } from '../lib/report.js';
import { currentRoom, roomItems, listMembers, namesOf, loadPicture } from '../lib/rooms.js';

// one report per person every few seconds (a double tap, or a stuck button); a guest at most a few an
// hour; and the whole site under Discord's 30 a minute for one webhook. Kept per server instance, so
// these are a brake, not an exact count.
export const EVERY_MS = 5000;
export const GUEST_PER_HOUR = 10;
export const ALL_PER_MINUTE = 20;
const lastSent = new Map();  // sender → last report
const guestSent = new Map(); // guest sender → times this hour
let allSent = [];            // every report this minute

/** The address the request came from (Vercel puts it first in x-forwarded-for). */
export function clientIp(request) {
  const fwd = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return fwd || (request.headers.get('x-real-ip') || '').trim() || 'unknown';
}

/** A short tag for a guest: the same address gives the same tag; the tag doesn't give the address. */
export async function guestTag(ip, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`report-guest:${ip}`)));
  return [...sig.slice(0, 3)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Who is sending: { key, who } (who goes into the Discord message). */
async function sender(request, secret) {
  const s = await readSession(request, secret);
  if (s) {
    let user = null;
    try { user = (await accessFor(s.id)).user; } catch (e) { console.error('Access check failed (report still sent)', e); }
    return { key: `id:${s.id}`, guest: false, who: { id: s.id, name: user?.username || s.name, handle: user?.handle || '' } };
  }
  const ip = clientIp(request);
  const tag = await guestTag(ip, secret);
  return { key: `ip:${ip}`, guest: true, who: { guest: true, tag, name: `Guest #${tag}` } };
}

// sent within the last `ms` (a time after `now` means the clock went back: it no longer counts)
const within = (t, now, ms) => t <= now && now - t < ms;

/** null when this sender may send now, else the error to answer. */
function tooMany(from, now) {
  allSent = allSent.filter((t) => within(t, now, 60e3));
  if (allSent.length >= ALL_PER_MINUTE) return 'busy';
  if (within(lastSent.get(from.key) || 0, now, EVERY_MS)) return 'slow';
  if (from.guest && (guestSent.get(from.key) || []).filter((t) => within(t, now, 3600e3)).length >= GUEST_PER_HOUR) return 'hourly';
  return null;
}
function noteSent(from, now) {
  allSent.push(now);
  lastSent.set(from.key, now);
  if (lastSent.size > 500) lastSent.delete(lastSent.keys().next().value);
  if (from.guest) {
    guestSent.set(from.key, [...(guestSent.get(from.key) || []).filter((t) => within(t, now, 3600e3)), now]);
    if (guestSent.size > 500) guestSent.delete(guestSent.keys().next().value);
  }
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403);
  const secret = sessionSecret();
  if (!secret) return json({ error: 'setup' }, 503);
  const hook = reportWebhook();
  if (!hook) return json({ error: 'setup' }, 503);

  const from = await sender(request, secret);
  const now = Date.now();
  const limit = tooMany(from, now);
  if (limit) return json({ error: limit }, 429);

  let form;
  try { form = await request.formData(); }
  catch { return json({ error: 'form' }, 400); }
  const field = (k) => { const v = form.get(k); return typeof v === 'string' ? v : ''; };
  const images = form.getAll('image')
    .filter((f) => f && typeof f === 'object' && IMAGE_TYPES.includes(f.type) && f.size > 0 && f.size <= MAX_IMAGE_BYTES)
    .slice(0, MAX_IMAGES);

  const { payload, files } = reportMessage({
    who: from.who,
    module: field('module'), card: field('card'), answer: field('answer'), note: field('note'),
    serial: field('serial'), page: field('page'), device: field('device'), text: field('text'),
    pasted: field('pasted'), game: field('game'), images,
  });
  noteSent(from, now);

  try {
    const r = await toWebhook(hook, payload, files);
    if (!r.ok) {
      console.error('Report webhook answered', r.status, (await r.text()).slice(0, 300));
      return json({ error: r.status === 404 || r.status === 401 ? 'webhook-gone' : 'discord' }, 502);
    }
  } catch (e) {
    console.error('Report webhook failed', e);
    return json({ error: 'discord' }, 502);
  }

  // from a room card: the room's copy of the card follows (the report itself is in either way)
  let room = false;
  const card = field('room_card');
  if (card && !from.guest) {
    try {
      const msg = await roomPart(from.who, card);
      if (msg) {
        allSent.push(now); // a second message to the webhook
        const r = await toWebhook(hook, msg.payload, msg.files);
        room = r.ok;
        if (!r.ok) console.error('Room report webhook answered', r.status, (await r.text()).slice(0, 300));
      }
    } catch (e) { console.error('Room report failed (the report itself was sent)', e); }
  }
  return json({ ok: true, room });
}

function toWebhook(hook, payload, files) {
  const body = new FormData();
  body.append('payload_json', JSON.stringify(payload));
  files.forEach((f, i) => body.append(`files[${i}]`, f.blob, f.name));
  return fetch(`${hook}?wait=true`, { method: 'POST', body, signal: AbortSignal.timeout(15000) });
}

/** The room's copy of a card for a member's report → { payload, files }, or null (not in a room). */
async function roomPart(who, cardKey) {
  const room = await currentRoom(who.id);
  if (!room) return null;
  const [items, members] = await Promise.all([roomItems(room), listMembers(room.id)]);
  const names = await namesOf([...new Set([...members.map((m) => m.discord_id || m.id), ...items.map((i) => i.from_id)].filter(Boolean))]);
  const nameOf = (id) => (names.get(id) && names.get(id).username) || 'someone';
  const gathered = await gatherRoomReport({
    cardKey, items, nameOf,
    loadPicture: (id) => loadPicture(room, id),
    fetchLink: async (url) => {
      if (!roomLinkOk(url)) return null;
      const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!r.ok) return null;
      const type = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!IMAGE_TYPES.includes(type) || Number(r.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) return null;
      const b = await r.blob();
      return b.size <= MAX_IMAGE_BYTES ? new Blob([b], { type }) : null;
    },
  });
  return gathered ? roomReportMessage({ who: who.name, room: gathered }) : null;
}
