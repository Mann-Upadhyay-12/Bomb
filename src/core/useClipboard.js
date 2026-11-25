import { useAppState } from './AppStateContext.jsx';
import { useToast } from './ToastContext.jsx';

import { leftSinceLastAction } from './leftPage.js';

export function useClipboard() {
  const { prefixHash, setClip } = useAppState();
  const { showToast } = useToast();

  const formatClipboardText = (text) => {
    if (!text || text === '— — —') return '';
    let formatted = String(text).trim();
    if (prefixHash) {
      if (!formatted.startsWith('#')) {
        formatted = '# ' + formatted;
      }
    } else {
      if (formatted.startsWith('#')) {
        formatted = formatted.replace(/^#\s*/, '');
      }
    }
    return formatted;
  };

  const copy = (text, customToast = 'COPIED ✓') => {
    if (!text || text === '— — —') return;
    const formatted = formatClipboardText(text);
    if (!formatted) return;
    // the player went elsewhere after starting this: keep what they copied there
    if (leftSinceLastAction()) { setClip({ text: formatted, ok: false }); return; }

    const done = () => { setClip({ text: formatted, ok: true }); showToast(customToast, true); };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(formatted)
        .then(done)
        .catch(() => fallbackCopy(formatted, done));
    } else {
      fallbackCopy(formatted, done);
    }
  };

  const fallbackCopy = (formattedText, done) => {
    const ta = document.createElement('textarea');
    ta.value = formattedText;
    ta.setAttribute('readonly', ''); // no phone keyboard popping up
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, formattedText.length); // iPhones ignore select() alone
    // execCommand returns false (or throws) when the copy didn't happen — typically the page isn't
    // focused right after a drag from Discord. Say so: a false "COPIED ✓" makes the player paste
    // whatever was on the clipboard before.
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      console.error('Fallback copy failed:', e);
    }
    document.body.removeChild(ta);
    if (ok) { if (done) done(); }
    else {
      setClip({ text: formattedText, ok: false }); // the answer shows "NOT COPIED — TAP HERE"
      showToast('⚠ COPY FAILED — CLICK THE ANSWER TO COPY', false, 3500);
    }
  };

  return { copy, formatClipboardText };
}
