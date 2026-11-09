import React from 'react';

const WS_COLORS = ['red', 'blue', 'black'];
const WS_CVAR = { red: '#C0392B', blue: '#2F6DB5', black: 'var(--ink)' };
const WS_DESTS = ['A', 'B', 'C'];
const wsCap = s => s[0].toUpperCase() + s.slice(1);

export function WireseqWorking({
  panel = [ { c: null, d: null }, { c: null, d: null }, { c: null, d: null } ],
  counts = { red: 0, blue: 0, black: 0 },
  results = [],
  onWireColorChange = () => {},
  onWireDestChange = () => {}
}) {
  return (
    <div className="wireseq-working-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 3 Wire Rows in current panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {panel.map((w, i) => {
          const res = results[i] || { state: 'empty' };
          let badgeText = '—';
          let badgeColor = 'var(--line)';
          let textColor = 'var(--ink-soft)';
          if (res.state === 'cut') {
            badgeText = 'CUT';
            badgeColor = 'var(--select-green)';
            textColor = '#68D391';
          } else if (res.state === 'skip') {
            badgeText = 'KEEP';
            badgeColor = '#EF5350';
            textColor = '#EF5350';
          }

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 12px',
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: '8px'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--brass)', width: '20px' }}>
                {i + 1}
              </div>

              {/* Color pickers */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {WS_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`bg-btn ${w.c === c ? 'active' : ''}`}
                    style={{
                      borderColor: w.c === c ? WS_CVAR[c] : 'var(--line)',
                      color: w.c === c ? WS_CVAR[c] : 'var(--ink)',
                      fontWeight: 700,
                      padding: '4px 8px',
                      fontSize: '12px'
                    }}
                    onClick={() => onWireColorChange(i, w.c === c ? null : c)}
                  >
                    {wsCap(c)}
                  </button>
                ))}
              </div>

              {/* Destination pickers */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {WS_DESTS.map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`bg-btn ${w.d === d ? 'active' : ''}`}
                    style={{
                      borderColor: w.d === d ? 'var(--brass)' : 'var(--line)',
                      color: w.d === d ? 'var(--brass)' : 'var(--ink)',
                      fontWeight: 700,
                      padding: '4px 10px',
                      fontSize: '12px'
                    }}
                    onClick={() => onWireDestChange(i, w.d === d ? null : d)}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* Result badge */}
              <div
                style={{
                  marginLeft: 'auto',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${badgeColor}`,
                  color: textColor,
                  fontWeight: 700,
                  fontSize: '12px'
                }}
              >
                {badgeText}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cumulative Occurrence Counts */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', justifyContent: 'center' }}>
        {WS_COLORS.map(c => (
          <div key={c} style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: WS_CVAR[c] }}>
            {wsCap(c)}: {counts[c]} cut/seen
          </div>
        ))}
      </div>
    </div>
  );
}
