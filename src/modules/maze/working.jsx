import React from 'react';
import { MAZE_SIZE } from './mazeSolver.js';

export function MazeWorking({
  wallsGrid = [],
  startPos = { r: 0, c: 0 },
  goalPos = { r: 7, c: 7 },
  foundPath = null,
  onCellLeftClick = () => {},
  onCellRightClick = () => {}
}) {
  const pathMap = new Map();
  if (foundPath) {
    foundPath.forEach((p, idx) => pathMap.set(`${p.r}_${p.c}`, { move: p.move, step: idx + 1 }));
  }

  const N = MAZE_SIZE;

  return (
    <div className="maze-board-wrap">
      <div
        className="board-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${N}, 44px)`,
          gap: '2px',
          justifyContent: 'center'
        }}
      >
        {Array.from({ length: N }, (_, r) =>
          Array.from({ length: N }, (_, c) => {
            const w = (wallsGrid[r] && wallsGrid[r][c]) || { u: false, d: false, l: false, r: false };
            const isStart = r === startPos.r && c === startPos.c;
            const isGoal = r === goalPos.r && c === goalPos.c;
            const pathInfo = pathMap.get(`${r}_${c}`);

            let cls = 'maze-cell';
            if (w.u) cls += ' wall-u';
            if (w.d) cls += ' wall-d';
            if (w.l) cls += ' wall-l';
            if (w.r) cls += ' wall-r';
            if (isStart) cls += ' start-cell';
            else if (isGoal) cls += ' goal-cell';
            else if (pathInfo) cls += ' path-cell';

            const arrow = pathInfo
              ? pathInfo.move === 'U'
                ? '↑'
                : pathInfo.move === 'D'
                ? '↓'
                : pathInfo.move === 'L'
                ? '←'
                : '→'
              : '';

            return (
              <div
                key={`${r}-${c}`}
                className={cls}
                onClick={() => onCellLeftClick(r, c)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onCellRightClick(r, c);
                }}
                title={`Row ${r + 1}, Col ${c + 1} (Left-click=Start, Right-click=Goal)`}
              >
                <span className="cell-coord">{r + 1},{c + 1}</span>
                {isStart && <span>🔴 S</span>}
                {isGoal && <span>🟡 G</span>}
                {!isStart && !isGoal && pathInfo && (
                  <span>{arrow} {pathInfo.move}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
