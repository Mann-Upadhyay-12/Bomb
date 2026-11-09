export const CW_LETTERS = ['C', 'D', 'S', 'P', 'B'];

export const CW_REGIONS = [
  ['Star+LED', 196, 109], ['Red+LED', 357, 115], ['Red', 445, 85], ['Red+Star+LED', 252, 164],
  ['Star', 93, 212], ['Red+Blue+LED', 466, 214], ['Red+Star', 137, 295], ['Red+Blue+Star+LED', 333, 304],
  ['Blue+LED', 510, 305], ['Red+Blue+Star', 190, 370], ['LED', 552, 395], ['Red+Blue', 143, 436],
  ['Blue+Star+LED', 419, 430], ['Blue+Star', 330, 479], ['Blue', 258, 538], ['None', 659, 571]
].map(([id, x, y]) => ({ id, label: id === 'None' ? 'No features' : id.replace(/\+/g, ' + ') }));

export const CW_PRESETS = {
  preset1: { None: 'P', Red: 'S', Blue: 'D', Star: 'B', LED: 'B', 'Red+Blue': 'C', 'Red+Star': 'C', 'Red+LED': 'D', 'Blue+Star': 'B', 'Blue+LED': 'P', 'Star+LED': 'S', 'Red+Blue+Star': 'S', 'Red+Blue+LED': 'S', 'Red+Star+LED': 'P', 'Blue+Star+LED': 'C', 'Red+Blue+Star+LED': 'D' },
  preset2: { None: 'D', Red: 'D', Blue: 'S', Star: 'C', LED: 'P', 'Red+Blue': 'C', 'Red+Star': 'C', 'Red+LED': 'P', 'Blue+Star': 'B', 'Blue+LED': 'S', 'Star+LED': 'S', 'Red+Blue+Star': 'B', 'Red+Blue+LED': 'B', 'Red+Star+LED': 'S', 'Blue+Star+LED': 'D', 'Red+Blue+Star+LED': 'P' },
  preset3: { None: 'C', Red: 'P', Blue: 'C', Star: 'D', LED: 'P', 'Red+Blue': 'C', 'Red+Star': 'S', 'Red+LED': 'B', 'Blue+Star': 'S', 'Blue+LED': 'P', 'Star+LED': 'P', 'Red+Blue+Star': 'S', 'Red+Blue+LED': 'D', 'Red+Star+LED': 'S', 'Blue+Star+LED': 'B', 'Red+Blue+Star+LED': 'B' },
  preset4: { None: 'S', Red: 'D', Blue: 'S', Star: 'D', LED: 'B', 'Red+Blue': 'S', 'Red+Star': 'P', 'Red+LED': 'D', 'Blue+Star': 'B', 'Blue+LED': 'P', 'Star+LED': 'S', 'Red+Blue+Star': 'C', 'Red+Blue+LED': 'C', 'Red+Star+LED': 'P', 'Blue+Star+LED': 'P', 'Red+Blue+Star+LED': 'C' }
};

export const cwKey = w => {
  const p = [];
  if (w.color === 'red' || w.color === 'striped') p.push('Red');
  if (w.color === 'blue' || w.color === 'striped') p.push('Blue');
  if (w.star) p.push('Star');
  if (w.led) p.push('LED');
  return p.length ? p.join('+') : 'None';
};

export function cwRuleFor(letter, edge) {
  switch (letter) {
    case 'C': return { cut: true, why: 'Rule C: always CUT' };
    case 'D': return { cut: false, why: 'Rule D: never cut → LEAVE' };
    case 'S': return { cut: edge.even, why: 'Rule S: last serial digit is ' + (edge.even ? 'even → CUT' : 'odd → LEAVE') };
    case 'P': return { cut: edge.needy, why: 'Rule P: needy module ' + (edge.needy ? 'present → CUT' : 'not present → LEAVE') };
    case 'B': return { cut: edge.gte5, why: 'Rule B: ' + (edge.gte5 ? '5 or more modules → CUT' : 'fewer than 5 modules → LEAVE') };
    default: return { cut: false, why: 'Unknown rule letter “' + letter + '”' };
  }
}
