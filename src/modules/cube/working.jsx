import React, { useRef, useEffect } from 'react';
import { COLS } from './cubeVision.js';

export function CubeWorking({
  cells = { U: Array(9).fill('W'), F: Array(9).fill('G'), R: Array(9).fill('R') },
  onCellColorCycle = () => {}
}) {
  const COLOR_ORDER = ['W', 'Y', 'G', 'B', 'R', 'O'];

  return (
    <div className="cube-working-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      {/* 3 Visible Cube Faces (U, F, R) */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {['U', 'F', 'R'].map(face => {
          const faceTitle = face === 'U' ? 'TOP (U)' : face === 'F' ? 'FRONT-LEFT (F)' : 'FRONT-RIGHT (R)';
          const faceCells = cells[face] || Array(9).fill('W');

          return (
            <div key={face} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brass)' }}>{faceTitle}</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 34px)',
                  gap: '4px',
                  background: '#12141A',
                  padding: '6px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)'
                }}
              >
                {faceCells.map((colorKey, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      const curIdx = COLOR_ORDER.indexOf(colorKey);
                      const nextColor = COLOR_ORDER[(curIdx + 1) % COLOR_ORDER.length];
                      onCellColorCycle(face, idx, nextColor);
                    }}
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '4px',
                      background: COLS[colorKey] || '#FFF',
                      border: '1px solid rgba(0,0,0,0.4)',
                      cursor: 'pointer'
                    }}
                    title={`${face}[${idx}]: ${colorKey} (click to cycle)`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
        Click any square above to cycle colors (White → Yellow → Green → Blue → Red → Orange)
      </div>
    </div>
  );
}
