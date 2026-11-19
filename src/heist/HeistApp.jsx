import React, { useEffect, useRef } from 'react';
import markup from './heistMarkup.html?raw';
import { mountHeist } from './heistCore.js';
import { SwitchGameLink } from '../core/GameChooser.jsx';

/** The Heist decoders (public/HiTestCTC.html) as a React page: original markup, original script. */
export function HeistApp() {
  const ref = useRef(null);
  useEffect(() => {
    document.title = "Mann E's Heist";
    if (ref.current && !ref.current.dataset.mounted) {
      ref.current.dataset.mounted = '1';
      ref.current.innerHTML = markup;
      mountHeist();
    }
  }, []);
  return (
    <>
      <div ref={ref} style={{ display: 'contents' }} />
      <SwitchGameLink />
    </>
  );
}
