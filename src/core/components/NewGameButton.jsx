import React, { useEffect, useState } from 'react';
import { startNewGame, GAME_ITEMS } from '../newGame.js';
import { useTouchScreen, tapWord } from '../../utils/touch.js';
import { useRoom, roomNewGame, nameOf, sayError } from '../room/roomClient.js';

/**
 * NEW GAME: forgets everything that changes per game (newGame.js). It takes two presses, the second
 * within 4 s, because it throws away manuals that took a while to paste. No toast (the bomb app has
 * none): the button itself says it worked.
 *
 * In a room the game data is everyone's, so only the host can start a new game, for the whole room
 * (docs/rooms-plan.md §8). Everyone else's button is greyed out.
 */
export function NewGameButton({ className = '' }) {
  const touch = useTouchScreen();
  const { room, newGame } = useRoom();
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const host = room && room.host === room.me;
  const notHost = room && !host;

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  useEffect(() => {
    if (!done && !error) return undefined;
    const t = setTimeout(() => { setDone(false); setError(''); }, 2500);
    return () => clearTimeout(t);
  }, [done, error]);
  // the host started a new game (also when that's someone else's app): say so for a moment
  const [byNote, setByNote] = useState('');
  useEffect(() => {
    if (!newGame || Date.now() - newGame.at > 3000) return undefined;
    setByNote(newGame.by && room && newGame.by !== room.me ? nameOf(newGame.by) : '');
    setDone(true);
    return undefined;
  }, [newGame]);

  const press = async () => {
    if (notHost || busy) return;
    if (!armed) { setArmed(true); setDone(false); setError(''); return; }
    setArmed(false);
    if (room) {
      setBusy(true);
      try { await roomNewGame(); setByNote(''); setDone(true); }
      catch (e) { setError(sayError(e)); }
      finally { setBusy(false); }
      return;
    }
    startNewGame();
    setByNote('');
    setDone(true);
  };

  const label = busy ? '🆕 STARTING…'
    : error ? 'COULDN’T START — TRY AGAIN'
    : armed ? `${tapWord(touch, true)} AGAIN TO CLEAR${room ? ' FOR THE ROOM' : ''}`
    : done ? `✓ NEW GAME STARTED${byNote ? ` (by ${byNote})` : ''}`
    : notHost ? '🆕 HOST STARTS NEW GAMES'
    : '🆕 NEW GAME';

  return (
    <button
      type="button"
      className={`newgame-btn ${armed ? 'armed' : ''} ${done ? 'done' : ''} ${notHost ? 'locked' : ''} ${className}`}
      onClick={press}
      aria-disabled={notHost || busy ? 'true' : undefined}
      title={notHost
        ? `In a room only the host (${nameOf(room.host)}) starts a new game: it clears the game for everyone`
        : error || `New game${room ? ' for the whole room' : ''}: forget ${GAME_ITEMS.join(', ')}`}
    >
      {label}
    </button>
  );
}
