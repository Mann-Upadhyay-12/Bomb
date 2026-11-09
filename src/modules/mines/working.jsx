import React from 'react';
import { MINES_ROWS, MINES_COLS } from './minesSolver.js';

export function MinesWorking({
  gridData = [],
  prevSafeSet = new Set(),
  onCellClick = () => {}
}) {
  if (!gridData || gridData.length === 0) {
    return (
      <div className="shared-empty-state">
        <span className="shared-empty-text">No board loaded — upload or paste a Minesweeper screenshot</span>
      </div>
    );
  }

  return (
    <div className="board-container">
      <div
        className="board-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${MINES_COLS}, 42px)`
        }}
      >
        {gridData.map((row, r) =>
          row.map((cell, c) => {
            const isNew = cell.isSafe && !prevSafeSet.has(cell.name);
            const isPrev = (cell.isSafe && prevSafeSet.has(cell.name)) || (cell.state === '#' && prevSafeSet.has(cell.name));

            let cellClass = 'grid-cell';
            if (cell.state === '#') cellClass += ' covered';
            else if (cell.state === 'F') cellClass += ' flag';
            else cellClass += ' revealed';

            if (cell.isSafe) cellClass += ' is-safe';
            if (isNew) cellClass += ' is-new-safe';
            if (isPrev) cellClass += ' is-prev-safe';
            if (cell.isMine) cellClass += ' is-mine';

            let valDisplay = '';
            let valClass = '';
            if (cell.state === '#') valDisplay = '#';
            else if (cell.state === 'F') valDisplay = '🚩';
            else if (cell.state === 0) valDisplay = '';
            else {
              valDisplay = String(cell.state);
              valClass = 'c-' + cell.state;
            }

            return (
              <div
                key={`${r}-${c}`}
                className={cellClass}
                onClick={() => onCellClick(r, c)}
                title={`Cell ${cell.name} (click to cycle)`}
              >
                <span className="cell-name">{cell.name}</span>
                <span className={`cell-badge ${isNew ? 'new' : isPrev ? 'prev' : ''}`}>
                  {isNew ? 'NEW' : isPrev ? '✓' : ''}
                </span>
                <span className={valClass}>{valDisplay}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
