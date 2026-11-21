import { useAppState } from './AppStateContext.jsx';
import { useToast } from './ToastContext.jsx';

export function useClipboard() {
  const { prefixHash } = useAppState();
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

    const done = () => showToast(customToast, true);

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
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
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
    else showToast('⚠ COPY FAILED — CLICK THE ANSWER TO COPY', false, 3500);
  };

  return { copy, formatClipboardText };
}
