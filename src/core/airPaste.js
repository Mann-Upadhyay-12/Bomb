// "Paste in air" from a box. On a computer a manual picture is pasted anywhere on the page (Ctrl+V
// with nothing focused): the module's picture box (Dropzone) on screen takes it — in a group of cards,
// the selected card. A phone has no Ctrl+V outside a text box, so the manual link boxes (ManualPasteBox)
// and the manual text boxes hand what was pasted to the same place with pasteInAir().
// A manual (or bot message) that is TEXT is pasted in air too: useAirText() below.

import { useEffect, useRef } from 'react';
import { discordPlain } from '../utils/discordText.js';

const EVENT = 'bv-air-paste';
export const AIR_PASTE_EVENT = EVENT;

/**
 * Gives a picture source ({ type: 'file', file } or { type: 'url', url }) to the picture box on screen.
 * `card`: the card it was pasted in (its index), or null for the selected card (a manual bar above the
 * cards). `done(ok)` is called once the picture has loaded or failed.
 * → true when a picture box took it (false: none on screen).
 */
export function pasteInAir(src, { card = null, done = null } = {}) {
  if (typeof window === 'undefined' || !src) return false;
  const detail = { src, card, done, taken: false };
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail.taken;
}

const LINK_RE = /^https?:\/\/\S+$/i;

/**
 * A paste into a manual's text box that is really a picture: an image, or a link alone (a copied
 * Discord image link) → its source; a normal text paste → null.
 */
export function pictureInPaste(cd) {
  if (!cd) return null;
  for (const it of Array.from(cd.items || [])) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) return { type: 'file', file: f };
    }
  }
  const text = String(cd.getData('text/plain') || cd.getData('text') || '').trim();
  if (LINK_RE.test(text) && !/discord(app)?\.com\/channels\//i.test(text)) return { type: 'url', url: text.replace(/&amp;/g, '&') };
  return null;
}

/** onPaste for a manual's text box: a picture or a lone link loads as the picture; text is typed as usual. */
export function manualBoxPaste(card = null) {
  return (e) => {
    const src = pictureInPaste(e.clipboardData);
    if (!src) return;
    e.preventDefault();
    e.stopPropagation(); // not the page-wide Ctrl+V as well
    pasteInAir(src, { card });
  };
}

const isTextField = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['file', 'checkbox', 'radio', 'button', 'range', 'color'].includes(el.type)));

/**
 * The text of a Ctrl+V made "in air" (no text box focused), with the Discord markup a phone copies
 * taken off. null: it went into a text box, it carries a picture, or it is just a link (those are
 * the picture box's).
 */
export function airText(e) {
  if (typeof document !== 'undefined' && isTextField(document.activeElement)) return null;
  const cd = e && e.clipboardData;
  if (!cd || Array.from(cd.items || []).some(it => it.kind === 'file')) return null;
  const t = discordPlain(cd.getData('text/plain') || cd.getData('text') || '').trim();
  if (!t || LINK_RE.test(t)) return null;
  return t;
}

/**
 * A module's text manual (or the bot's message) pasted in air: Ctrl+V anywhere on the page, as a
 * manual picture is. `take(text)` → true when the text was this module's (it is then used and goes
 * no further); false lets it go on (to the picture box). Listens only while `active` (the module's
 * tab is open — in a group of cards, the selected card).
 */
export function useAirText(active, take) {
  const latest = useRef(take);
  latest.current = take;
  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;
    const onPaste = (e) => {
      if (e.defaultPrevented) return; // a group's manual bar took it
      const t = airText(e);
      if (t == null || !latest.current(t)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [active]);
}
