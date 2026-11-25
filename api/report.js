// POST /api/report: the ⚑ "wrong answer?" button under an answer (src/core/report.js). The owner and the
// OGs send what a module answered, its pictures and its text on screen to the owner's Discord channel
// (REPORT_WEBHOOK, see lib/report.js). multipart/form-data: module, card, answer, note, serial, page,
// device, text, pasted, game, and up to MAX_IMAGES `image` files.
import { readSession, sessionSecret } from '../lib/session.js';
import { accessFor } from '../lib/users.js';
import { json, sameOrigin } from '../lib/web.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES, reportMessage, reportWebhook } from '../lib/report.js';

// one report per person every few seconds (a double tap, or a stuck button)
const EVERY_MS = 5000;
const lastSent = new Map();

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403);
  const secret = sessionSecret();
  if (!secret) return json({ error: 'setup' }, 503);
  const s = await readSession(request, secret);
  if (!s) return json({ error: 'login' }, 401);

  let a;
  try { a = await accessFor(s.id); }
  catch (e) { console.error('Access check failed', e); return json({ error: 'db' }, 503); }
  if (a.state !== 'allowed' || !(a.admin || a.og)) return json({ error: 'not-og' }, 403);

  const hook = reportWebhook();
  if (!hook) return json({ error: 'setup' }, 503);
  const now = Date.now();
  if (now - (lastSent.get(s.id) || 0) < EVERY_MS) return json({ error: 'slow' }, 429);

  let form;
  try { form = await request.formData(); }
  catch { return json({ error: 'form' }, 400); }
  const field = (k) => { const v = form.get(k); return typeof v === 'string' ? v : ''; };
  const images = form.getAll('image')
    .filter((f) => f && typeof f === 'object' && IMAGE_TYPES.includes(f.type) && f.size > 0 && f.size <= MAX_IMAGE_BYTES)
    .slice(0, MAX_IMAGES);

  const { payload, files } = reportMessage({
    who: { id: s.id, name: a.user?.username || s.name, handle: a.user?.handle || '' },
    module: field('module'), card: field('card'), answer: field('answer'), note: field('note'),
    serial: field('serial'), page: field('page'), device: field('device'), text: field('text'),
    pasted: field('pasted'), game: field('game'), images,
  });
  lastSent.set(s.id, now);
  if (lastSent.size > 200) lastSent.delete(lastSent.keys().next().value);

  const body = new FormData();
  body.append('payload_json', JSON.stringify(payload));
  files.forEach((f, i) => body.append(`files[${i}]`, f.blob, f.name));
  try {
    const r = await fetch(`${hook}?wait=true`, { method: 'POST', body, signal: AbortSignal.timeout(15000) });
    if (!r.ok) {
      console.error('Report webhook answered', r.status, (await r.text()).slice(0, 300));
      return json({ error: r.status === 404 || r.status === 401 ? 'webhook-gone' : 'discord' }, 502);
    }
  } catch (e) {
    console.error('Report webhook failed', e);
    return json({ error: 'discord' }, 502);
  }
  return json({ ok: true });
}
