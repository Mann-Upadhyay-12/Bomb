// Wire Placement — the rule:
//   Ask the Defuser the colour of the wire on C3 and use that column. Cut every wire whose colour
//   and one of its two ends match a row in that column. Leave the rest.
// The table (header colour = C3 wire, left badge = cut-wire colour, cell = a cell code) changes
// from game to game, so it is read from the helper's picture, never built in.

export const CELLS = ['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2', 'A3', 'B3', 'C3', 'D3', 'A4', 'B4', 'C4', 'D4'];
export const PICK_COLORS = ['black', 'blue', 'red', 'white', 'yellow', 'green', 'orange', 'purple'];

export const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const wireLabel = w => `${w.a}-${w.b} ${cap(w.color)}`;

/**
 * table: { columns: [colour], rows: [{ color, cells: [code] }] }; wires: [{ color, a, b }].
 * → { ready, reason, c3, column, verdicts: [{ wire, cut, rows }], cut, copy }
 */
export function solveWirePlacement(table, wires) {
  const out = { ready: false, reason: '', c3: null, column: -1, verdicts: [], cut: [], copy: '' };
  if (!table) { out.reason = "Paste this game's Wire Placement table."; return out; }
  if (!wires || !wires.length) { out.reason = 'Paste the module picture (or add its wires).'; return out; }
  const c3 = wires.find(w => w.a === 'C3' || w.b === 'C3');
  if (!c3) { out.reason = 'No wire on C3 — check the board.'; return out; }
  out.c3 = c3;
  const column = table.columns.indexOf(c3.color);
  if (column < 0) { out.reason = `The table has no ${cap(c3.color)} column — check the header colours.`; return out; }
  out.column = column;
  out.verdicts = wires.map(w => {
    const rows = [];
    table.rows.forEach((row, r) => {
      const code = row.cells[column];
      if (row.color === w.color && code && (code === w.a || code === w.b)) rows.push(r);
    });
    return { wire: w, cut: rows.length > 0, rows };
  });
  out.cut = out.verdicts.filter(v => v.cut).map(v => v.wire);
  out.copy = out.cut.length ? out.cut.map(wireLabel).join(', ') : 'NONE';
  out.ready = true;
  return out;
}

// The 23 Nov 2026 game (tests/fixtures/wireplace_table.png + wireplace_module.png).
export const SAMPLE_TABLE = {
  columns: ['black', 'blue', 'red', 'white', 'yellow'],
  rows: [
    ['blue', 'B1 B2 D1 C4 B3'], ['blue', 'C1 B4 C2 A1 D3'], ['white', 'D2 A2 B1 A2 C2'], ['black', 'D4 A3 D2 B3 C4'],
    ['red', 'A2 C4 C3 A4 D4'], ['black', 'B2 A4 B4 D1 A2'], ['yellow', 'C3 A1 A3 D3 A1'], ['blue', 'C4 C1 B3 C1 C1'],
    ['red', 'A4 D1 D3 D2 D1'], ['yellow', 'A1 C2 A4 D4 B1']
  ].map(([color, cells]) => ({ color, cells: cells.split(' ') })),
  unsure: []
};
export const SAMPLE_WIRES = [
  ['yellow', 'A1', 'A2'], ['black', 'B1', 'B2'], ['yellow', 'C1', 'D1'], ['blue', 'C2', 'D2'],
  ['white', 'A3', 'B3'], ['blue', 'C3', 'D3'], ['yellow', 'A4', 'B4'], ['blue', 'C4', 'D4']
].map(([color, a, b]) => ({ color, a, b }));
