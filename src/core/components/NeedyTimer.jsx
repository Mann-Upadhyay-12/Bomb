import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '../ToastContext.jsx';
import { useSetting, needyLeadSeconds } from '../settings.js';

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
 * Play/stop button for the bomb's side (needy) modules: while running, the countdown restarts
 * every 30 s and a reminder pops up a few seconds before each restart (Settings; 5 s unless changed), as a system notification (asked for
 * on the first press), or as a toast in the page when notifications are blocked or unsupported.
 * Mount it with key={level id} so picking another level stops it. Time is measured from the
 * start, not by counting ticks, so a throttled background tab doesn't drift — the next reminder
 * still lands on time before the 30 s mark.
 */
export function NeedyTimer() {
  const { showToast } = useToast();
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [permission, setPermission] = useState(notifyPermission);
  const [leadSetting] = useSetting('needyLead');
  const [beepSetting] = useSetting('needyBeep');
  const leadMs = needyLeadSeconds(leadSetting) * 1000;
  // read by the running timer, so changing them in Settings doesn't restart the countdown
  const live = useRef({});
  live.current = { leadMs, beep: beepSetting === 'on' };

  useEffect(() => {
    if (startedAt == null) return;
    let fired = 0;
    let shown = null; // the notification on screen, closed when the cycle restarts
    let closeTimer = null;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
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

  const running = startedAt != null;
  const elapsed = running ? Math.max(0, now - startedAt) : 0;
  const left = Math.ceil((INTERVAL_MS - (elapsed % INTERVAL_MS)) / 1000);
  const notifying = permission === 'granted';

  const toggle = () => {
    if (running) {
      setStartedAt(null);
      return;
    }
    const t = Date.now();
    setNow(t);
    setStartedAt(t);
    if (beepSetting === 'on') prepareBeep(); // sound is only allowed once started from a press
    // ask once, from the click (browsers only allow the prompt from a user action)
    if (notifyPermission() === 'default') {
      try {
        Promise.resolve(Notification.requestPermission()).then(setPermission, () => {});
      } catch (e) { /* very old browsers */ }
    }
  };

  const title = running
    ? `Stop the needy reminder${notifying ? '' : ' — notifications are off for this page, so the reminder shows here as a pop-up instead (allow notifications in the browser\'s site settings to get them over other windows)'}`
    : `Remind me to check the needy modules ${leadMs / 1000} seconds before every 30-second mark (as a notification${beepSetting === 'on' ? ', with a beep' : ''})`;

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
