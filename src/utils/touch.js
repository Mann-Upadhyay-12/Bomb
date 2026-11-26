import { useEffect, useState } from 'react';

// A phone or tablet: no mouse, so no hover, no right-click, no drag & drop and no Ctrl+V outside a
// text box. The same test as the CSS that shows the phone paste box (moduleinput.css) and the
// touch styles (touch.css), so the words and the layout always agree.
const MOUSE = '(hover: hover) and (pointer: fine)';

export function isTouchScreen() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && !window.matchMedia(MOUSE).matches;
  } catch (e) {
    return false;
  }
}

/** isTouchScreen() that follows a change (a tablet's keyboard + trackpad attached, devtools phone mode). */
export function useTouchScreen() {
  const [touch, setTouch] = useState(isTouchScreen);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(MOUSE);
    const on = () => setTouch(!mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else if (mq.removeListener) mq.removeListener(on); };
  }, []);
  return touch;
}

/** "Tap" on a phone, "Click" with a mouse (`upper` for the all-caps labels). */
export const tapWord = (touch, upper = false) => (upper ? (touch ? 'TAP' : 'CLICK') : (touch ? 'Tap' : 'Click'));

// A phone has no "click here, then Ctrl+V" and nothing to drop: "Click here, then paste the X" /
// "Drop / paste the X" read "Paste the X" there, with the phone's two ways in on the line below.
export function phoneTitle(title) {
  if (typeof title !== 'string') return title;
  const t = title
    .replace(/^click here or paste image$/i, 'Paste an image')
    .replace(/^click here(?:,)?\s*(?:then|to)\s+paste\s+/i, 'Paste ')
    .replace(/^drop\s*\/\s*paste\s+/i, 'Paste ')
    .replace(/^drop\s+/i, 'Paste ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
