import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '../ToastContext.jsx';
import { useSetting, needyLeadSeconds } from '../settings.js';
import { useBombClock, bombStartedAt, setNeedyArm, useNow } from '../bombClock.js';

const INTERVAL_MS = 30000;
// The reminder comes this long before each 30 s cycle ends (Settings: 3 / 5 / 8 / 10 s; 5 s = at 0:25, 0:55, …)
const MESSAGE = '⚠ PLEASE CHECK THE NEEDY';

// Settings → beep: two short tones in the page, for when the notification is silent or blocked.
// The audio is started from the ▶ press (browsers only allow sound after a tap or click).
let audio = null;
export function prepareBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!audio && Ctx) audio = new Ctx();
    if (audio && audio.state === 'suspended') audio.resume();
  } catch (e) { audio = null; }
}
export function playBeep() {
  prepareBeep();
  if (!audio) return;
  const t = audio.currentTime;
  [0, 0.2].forEach((d) => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.15);
    o.connect(g).connect(audio.destination);
    o.start(t + d);
    o.stop(t + d + 0.16);
  });
}

const hasNotifications = () => typeof window !== 'undefined' && 'Notification' in window;
const notifyPermission = () => (hasNotifications() ? Notification.permission : 'unsupported');

// Whichever ▶ starts the bomb's clock (this button, the top bar's timer, Batteries' ▶ 8:00) does what
// the browser only allows from a press: start the beep's audio and ask once for notifications.
setNeedyArm((beep) => {
  if (beep) prepareBeep();
  if (notifyPermission() === 'default') {
    try { Promise.resolve(Notification.requestPermission()).catch(() => {}); } catch (e) { /* very old browsers */ }
  }
});

/**
 * A system notification (shows over Discord or any other window, unlike a toast in this page).
 * Closed when the 30 s cycle restarts, so they don't pile up. Returns it, or null if the
 * browser won't show one (permission not given, or e.g. Android Chrome, which only notifies
 * from a service worker) — the caller then falls back to the toast.
 */
function showNotification(leadMs) {
  if (notifyPermission() !== 'granted') return null;
  try {
    const n = new Notification(MESSAGE, {
      body: `${leadMs / 1000} seconds left in this 30-second cycle`,
      tag: 'needy-reminder'
    });
    n.onclick = () => { window.focus(); n.close(); };
    return n;
  } catch (e) {
    return null;
  }
}

/**
 * Play/stop button for the bomb's side (needy) modules: while running, a reminder pops up a few
 * seconds before every 30-second mark of the bomb (Settings; 5 s unless changed), as a system
 * notification (asked for on the first press), or as a toast in the page when notifications are
 * blocked or unsupported. It runs on the bomb's clock (bombClock.js): ▶ here starts the top bar's
 * timer at 8:00 too, ▶ there starts this, and ■ on either stops both. The 30-second marks count from
 * the bomb's 8:00, so a timer re-synced mid-game ("6:42") moves the reminders with it. Time is
 * measured from the start, not by counting ticks, so a throttled background tab doesn't drift.
 */
export function NeedyTimer() {
  const { showToast } = useToast();
  const { clock, running, start, stop } = useBombClock();
  const startedAt = bombStartedAt(clock);
  const now = useNow(running, 250);
  const [permission, setPermission] = useState(notifyPermission);
  const [leadSetting] = useSetting('needyLead');
  const [beepSetting] = useSetting('needyBeep');
  const leadMs = needyLeadSeconds(leadSetting) * 1000;
  // read by the running timer, so changing them in Settings doesn't restart the countdown
  const live = useRef({});
  live.current = { leadMs, beep: beepSetting === 'on' };

  useEffect(() => {
    if (startedAt == null) return;
    // a clock started now has no reminder due yet; one re-synced mid-game waits for the next 30-s mark
    let fired = Math.floor((Date.now() - startedAt + live.current.leadMs) / INTERVAL_MS);
    let shown = null; // the notification on screen, closed when the cycle restarts
    let closeTimer = null;
    const id = setInterval(() => {
      const t = Date.now();
      setPermission(notifyPermission()); // follows a change made in the browser's site settings
      const { leadMs: lead, beep } = live.current;
      const due = Math.floor((t - startedAt + lead) / INTERVAL_MS);
      if (due > fired) {
        fired = due;
        if (shown) shown.close();
        clearTimeout(closeTimer);
        shown = showNotification(lead);
        if (shown) closeTimer = setTimeout(() => { shown.close(); shown = null; }, lead);
        else showToast(MESSAGE, false, 4000, { needy: true });
        if (beep) playBeep();
      }
    }, 250);
    return () => {
      clearInterval(id);
      clearTimeout(closeTimer);
      if (shown) shown.close();
    };
    // showToast only calls state setters, so the first one stays valid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);

  const elapsed = running ? Math.max(0, now - startedAt) : 0;
  const left = Math.ceil((INTERVAL_MS - (elapsed % INTERVAL_MS)) / 1000);
  const notifying = permission === 'granted';

  const toggle = () => (running ? stop() : start());

  const title = running
    ? `Stop the needy reminder and the bomb timer${notifying ? '' : ' — notifications are off for this page, so the reminder shows here as a pop-up instead (allow notifications in the browser\'s site settings to get them over other windows)'}`
    : `Press as the bomb starts: reminds you to check the needy modules ${leadMs / 1000} seconds before every 30-second mark (as a notification${beepSetting === 'on' ? ', with a beep' : ''}) and starts the bomb timer at 8:00`;

  return (
    <button
      type="button"
      className={`needy-timer-btn ${running ? 'running' : ''}`}
      onClick={toggle}
      aria-pressed={running}
      title={title}
    >
      <span className="needy-timer-icon" aria-hidden="true">{running ? '■' : '▶'}</span>
      <span>{running ? `NEEDY 0:${String(left).padStart(2, '0')}` : 'NEEDY REMINDER'}</span>
      {running && !notifying && <span aria-label="notifications off">🔕</span>}
    </button>
  );
}
