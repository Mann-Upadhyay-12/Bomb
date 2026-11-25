// The level on screen ({ modules, detected? } or null in "all modules"), for a module that needs the
// whole bomb (Bluescreen counts the disarmed modules in board order). `detected` is every card the
// board reader saw, the unsolvable ones too; `modules` is what the level shows.
import { createContext, useContext } from 'react';

export const LevelContext = createContext(null);
export const useLevel = () => useContext(LevelContext);

/** The bomb's cards in reading order (left → right, top → bottom), as far as the level knows them. */
export const boardOrder = (level) => (level ? (Array.isArray(level.detected) && level.detected.length ? level.detected : level.modules) || [] : []);
