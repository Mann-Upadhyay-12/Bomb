import React, { useState } from 'react';
import { useBombClock, bombSecondsLeft, parseClock, fmtClock, useNow, BOMB_START } from '../bombClock.js';

/**
 * The bomb's timer in the top bar, counting down from 8:00 — for modules that may only be disarmed
 * while a digit is on the timer (Batteries: a 5 shows at 5:xx, x:5x and x:x5). ▶ as the bomb starts;
 * or type what the bomb's timer shows ("6:42") and Enter, to start or fix it mid-game. It is the
 * needy reminder's clock too (bombClock.js): starting or stopping one does the same to the other.
 */
export function BombTimer() {
  const { clock, running, start, stop } = useBombClock();
  const now = useNow(running, 200);
  const [typed, setTyped] = useState('');
  const left = bombSecondsLeft(clock, now);
  const typedSec = parseClock(typed);
  const sync = () => {
    if (typedSec == null || typedSec > BOMB_START) return;
    start(typedSec);
    setTyped('');
  };

  return (
    <div className={`bomb-timer ${running ? 'running' : ''}`} title="The bomb's timer (from 8:00). It starts and stops with the needy reminder.">
      <button
        type="button"
        className="bomb-timer-btn"
        onClick={() => (running ? stop() : start())}
        aria-pressed={running}
        title={running ? 'Stop the bomb timer and the needy reminder' : 'Press as the bomb starts: the timer counts down from 8:00 and the needy reminder starts too'}
      >
        <span className="needy-timer-icon" aria-hidden="true">{running ? '■' : '▶'}</span>
        {!running && <span>TIMER</span>}
      </button>
      <span className="bomb-timer-clock" aria-live="off">{fmtClock(running ? left : BOMB_START)}</span>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') sync(); }}
        onBlur={() => { if (typedSec != null) sync(); }}
        placeholder={running ? 'fix' : 'or 6:42'}
        inputMode="numeric"
        spellCheck="false"
        aria-label="What the bomb's timer shows now"
        title="Type what the bomb's timer shows right now (6:42), then Enter: starts or corrects the timer"
      />
    </div>
  );
}
