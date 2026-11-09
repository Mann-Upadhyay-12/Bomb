import React from 'react';
import { POS_NAMES } from './wofSolver.js';

export function WofWorking({
  disp = '',
  btns = ['', '', '', '', '', ''],
  lookIdx = -1,
  hitIdx = -1,
  onDispChange = () => {},
  onBtnChange = () => {},
  displayWords = [],
  buttonLabels = [],
  warnDisp = false,
  warnBtn = []
}) {
  return (
    <div className="wof-working-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      {/* Display Screen */}
      <div
        className="wof-disp-slot"
        style={{
          background: 'var(--paper)',
          border: `2px solid ${warnDisp ? 'var(--brass)' : 'var(--line)'}`,
          borderRadius: '10px',
          padding: '12px 24px',
          minWidth: '220px',
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--brass)', letterSpacing: '0.1em', marginBottom: '6px' }}>
          SCREEN DISPLAY
        </div>
        <select
          value={disp}
          onChange={(e) => onDispChange(e.target.value)}
          style={{
            fontFamily: 'monospace',
            fontSize: '16px',
            fontWeight: 700,
            background: 'var(--paper-raised)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '4px 8px'
          }}
        >
          <option value="">— select display —</option>
          {displayWords.map(w => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      {/* 6 Buttons arranged in 2 columns x 3 rows */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          width: '100%',
          maxWidth: '440px'
        }}
      >
        {btns.map((btnVal, i) => {
          const isLook = i === lookIdx;
          const isHit = i === hitIdx;

          let borderCol = 'var(--line)';
          let bgCol = 'var(--paper)';
          if (isHit) {
            borderCol = 'var(--select-green)';
            bgCol = 'rgba(72,187,120,0.18)';
          } else if (isLook) {
            borderCol = '#60A5FA';
            bgCol = 'rgba(96,165,250,0.12)';
          } else if (warnBtn[i]) {
            borderCol = 'var(--brass)';
            bgCol = 'var(--brass-dim)';
          }

          return (
            <div
              key={i}
              style={{
                border: `2px solid ${borderCol}`,
                background: bgCol,
                borderRadius: '8px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <div style={{ fontSize: '10px', color: isHit ? '#68D391' : 'var(--brass)', fontWeight: 700 }}>
                {POS_NAMES[i]} {isHit ? '★ PRESS THIS' : isLook ? '👁️ STEP 1 (LOOK)' : ''}
              </div>
              <select
                value={btnVal}
                onChange={(e) => onBtnChange(i, e.target.value)}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: 'var(--paper-raised)',
                  color: 'var(--ink)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  padding: '4px'
                }}
              >
                <option value="">— select —</option>
                {buttonLabels.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
