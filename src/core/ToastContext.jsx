import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

// Split in three so the 30-odd modules that only call showToast don't re-render when a toast
// shows or the answer stamp flashes:
//   useToast()      — { showToast } (stable)
//   useToastState() — { toastMsg, show }: the toast itself (App's banner)
//   useToastFlash() — true for a moment after a real clipboard copy (the answer stamps)
const ToastContext = createContext(null);
const ToastStateContext = createContext(null);
const FlashContext = createContext(false);

export function ToastProvider({ children }) {
  const [toastMsg, setToastMsg] = useState('COPIED ✓');
  const [show, setShow] = useState(false);
  const [flash, setFlash] = useState(false);

  const [seq, setSeq] = useState(0);
  const [duration, setDuration] = useState(1800);

  // Only the needy reminder shows a toast (`{ needy: true }`); every other message ("ROW 2 ADDED",
  // "CLEARED", "COPIED" …) is dropped so pasting doesn't throw text over the page.
  // `withFlash` still pulses the answer stamp on a real clipboard copy (that is not a toast).
  // `ms` = how long it stays up.
  const showToast = useCallback((msg = 'COPIED ✓', withFlash = false, ms = 1800, { needy = false } = {}) => {
    if (withFlash) {
      setFlash(true);
      setTimeout(() => setFlash(false), 220);
    }
    if (!needy) return;
    setToastMsg(msg);
    setDuration(ms);
    setShow(true);
    setSeq(n => n + 1); // restart the hide timer even when the same message repeats
  }, []);

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => setShow(false), duration);
    return () => clearTimeout(timer);
  }, [show, seq, duration]);

  const actions = useMemo(() => ({ showToast }), [showToast]);
  const state = useMemo(() => ({ toastMsg, show }), [toastMsg, show]);

  return (
    <ToastContext.Provider value={actions}>
      <ToastStateContext.Provider value={state}>
        <FlashContext.Provider value={flash}>
          {children}
        </FlashContext.Provider>
      </ToastStateContext.Provider>
    </ToastContext.Provider>
  );
}

/** { showToast } */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

/** { toastMsg, show } */
export function useToastState() {
  const ctx = useContext(ToastStateContext);
  if (!ctx) {
    throw new Error('useToastState must be used within a ToastProvider');
  }
  return ctx;
}

/** True for a moment after a real clipboard copy. */
export function useToastFlash() {
  return useContext(FlashContext);
}
