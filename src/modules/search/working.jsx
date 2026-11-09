import React from 'react';

export function SearchWorking({
  gridData = [],
  confidence = [],
  hitCells = new Set(),
  onCellChange = () => {},
  onCellKeyDown = () => {},
  onCellPaste = () => {},
  idPrefix = 'search'
}) {
  return (
    <div className="search-board-wrap">
      <div
        className="board-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 52px)',
          gap: '4px',
          justifyContent: 'center'
        }}
      >
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const val = (gridData[r] && gridData[r][c]) || '';
            const conf = (confidence[r] && confidence[r][c]) !== undefined ? confidence[r][c] : 100;
            const isHit = hitCells.has(`${r}_${c}`);
            const isLowConf = !isHit && (conf < 60 || !val || val === '?');

            let cls = 'search-cell';
            if (isHit) cls += ' highlighted';
            else if (isLowConf) cls += ' low-confidence';

            return (
              <input
                key={`${r}-${c}`}
                id={`${idPrefix}-sc_${r}_${c}`}
                type="text"
                className={cls}
                inputMode="text"
                onFocus={(e) => e.target.select()}
                value={val}
                autoComplete="off"
                spellCheck="false"
                onChange={(e) => onCellChange(r, c, e.target.value)}
                onKeyDown={(e) => onCellKeyDown(r, c, e)}
                onPaste={(e) => onCellPaste(r, c, e)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
