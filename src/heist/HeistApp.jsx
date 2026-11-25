import React, { useEffect, useRef } from 'react';
import markup from './heistMarkup.html?raw';
import { mountHeist } from './heistCore.js';
import { SwitchGameLink } from '../core/GameChooser.jsx';

// What the heist script sets on the page itself (its theme colours), cleared when the heist is left
const ROOT_PROPS = ['--paper', '--paper-raised', '--line', '--ink', '--ink-soft', '--brass', '--brass-deep', '--dropzone-active'];
const BODY_PROPS = ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundAttachment'];

/**
 * Calls fn and returns a function that removes every window / document listener fn added.
 * The heist script adds its page-wide listeners (paste, drop, keys, focus…) while it starts up.
 */
function withListenersUndoable(fn) {
  const added = [];
  const restore = [window, document].map(target => {
    const own = Object.prototype.hasOwnProperty.call(target, 'addEventListener');
    const orig = target.addEventListener;
    target.addEventListener = function (...args) {
      added.push([target, args]);
      return orig.apply(this, args);
    };
    return () => { if (own) target.addEventListener = orig; else delete target.addEventListener; };
  });
  try { fn(); } finally { restore.forEach(r => r()); }
  return () => added.forEach(([target, args]) => target.removeEventListener(...args));
}

/** The Heist decoders (public/HiTestCTC.html) as a React page: original markup, original script. */
export function HeistApp() {
  const ref = useRef(null);
  useEffect(() => {
    document.title = "Mann E's Heist";
    if (!ref.current || ref.current.dataset.mounted) return undefined;
    ref.current.dataset.mounted = '1';
    ref.current.innerHTML = markup;
    // Leaving for the bombs or the chooser happens without a page reload (see main.jsx), so what the
    // heist script put on the page goes with it: its listeners would otherwise still answer pastes.
    const removeListeners = withListenersUndoable(mountHeist);
    return () => {
      removeListeners();
      ROOT_PROPS.forEach(p => document.documentElement.style.removeProperty(p));
      document.documentElement.removeAttribute('data-skin'); // the Cyberpunk 2077 theme
      document.body.classList.remove('bg-picture');
      BODY_PROPS.forEach(p => { document.body.style[p] = ''; });
    };
  }, []);
  return (
    <>
      <div ref={ref} style={{ display: 'contents' }} />
      <SwitchGameLink />
    </>
  );
}
