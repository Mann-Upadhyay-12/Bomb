import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { startingAutocopy, saveAutocopy } from './autocopy.js';
import { startingModule } from './settings.js';

// The app's shared state, split into one context per part that changes on its own, because every
// module window stays mounted: one context for all of it re-rendered every module on each tab
// switch, copy and paste. Now a change re-renders only what reads it:
//   useAppState() — the settings every module reads (auto-copy, # prefix) and every setter (stable)
//   useAppMode()  — [appMode, setAppMode]: the module on screen (App, the picker)
//   useClip()     — what the page last copied and whether that worked (the answer panels)
const AppStateContext = createContext(null);
const AppModeContext = createContext(null);
const ClipContext = createContext(null);

export const PREFIX_HASH_KEY = 'bomb_prefix_hash';

export function AppStateProvider({ children }) {
  const [appMode, setAppMode] = useState(startingModule); // Settings: the last module used, or the first one shown
  // Auto-copy: remembered on this device once changed (Settings or any COPY ON DECODE button);
  // until then the build's default (yuza.html → off, dixie.html → on; on in dev). See autocopy.js.
  const [copyOnDecode, setCopyOnDecodeState] = useState(startingAutocopy);
  const setCopyOnDecode = useCallback((on) => {
    const v = Boolean(on);
    setCopyOnDecodeState(v);
    saveAutocopy(v);
  }, []);
  // What this page last put on the clipboard and whether that worked ({ text, ok }), so an answer
  // can say "COPIED ✓" or "NOT COPIED". A phone (iPhones above all) refuses a copy that doesn't
  // come straight from a tap, so an auto-copy there can fail, and toasts are off in the bomb app.
  const [clip, setClip] = useState({ text: '', ok: true });
  // "# " before copied answers: off until the player ticks it in Settings. Their pick (on or off) is
  // saved and kept on this device until they change it; nothing else writes it.
  const [prefixHash, setPrefixHashState] = useState(() => {
    try {
      return localStorage.getItem(PREFIX_HASH_KEY) === 'true';
    } catch (e) {
      return false;
    }
  });

  const setPrefixHash = useCallback((val) => {
    const boolVal = Boolean(val);
    setPrefixHashState(boolVal);
    try {
      localStorage.setItem(PREFIX_HASH_KEY, String(boolVal));
    } catch (e) {}
  }, []);

  // The modules still report their last answer and image, but nothing reads them any more:
  // kept in a ref so those calls don't re-render the app.
  const last = useRef({ copyString: '', img: null, file: null });
  const setLastCopyString = useCallback((s) => { last.current.copyString = s; }, []);
  const setLastImage = useCallback((img, file = null) => { last.current.img = img; last.current.file = file; }, []);

  const value = useMemo(() => ({
    copyOnDecode,
    setCopyOnDecode,
    prefixHash,
    setPrefixHash,
    setAppMode,
    setClip,
    setLastCopyString,
    setLastImage
  }), [copyOnDecode, prefixHash]);
  const mode = useMemo(() => [appMode, setAppMode], [appMode]);

  return (
    <AppStateContext.Provider value={value}>
      <AppModeContext.Provider value={mode}>
        <ClipContext.Provider value={clip}>
          {children}
        </ClipContext.Provider>
      </AppModeContext.Provider>
    </AppStateContext.Provider>
  );
}

function need(ctx, name) {
  if (!ctx) throw new Error(`${name} must be used within AppStateProvider`);
  return ctx;
}

/** { copyOnDecode, setCopyOnDecode, prefixHash, setPrefixHash, setAppMode, setClip, setLastCopyString, setLastImage } */
export function useAppState() {
  return need(useContext(AppStateContext), 'useAppState');
}

/** [appMode, setAppMode] — re-renders when the module on screen changes. */
export function useAppMode() {
  return need(useContext(AppModeContext), 'useAppMode');
}

/** { text, ok }: what the page last copied — re-renders on every copy. */
export function useClip() {
  return need(useContext(ClipContext), 'useClip');
}
