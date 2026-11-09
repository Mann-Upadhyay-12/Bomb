import React from 'react';

export function PasswordWorking({ cols = [], rowsCount = 0 }) {
  return (
    <div className="password-working-container">
      <div
        className="password-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(80px, 1fr))',
          gap: '10px'
        }}
      >
        {[0, 1, 2, 3, 4].map(colIdx => {
          const letterSet = cols[colIdx] || new Set();
          const letters = Array.from(letterSet).sort();

          return (
            <div
              key={colIdx}
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '10px',
                textAlign: 'center',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--ink)',
                minHeight: '90px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--brass)',
                  letterSpacing: '0.12em',
                  borderBottom: '1px solid var(--line)',
                  paddingBottom: '4px',
                  marginBottom: '2px'
                }}
              >
                COL {colIdx + 1}
              </div>

              {letters.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
                  {letters.map(char => (
                    <span
                      key={char}
                      style={{
                        background: 'var(--paper-raised)',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        padding: '3px 7px',
                        fontSize: '14px',
                        color: 'var(--ink)'
                      }}
                    >
                      {char}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ opacity: 0.3, paddingTop: '10px' }}>—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
