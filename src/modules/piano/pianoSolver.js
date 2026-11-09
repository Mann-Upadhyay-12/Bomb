// Pure Piano interval calculation and manual stage code table parsing

export const PN_STEPS = [0, 2, 4, 5, 7, 9, 11];
export const PN_LET = 'CDEFGAB';
export const PN_INT = [
  'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd',
  'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th',
  'Minor 7th', 'Major 7th', 'Octave'
];

export const PN_DEFAULT_CODES = "Minor 2nd 5.68  Major 2nd 6.99  Minor 3rd 2.33  Major 3rd 4.84  Perfect 4th 7.33  Tritone 8.69  Perfect 5th 5.44  Minor 6th 5.62  Major 6th 7.96  Minor 7th 8.05  Major 7th 6.13  Octave 3.98";

export function pnNote(clef, pos, acc) {
  const d = (clef === 'treble' ? 30 : 18) + pos;
  const l = ((d % 7) + 7) % 7;
  const o = Math.floor(d / 7);
  return {
    name: PN_LET[l] + (acc > 0 ? '♯' : acc < 0 ? '♭' : '') + o,
    semi: PN_STEPS[l] + 12 * o + acc
  };
}

export function pnParseCodes(t) {
  const m = {};
  const re = /(Minor 2nd|Major 2nd|Minor 3rd|Major 3rd|Perfect 4th|Tritone|Perfect 5th|Minor 6th|Major 6th|Minor 7th|Major 7th|Octave)\s*`?\s*([\d.]+)/gi;
  let r;
  while ((r = re.exec(t))) {
    m[r[1].toLowerCase()] = r[2];
  }
  return m;
}
