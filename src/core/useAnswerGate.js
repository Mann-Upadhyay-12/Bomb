import { useCallback, useRef } from 'react';

// Auto-copy must fire when a module's ANSWER changes, not when its tab / card becomes active again.
// Coming back to a solved module used to put its old answer on the clipboard, replacing the screenshot
// the player had just copied in Discord.
//
// Call `changed(key)` on EVERY run of the auto-copy effect, before the `if (!isActive) return`, so an
// answer that changed while the module was inactive is also absorbed and not copied on activation.
// `key` is the answer (plus anything that makes a repeat answer a new one, e.g. the stage number).
export function useAnswerGate() {
  const last = useRef(undefined);
  return useCallback((key) => {
    const changed = last.current !== key;
    last.current = key;
    return changed;
  }, []);
}
