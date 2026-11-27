// The bomb's clock: one countdown from 8:00 that the top bar's timer, the needy reminder and
// Batteries' timer-digit help all read, so starting (or stopping) any of them does the same to the others.
//
// Stored as { at: Date.now() when set, sec: what the bomb's timer showed then } — "▶" at the bomb's
// start is { at: now, sec: 480 }; typing what the timer shows ("6:42") re-syncs it mid-game.
// The key is Batteries' old one (it had the first timer): rooms share it and New game clears it
// (roomKeys.js ROOM_MEMORY, newGame.js GAME_MEMORY), so a teammate's ▶ starts everyone's clock.
import { useEffect, useState } from 'react';
import { useSharedState } from './sharedSetting.js';
import { readSetting } from './settings.js';
import { BOMB_START, fmtClock } from '../modules/batteries/batteriesSolver.js';

export { BOMB_START, fmtClock };
export const BOMB_CLOCK_KEY = 'batteries_timer_sync';

/** Seconds left on the bomb's timer at `now` (ms), or null when the clock isn't running. */
export const bombSecondsLeft = (clock, now) =>
  clock ? Math.max(0, clock.sec - Math.floor((now - clock.at) / 1000)) : null;

/** When the bomb's timer showed 8:00 (ms) — the needy modules' 30-second cycles count from here. */
export const bombStartedAt = (clock) => (clock ? clock.at - (BOMB_START - clock.sec) * 1000 : null);

/** "6:42" / "6.42" → 402; anything else → null. */
export function parseClock(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})[:.](\d{2})$/);
  return m && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Things a browser only allows from a press: the needy reminder's notification prompt and its beep.
// Every ▶ that starts the clock calls this, so the reminder works whichever button started it.
let armHook = () => {};
export const setNeedyArm = (fn) => { armHook = fn; };

export function useBombClock() {
  const [clock, setClock] = useSharedState(BOMB_CLOCK_KEY, null);
  const start = (sec = BOMB_START) => {
    try { armHook(readSetting('needyBeep') === 'on'); } catch (e) { /* no notifications / audio */ }
    setClock({ at: Date.now(), sec });
  };
  const stop = () => setClock(null);
  return { clock, running: clock != null, start, stop };
}

/** Date.now(), refreshed every `ms` while `on`. */
export function useNow(on, ms = 200) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [on, ms]);
  return now;
}
