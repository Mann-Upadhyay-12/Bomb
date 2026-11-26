// The ⚑ "wrong answer?" button (components/ReportButton.jsx), for everyone on the site (logged in or
// not): it sends a module's answer, its pictures and its text on screen (what it read, its working) to the owner's Discord
// through api/report.js. Everything is taken from the page as it is, so no module has to do anything:
//   - the pictures pasted into the module: each Dropzone notes them here (noteInput)
//   - the pictures and boards it shows (<img> from a paste, <canvas>)
//   - its text (innerText: only what is shown), the answer stamps, the serial
//   - every text pasted on the page this session (a manual's text, a serial, an image link): pasted.txt
//   - the game's data in use now (the serial, this game's manuals and tables): game-data.txt

import { SERIAL_KEY, cleanSerial } from './bombSerial.js';
import { GAME_SAVED, GAME_MEMORY } from './newGame.js';
import { peekSharedState } from './sharedSetting.js';

const inputs = new WeakMap(); // a Dropzone's element → the last pictures it took (newest last)

// ── text pastes ──────────────────────────────────────────────────────────────────────────────────────
// Noted before anything else sees the paste: this listener is added when this file loads, before any
// module's own "paste anywhere" listener (they stop the paste for the listeners after them).
const pastes = []; // { at, text, where } newest last
const MAX_PASTES = 25;
const PASTE_CHARS = 20000;

const moduleOf = (el) => {
  const w = el && el.closest && el.closest('[data-module]');
  if (w) return w.dataset.moduleName || w.dataset.module;
  const open = [...document.querySelectorAll('[data-module]')].filter(shown);
  return open.map((m) => m.dataset.moduleName || m.dataset.module).join(' + ') || 'no module open';
};
const fieldOf = (el) => {
  if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return 'anywhere on the page (Ctrl+V)';
  const name = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || el.name || el.className;
  return `box: ${String(name || el.tagName.toLowerCase()).slice(0, 80)}`;
};

function notePaste(e) {
  try {
    const cd = e.clipboardData;
    const text = cd ? String(cd.getData('text/plain') || cd.getData('text') || '') : '';
    if (!text.trim()) return; // a picture: the picture box notes it (noteInput)
    const el = e.target instanceof Element ? e.target : document.activeElement;
    if (el && el.closest && el.closest('.report-row')) return; // the report's own note
    pastes.push({
      at: Date.now(),
      text: text.length > PASTE_CHARS ? text.slice(0, PASTE_CHARS) + '\n… (cut)' : text,
      where: `${moduleOf(el)} · ${fieldOf(el)}`,
    });
    if (pastes.length > MAX_PASTES) pastes.shift();
  } catch (err) {}
}
if (typeof window !== 'undefined') window.addEventListener('paste', notePaste, true);

const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Every text pasted this session, oldest first, as one text ('' when none). */
function pastedText() {
  if (!pastes.length) return '';
  return pastes.map((p, i) => `── paste ${i + 1} of ${pastes.length} · ${clock(p.at)} · ${p.where} ──\n${p.text.replace(/\r/g, '')}`).join('\n\n');
}

// the word lists kept from game to game (not in newGame.js), sent only when changed from the built-in one
const KEPT = [
  ['bombvision_password_words', 'Password word list'],
  ['bombvision_wof_rules_v2', "Who's on First rules"],
  ['bombvision_search_words_v2', 'Word Search words'],
];

/** The game's data in use now: the serial, this game's manuals and tables (only what is set). */
function gameText() {
  const out = [];
  const add = (what, key, v) => {
    if (v == null) return;
    let s = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
    if (!s || !String(s).trim() || s === '{}' || s === '[]') return;
    if (s.length > PASTE_CHARS) s = s.slice(0, PASTE_CHARS) + '\n… (cut)';
    out.push(`── ${what || key} (${key}) ──\n${s}`);
  };
  const saved = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };
  for (const [key, what] of [...GAME_SAVED, ...KEPT]) add(what, key, saved(key));
  for (const [key, what] of GAME_MEMORY) add(what, key, peekSharedState(key));
  return out.join('\n\n');
}

/** A Dropzone took a picture (a File / Blob or a data: URI). */
export function noteInput(el, src) {
  if (!el || !src) return;
  const list = inputs.get(el) || [];
  list.push(src);
  if (list.length > 3) list.shift();
  inputs.set(el, list);
}

/** Who is logged in (set by the page's unlock step, scripts/lock-site.mjs); null for a guest. */
export const account = () => (typeof window !== 'undefined' && window.__BB_ACCOUNT__) || null;
/** On the website (its /api is there: the page's unlock step sets __BB_SITE__). Not the offline copy or
 *  the dev server, which have nowhere to send a report. */
export const onSite = () => typeof window !== 'undefined' && Boolean(window.__BB_SITE__ || window.__BB_ACCOUNT__);
/** Everyone on the site gets the button, logged in or not. */
export const canReport = () => onSite();

const MAX_IMAGES = 6;
const BUDGET = 3.6 * 1024 * 1024; // the site takes 4.5 MB per request
const BIG = 1.4 * 1024 * 1024;

