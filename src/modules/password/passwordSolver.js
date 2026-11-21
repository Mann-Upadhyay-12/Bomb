// Pure Password solver filtering master dictionary against column candidates

/**
 * Letter rows from the rows box: every row is exactly 5 letters, so the rows are simply every 5
 * letters in order — spaces, new lines, commas and anything else that isn't a letter are ignored
 * ("LHLODLBANE" = "LHLOD LBANE" = "LHLOD\nLBANE"). An unfinished last row (< 5 letters) is left out.
 */
export function splitPasswordRows(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z]/g, '').match(/[A-Z]{5}/g) || [];
}

export const MASTER_PASSWORDS = [
  "BELOW", "AGAIN", "STUDY", "LEARN", "HEART", "MUSIC", "WRITE", "WOULD", "START", "FIRST",
  "THERE", "SMALL", "SOUND", "WHERE", "PLACE", "STILL", "THINK", "GREEN", "COULD", "CHAIR",
  "THESE", "CLEAN", "WHICH", "THREE", "ABOUT", "AFTER", "BUILD", "CANCEL", "CLOCK", "EVERY",
  "FOUND", "GREAT", "GROUP", "HANDS", "HOUSE", "LARGE", "NEVER", "OTHER", "PLANT", "POINT",
  "RIGHT", "SPELL", "THING", "WATER", "WORLD"
];

export function filterPasswordCandidates(rows, masterWords) {
  const masterSet = Array.from(new Set(
    (masterWords || '')
      .toUpperCase()
      .split(/[\s,]+/)
      .map(w => w.trim().replace(/[^A-Z]/g, ''))
      .filter(w => w.length === 5)
  ));

  const validRows = rows
    .map(l => l.trim().toUpperCase().replace(/[^A-Z]/g, ''))
    .filter(l => l.length === 5);

  if (!validRows.length) {
    return {
      rows: [],
      masterSet,
      matches: [],
      cols: Array.from({ length: 5 }, () => new Set())
    };
  }

  const cols = Array.from({ length: 5 }, () => new Set());
  validRows.forEach(r => {
    for (let i = 0; i < 5; i++) {
      cols[i].add(r[i]);
    }
  });

  const matches = masterSet.filter(word => {
    for (let i = 0; i < 5; i++) {
      if (!cols[i].has(word[i])) return false;
    }
    return true;
  });

  return { rows: validRows, masterSet, matches, cols };
}
