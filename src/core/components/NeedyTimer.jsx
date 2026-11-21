import React, { useEffect, useState } from 'react';
import { useToast } from '../ToastContext.jsx';

const INTERVAL_MS = 30000;
const MESSAGE = '⚠ PLEASE CHECK THE NEEDY';

/**
 * Play/stop button for the bomb's side (needy) modules: while running, a toast pops up
 * every 30 s. Mount it with key={level id} so picking another level stops it.
 * Time is measured from the start, not by counting ticks, so a throttled background tab
 * doesn't drift — the next reminder still lands on the 30 s mark.
 */
export function NeedyTimer() {
  const { showToast } = useToast();
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt == null) return;
    let fired = 0;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const due = Math.floor((t - startedAt) / INTERVAL_MS);
      if (due > fired) {
        fired = due;
        showToast(MESSAGE, false, 4000);
      }
    }, 250);
    return () => clearInterval(id);
    // showToast only calls state setters, so the first one stays valid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);

  const running = startedAt != null;
  const elapsed = running ? Math.max(0, now - startedAt) : 0;
  const left = Math.ceil((INTERVAL_MS - (elapsed % INTERVAL_MS)) / 1000);

  const toggle = () => {
    if (running) {
      setStartedAt(null);
    } else {
      const t = Date.now();
      setNow(t);
      setStartedAt(t);
    }
  };

  return (
    <button
      type="button"
      className={`needy-timer-btn ${running ? 'running' : ''}`}
      onClick={toggle}
      aria-pressed={running}
      title={running ? 'Stop the needy reminder' : 'Remind me to check the needy modules every 30 seconds'}
    >
      <span className="needy-timer-icon" aria-hidden="true">{running ? '■' : '▶'}</span>
      <span>{running ? `NEEDY 0:${String(left).padStart(2, '0')}` : 'NEEDY REMINDER'}</span>
    </button>
  );
}
