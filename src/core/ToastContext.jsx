import React, { createContext, useContext, useState, useEffect } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toastMsg, setToastMsg] = useState('COPIED ✓');
  const [show, setShow] = useState(false);
  const [flash, setFlash] = useState(false);

  const [seq, setSeq] = useState(0);

  // `withFlash` pulses the answer stamp — only used for real clipboard copies,
  // so informational toasts ("CLEARED", "SAMPLE LOADED") don't look like a copy.
  const showToast = (msg = 'COPIED ✓', withFlash = false) => {
    setToastMsg(msg);
    setShow(true);
    setSeq(n => n + 1); // restart the hide timer even when the same message repeats
    if (withFlash) {
      setFlash(true);
      setTimeout(() => setFlash(false), 220);
    }
  };

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => setShow(false), 1800);
    return () => clearTimeout(timer);
  }, [show, seq]);

  return (
    <ToastContext.Provider value={{ showToast, toastMsg, show, flash }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
