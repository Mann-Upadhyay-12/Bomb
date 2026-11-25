// "Paste in air" from a box. On a computer a manual picture is pasted anywhere on the page (Ctrl+V
// with nothing focused): the module's picture box (Dropzone) on screen takes it — in a group of cards,
// the selected card. A phone has no Ctrl+V outside a text box, so the manual link boxes (ManualPasteBox)
// and the manual text boxes hand what was pasted to the same place with pasteInAir().

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
