import React from 'react';

export function SwitchesWorking({
  currentState = 'UUUUU',
  goalState = 'DDDDD',
  path = null,
  stepIdx = 0,
  onSwitchClick = () => {},
  onSelectStep = () => {}
}) {
  return (
    <div className="switches-working-container">
      {/* 5 Physical Switch Sliders */}
      <div className="sw-row" style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '20px' }}>
        {[0, 1, 2, 3, 4].map(i => {
          const pos = currentState[i] || 'U';
          const gpos = goalState[i] || 'D';

          return (
            <div
              key={i}
              className="sw-item"
              onClick={() => onSwitchClick(i)}
              style={{ cursor: path ? 'default' : 'pointer' }}
            >
              <div className="sw-track">
                <div className={`sw-led lit pos-${gpos}`} />
                <div className={`sw-thumb pos-${pos}`} />
              </div>
              <div className="sw-num">{i + 1}</div>
            </div>
          );
        })}
      </div>

      {/* Path Step-by-Step Cards */}
      {path && path.length > 1 && (
        <div className="sw-sol-section" style={{ display: 'block', marginTop: '16px' }}>
          <div className="sw-sol-hdr" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--brass)', marginBottom: '8px' }}>
            SOLUTION SEQUENCE ({path.length - 1} MOVES)
          </div>
          <div className="sw-steps" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {path.map((stateStr, idx) => {
              const isStart = idx === 0;
              const prev = idx > 0 ? path[idx - 1] : null;
              let flipSw = null;
              if (prev) {
                const diff = stateStr.split('').findIndex((c, j) => c !== prev[j]);
                flipSw = diff >= 0 ? diff + 1 : null;
              }
              const isCurrent = idx === stepIdx;

              return (
                <div
                  key={idx}
                  className={`sw-step-card ${isCurrent ? 'active' : ''}`}
                  onClick={() => onSelectStep(idx)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: isCurrent ? '2px solid var(--brass)' : '1px solid var(--line)',
                    background: isCurrent ? 'var(--brass-dim)' : 'var(--paper)',
                    fontFamily: 'monospace'
                  }}
                >
                  <div style={{ fontSize: '10px', color: 'var(--brass)' }}>
                    {isStart ? 'START' : `STEP #${idx}: FLIP #${flipSw}`}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                    {stateStr}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
