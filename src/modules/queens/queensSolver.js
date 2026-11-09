// Pure 8-Queens solver with region constraints and adjacent diagonal rules

export function solveQueensPuzzle(regionGrid) {
  if (!regionGrid || regionGrid.length !== 8) return [];

  const solutions = [];

  function canPlace(row, col, queens) {
    for (let r = 0; r < queens.length; r++) {
      const qc = queens[r];
      if (qc === col) return false;
      // No two queens may touch horizontally, vertically, or diagonally
      if (Math.abs(r - row) <= 1 && Math.abs(qc - col) <= 1) return false;
      // Exactly 1 queen per color region
      if (regionGrid[r][qc] === regionGrid[row][col]) return false;
    }
    return true;
  }

  function backtrack(row, queens) {
    if (row === 8) {
      solutions.push([...queens]);
      return;
    }
    for (let c = 0; c < 8; c++) {
      if (canPlace(row, c, queens)) {
        queens.push(c);
        backtrack(row + 1, queens);
        queens.pop();
      }
    }
  }

  backtrack(0, []);
  return solutions;
}
