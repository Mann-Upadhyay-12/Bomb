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
    try {
      document.execCommand('copy');
      if (done) done();
    } catch (e) {
      console.error('Fallback copy failed:', e);
    }
    document.body.removeChild(ta);
  };

  return { copy, formatClipboardText };
}
