import React, { useEffect, useState } from 'react';
import { startNewGame, GAME_ITEMS } from '../newGame.js';
import { useTouchScreen, tapWord } from '../../utils/touch.js';

/**
 * NEW GAME: forgets everything that changes per game (newGame.js). It takes two presses, the second
 * within 4 s, because it throws away manuals that took a while to paste. No toast (the bomb app has
 * none): the button itself says it worked.
 */
export function NewGameButton({ className = '' }) {
  const touch = useTouchScreen();
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 2500);
    return () => clearTimeout(t);
  }, [done]);

  const press = () => {
    if (!armed) { setArmed(true); setDone(false); return; }
    setArmed(false);
    startNewGame();
    setDone(true);
  };

  return (
    <button
      type="button"
      className={`newgame-btn ${armed ? 'armed' : ''} ${done ? 'done' : ''} ${className}`}
      onClick={press}
      title={`New game: forget ${GAME_ITEMS.join(', ')}`}
    >
      {armed ? `${tapWord(touch, true)} AGAIN TO CLEAR` : done ? '✓ NEW GAME STARTED' : '🆕 NEW GAME'}
    </button>
  );
}
