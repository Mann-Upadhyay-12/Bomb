// ── Did the player leave the page since they last did something on it? ──
// An answer can arrive seconds after the paste that started it (OCR of a manual, the chess engine).
// If the player has gone to Discord meanwhile and copied the next picture, copying the answer then
// would replace it, and their next paste here would put an old answer in ("it pastes the previous
// stage's answer"). So a copy only happens while the player hasn't left since their last action;
// otherwise the answer says NOT COPIED — CLICK HERE. Clicking an answer is an action, so it always copies.
let lastActAt = -Infinity;
let lastLeftAt = -Infinity;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const act = () => { lastActAt = now(); };
  const left = () => { lastLeftAt = now(); };
  // a pick in the file dialog takes the focus away too: the file arriving ('change') is an action
  for (const ev of ['pointerdown', 'touchstart', 'keydown', 'paste', 'drop', 'change', 'input']) window.addEventListener(ev, act, true);
  window.addEventListener('blur', left);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') left(); });
}

/** True when the page lost focus (or was hidden) after the player's last click / key / paste / drop. */
export function leftSinceLastAction(actAt = lastActAt, leftAt = lastLeftAt, hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden') {
  return hidden || leftAt > actAt;
}
