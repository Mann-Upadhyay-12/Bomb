// A text setting (e.g. a module's manual / rules list) shared live by every window that uses it
// and persisted in localStorage. Used so all copies of a "same manual" module stay in sync.
import { useSyncExternalStore, useCallback } from 'react';

const values = new Map();
const listeners = new Map();

function read(key, fallback) {
  if (!values.has(key)) {
    let v = null;
    try { v = localStorage.getItem(key); } catch (e) {}
    values.set(key, v !== null && v.trim() ? v : fallback);
  }
  return values.get(key);
}

export function setSharedSetting(key, value) {
  values.set(key, value);
  try { localStorage.setItem(key, value); } catch (e) {}
  (listeners.get(key) || []).forEach(l => l());
}

export function useSharedSetting(key, fallback) {
  const subscribe = useCallback((l) => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(l);
    return () => listeners.get(key).delete(l);
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => read(key, fallback));
  const set = useCallback((v) => setSharedSetting(key, v), [key]);
  return [value, set];
}

// Same idea for in-memory state (not saved): e.g. the bomb's serial / module counts, which every
// Button window on the bomb uses. `initial` is used the first time a key is read.
const memValues = new Map();
const memListeners = new Map();

export function useSharedState(key, initial) {
  const subscribe = useCallback((l) => {
    if (!memListeners.has(key)) memListeners.set(key, new Set());
    memListeners.get(key).add(l);
    return () => memListeners.get(key).delete(l);
  }, [key]);
  if (!memValues.has(key)) memValues.set(key, typeof initial === 'function' ? initial() : initial);
  const value = useSyncExternalStore(subscribe, () => memValues.get(key));
  const set = useCallback((next) => {
    const v = typeof next === 'function' ? next(memValues.get(key)) : next;
    memValues.set(key, v);
    (memListeners.get(key) || []).forEach(l => l());
  }, [key]);
  return [value, set];
}
