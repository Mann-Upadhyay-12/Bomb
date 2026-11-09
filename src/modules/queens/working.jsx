import React from 'react';
import { QUEENS_PALETTE } from './queensConstants.js';

export function QueensWorking({
  regionGrid = [],
  queensMap = [],
  onCellToggle = () => {}
}) {
  if (!regionGrid || regionGrid.length === 0) {
    return (
      <div className="shared-empty-state">
        <span className="shared-empty-text">No Queens board loaded — upload or paste an 8×8 Queens image</span>
      </div>
    );
  }

  return (
    <div className="board-container">
      <div
        className="board-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 44px)',
          gap: '2px'
        }}
      >
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => {
            const regId = (regionGrid[r] && regionGrid[r][c]) || 1;
            const colorHex = QUEENS_PALETTE[(regId - 1) % QUEENS_PALETTE.length];
            const hasQ = queensMap[r] && queensMap[r][c];
            const cellName = String.fromCharCode(65 + c) + (r + 1);

            return (
              <div
                key={`${r}-${c}`}
                className={`grid-cell ${hasQ ? 'has-queen' : ''}`}
                style={{
                  backgroundColor: colorHex,
                  color: '#12141A',
                  position: 'relative'
                }}
                onClick={() => onCellToggle(r, c)}
                title={`Cell ${cellName} (Region ${regId}) - click to toggle queen`}
              >
                <span className="cell-name" style={{ color: 'rgba(0,0,0,0.6)' }}>
                  {cellName}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