const isImageBlob = (b) => b instanceof Blob && /^image\//.test(b.type);

function canvasBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), type, quality); } catch (e) { resolve(null); } // a canvas with another site's picture can't be read
  });
}

/** Any picture source → a Blob (null when it can't be read). */
async function toBlob(src) {
  try {
    if (isImageBlob(src)) return src;
    if (typeof src === 'string') {
      if (!/^(data:image\/|blob:)/.test(src)) return null;
      const b = await (await fetch(src)).blob();
      return isImageBlob(b) ? b : null;
    }
    if (src instanceof HTMLCanvasElement) return canvasBlob(src);
    if (src instanceof HTMLImageElement) {
      if (/^(data:image\/|blob:)/.test(src.currentSrc || src.src)) return toBlob(src.currentSrc || src.src);
      return null;
    }
  } catch (e) {}
  return null;
}

/** A big picture is sent smaller, as a JPEG (a 440×440 module picture never is). */
async function shrink(blob) {
  if (blob.size <= BIG || typeof createImageBitmap !== 'function') return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return (await canvasBlob(c, 'image/jpeg', 0.85)) || blob;
  } catch (e) {
    return blob;
  }
}

const shown = (el) => el.getClientRects().length > 0;

/** Everything a report holds, for the module (or the group's card) that `anchor` is in. */
export async function collectReport(anchor) {
  const win = anchor.closest('[data-module]');
  const scope = anchor.closest('.mgroup-card') || win || document.body;
  const inCard = scope.classList.contains('mgroup-card');

  // pictures, most telling first: what was pasted into it, then what it shows
  const sources = [];
  const zones = [...scope.querySelectorAll('.dropzone')];
  // in a group, the shared manual bar above the cards counts too
  if (inCard && win) zones.push(...[...win.querySelectorAll('.dropzone')].filter((z) => !z.closest('.mgroup-card')));
  for (const z of zones) sources.push(...(inputs.get(z) || []).slice().reverse());
  for (const img of scope.querySelectorAll('img')) {
    if (img.naturalWidth >= 48 && img.naturalHeight >= 48) sources.push(img);
  }
  for (const c of scope.querySelectorAll('canvas')) {
    if (c.width * c.height >= 120 * 120 && shown(c)) sources.push(c);
  }

  const images = [];
  const seen = new Set();
  let total = 0;
  for (const src of sources) {
    if (images.length >= MAX_IMAGES) break;
    const key = typeof src === 'string' ? src : src instanceof HTMLImageElement ? (src.currentSrc || src.src) : null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    let b = await toBlob(src);
    if (!b) continue;
    b = await shrink(b);
    const same = `${b.size}:${b.type}`;
    if (seen.has(same) || total + b.size > BUDGET) continue;
    seen.add(same);
    total += b.size;
    images.push(b);
  }

  const answer = [...scope.querySelectorAll('.stamp-word, .wsq-stamp-main')]
    .filter(shown).map((e) => e.innerText.trim()).filter(Boolean).join('  |  ');
  let serial = '';
  try { serial = cleanSerial(localStorage.getItem(SERIAL_KEY)); } catch (e) {}
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  return {
    module: win ? (win.dataset.moduleName || win.dataset.module) : '',
    card: inCard ? (scope.querySelector('.mgroup-card-n')?.textContent || '').trim() : '',
    answer,
    serial,
    page: location.pathname,
    device: `${touch ? 'phone / touch screen' : 'computer'} · ${innerWidth}×${innerHeight} · ${navigator.userAgent}`,
    text: (scope.innerText || '').replace(/\n{3,}/g, '\n\n').trim(),
    pasted: pastedText(),
    game: gameText(),
    pastes: pastes.length,
    images,
  };
}

const ERRORS = {
  setup: "reports aren't switched on yet (the owner has to add the Discord channel)",
  slow: 'one report every few seconds: try again in a moment',
  hourly: 'that’s 10 reports this hour: log in to send more, or try later',
  busy: 'lots of reports right now: try again in a minute',
  discord: "Discord didn't take it: try again",
  'webhook-gone': 'the Discord channel for reports is gone (tell the owner)',
};

/** Collects and sends a report. Resolves when Discord has it; throws an Error with a message to show. */
export async function sendReport(anchor, note) {
  const r = await collectReport(anchor);
  const form = new FormData();
  for (const k of ['module', 'card', 'answer', 'serial', 'page', 'device', 'text', 'pasted', 'game']) form.append(k, r[k] || '');
  form.append('note', note || '');
  r.images.forEach((b, i) => form.append('image', b, `picture-${i + 1}`));
  let res;
  try {
    res = await fetch('/api/report', { method: 'POST', body: form, credentials: 'same-origin' });
  } catch (e) {
    throw new Error('no connection: try again');
  }
  if (res.ok) return { images: r.images.length, pastes: r.pastes };
  const data = await res.json().catch(() => ({}));
  throw new Error(ERRORS[data.error] || `couldn't send it (${res.status})`);
}
