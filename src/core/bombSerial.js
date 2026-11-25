// The bomb's serial number. It is the same on every bomb in one game, so it is typed once in the
// top bar and every module that needs it (Simon Says, The Button, Complex Wires) reads it from here.
// Saved in localStorage so a reload mid-game keeps it.
import { useSharedSetting } from './sharedSetting.js';

export const SERIAL_KEY = 'bombvision_serial';

/** Upper-case, letters and digits only. */
export const cleanSerial = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const serialHasVowel = (s) => /[AEIOU]/.test(cleanSerial(s));

/** Last digit of the serial, or null when it has none. */
export function serialLastDigit(s) {
  const d = cleanSerial(s).match(/\d/g);
  return d ? Number(d[d.length - 1]) : null;
}

/** [serial, setSerial] shared by every window. */
export function useBombSerial() {
  const [raw, set] = useSharedSetting(SERIAL_KEY, '');
  return [cleanSerial(raw), (v) => set(cleanSerial(v))];
}
