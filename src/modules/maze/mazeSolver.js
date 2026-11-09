// Pure BFS shortest path solver for 8x8 maze grids

export const MAZE_SIZE = 8;

export function solveMazeBFS(wallsGrid, startPos, goalPos) {
  const N = MAZE_SIZE;
  const sr = startPos.r, sc = startPos.c, gr = goalPos.r, gc = goalPos.c;
  const queue = [[sr, sc, []]];
  const visited = new Set([`${sr}_${sc}`]);
  let foundPath = null;

  const moves = [
    [-1, 0, 'U', (r, c) => wallsGrid[r][c].u],
    [1, 0, 'D', (r, c) => wallsGrid[r][c].d],
    [0, -1, 'L', (r, c) => wallsGrid[r][c].l],
    [0, 1, 'R', (r, c) => wallsGrid[r][c].r]
  ];

  while (queue.length > 0) {
    const [cr, cc, path] = queue.shift();
    if (cr === gr && cc === gc) {
      foundPath = path;
      break;
    }
    for (const [dr, dc, moveChar, hasWall] of moves) {
      if (!hasWall(cr, cc)) {
        const nr = cr + dr, nc = cc + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N && !visited.has(`${nr}_${nc}`)) {
          visited.add(`${nr}_${nc}`);
          queue.push([nr, nc, [...path, { move: moveChar, r: nr, c: nc }]]);
        }
      }
    }
  }

  return foundPath;
}
