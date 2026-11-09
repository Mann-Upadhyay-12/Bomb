import React, { createContext, useContext, useState, useEffect } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toastMsg, setToastMsg] = useState('COPIED ✓');
  const [show, setShow] = useState(false);
  const [flash, setFlash] = useState(false);

  const showToast = (msg = 'COPIED ✓') => {
    setToastMsg(msg);
    setShow(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
  };

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      setShow(false);
      setToastMsg('COPIED ✓');
    }, 1600);
    return () => clearTimeout(timer);
  }, [show, toastMsg]);

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
