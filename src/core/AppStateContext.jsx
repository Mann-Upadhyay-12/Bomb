import React, { createContext, useContext, useState, useEffect } from 'react';

const AppStateContext = createContext(null);

export const PREFIX_HASH_KEY = 'bomb_prefix_hash';

export function AppStateProvider({ children }) {
  const [appMode, setAppMode] = useState('mines');
  // Default set per build (npm run build: yuza.html → off, dixie.html → on); on in dev
  const [copyOnDecode, setCopyOnDecode] = useState(typeof __AUTOCOPY_DEFAULT__ === 'boolean' ? __AUTOCOPY_DEFAULT__ : true);
  const [prefixHash, setPrefixHashState] = useState(() => {
    try {
      const saved = localStorage.getItem(PREFIX_HASH_KEY);
      return saved !== null ? saved === 'true' : true;
    } catch (e) {
      return true;
    }
  });
  const [lastCopyString, setLastCopyString] = useState('');
  const [lastImg, setLastImg] = useState(null);
  const [lastFile, setLastFile] = useState(null);

  const setPrefixHash = (val) => {
    const boolVal = Boolean(val);
    setPrefixHashState(boolVal);
    try {
      localStorage.setItem(PREFIX_HASH_KEY, String(boolVal));
    } catch (e) {}
  };

  const setLastImage = (img, file = null) => {
    setLastImg(img);
    setLastFile(file);
  };

  return (
    <AppStateContext.Provider value={{
      appMode,
      setAppMode,
      copyOnDecode,
      setCopyOnDecode,
      prefixHash,
      setPrefixHash,
      lastCopyString,
      setLastCopyString,
      lastImg,
      lastFile,
      setLastImage
    }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return ctx;
}
