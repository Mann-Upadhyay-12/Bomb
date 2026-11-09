import React from 'react';
import { SINAMES } from './simonsSolver.js';

export function SimonsWorking({
  entries = [],
  onAddColor = () => {},
  onRemoveEntry = () => {},
  onClear = () => {}
}) {
  const COLOR_BUTTONS = [
    { key: 'R', bg: '#EF5350', label: 'RED' },
    { key: 'B', bg: '#42A5F5', label: 'BLUE' },
    { key: 'Y', bg: '#FDD835', label: 'YELLOW' },
    { key: 'G', bg: '#66BB6A', label: 'GREEN' }
  ];

  return (
    <div className="simons-working-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 4 Colored Buttons for Manual Input */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        {COLOR_BUTTONS.map(btn => (
          <button
            key={btn.key}
            type="button"
            className="bg-btn"
            onClick={() => onAddColor(btn.key)}
            style={{
              background: btn.bg,
              color: btn.key === 'Y' ? '#000' : '#FFF',
              fontWeight: 700,
              padding: '10px 18px',
              borderRadius: '8px'
            }}
          >
            + {btn.label}
          </button>
        ))}
      </div>

      {/* Flashed sequence list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="search-config-label">FLASHED COLORS SEQUENCE ({entries.length} STEPS):</span>
          {entries.length > 0 && (
            <button type="button" className="bg-btn" onClick={onClear}>
              Clear sequence
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {entries.map((c, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                fontFamily: 'monospace'
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--brass)' }}>#{idx + 1}:</span>
              <span style={{ fontWeight: 700, color: c === 'R' ? '#EF5350' : c === 'B' ? '#42A5F5' : c === 'Y' ? '#FDD835' : '#66BB6A' }}>
                {SINAMES[c] || c}
              </span>
              <button
                type="button"
                onClick={() => onRemoveEntry(idx)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-soft)',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
