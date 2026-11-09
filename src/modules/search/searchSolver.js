// Pure 8-directional word search algorithm on a 5x5 letter grid

export function solveWordSearch(grid5x5, targetWords) {
  const wordSet = new Set(
    (targetWords || '')
      .toUpperCase()
      .split(/[\s,]+/)
      .map(w => w.trim().replace(/[^A-Z]/g, ''))
      .filter(w => w.length >= 2)
  );

  const directions = [
    [0, 1],   // Right
    [0, -1],  // Left
    [1, 0],   // Down
    [-1, 0],  // Up
    [1, 1],   // Down-Right
    [1, -1],  // Down-Left
    [-1, 1],  // Up-Right
    [-1, -1]  // Up-Left
  ];

  const foundMatches = [];
  const hitCells = new Set();

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      for (const [dr, dc] of directions) {
        for (let len = 3; len <= 5; len++) {
          const endR = r + (len - 1) * dr;
          const endC = c + (len - 1) * dc;
          if (endR < 0 || endR >= 5 || endC < 0 || endC >= 5) continue;

          let candidate = '';
          const path = [];
          for (let i = 0; i < len; i++) {
            const cr = r + i * dr, cc = c + i * dc;
            const letter = grid5x5[cr]?.[cc];
            if (!letter) break;
            candidate += letter;
            path.push([cr, cc]);
          }

          if (candidate.length === len && wordSet.has(candidate)) {
            const revBoardStr = candidate.split('').reverse().join('');
            foundMatches.push({
              word: candidate,
              path,
              revBoardStr,
              isRev: dr < 0 || dc < 0
            });
            path.forEach(([pr, pc]) => hitCells.add(`${pr}_${pc}`));
          }
        }
      }
    }
  }

  const uniqueWords = Array.from(new Set(foundMatches.map(m => m.word)));
  return { foundMatches, uniqueWords, hitCells, totalWords: wordSet.size };
}
