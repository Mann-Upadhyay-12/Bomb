import React from 'react';
import { useBombSerial, serialHasVowel, serialLastDigit } from '../bombSerial.js';

/** Top-bar serial input: one serial per game, used by every bomb and custom level. */
export function SerialBar() {
  const [serial, setSerial] = useBombSerial();
  const digit = serialLastDigit(serial);
  return (
    <label className={`serial-bar ${serial ? 'set' : ''}`} title="The serial number is the same on every bomb this game — modules that need it read it from here">
      <span className="serial-bar-label">SERIAL</span>
      <input
        type="text"
        value={serial}
        placeholder="type once per game"
        spellCheck="false"
        autoComplete="off"
        autoCapitalize="characters"
        onChange={(e) => setSerial(e.target.value)}
      />
      {serial && (
        <span className="serial-bar-facts">
          {serialHasVowel(serial) ? 'VOWEL' : 'NO VOWEL'}
          {digit !== null && ` · LAST ${digit % 2 ? 'ODD' : 'EVEN'}`}
        </span>
      )}
      {serial && (
        <button type="button" className="serial-bar-clear" onClick={(e) => { e.preventDefault(); setSerial(''); }} title="Clear the serial (new game)">✕</button>
      )}
    </label>
  );
}
