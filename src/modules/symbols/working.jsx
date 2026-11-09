import React from 'react';
import { SY, SY_KEYS } from './symbolsConstants.js';

export function SymbolsWorking({
  buttons = [null, null, null, null],
  counts = {},
  order = [],
  onButtonSelect = () => {},
  onCountAdj = () => {}
}) {
  return (
    <div className="symbols-working-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 4 Module Buttons */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {buttons.map((k, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              background: 'var(--paper)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              minWidth: '110px'
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--brass)', fontWeight: 700 }}>
              BUTTON {i + 1}
            </div>
            <div style={{ fontSize: '32px', minHeight: '40px' }}>
              {k && SY[k] ? SY[k].glyph : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
              {k && SY[k] ? `${SY[k].name} · ${counts[k] || 0}` : 'not set'}
            </div>
            <select
              value={k || ''}
              onChange={(e) => onButtonSelect(i, e.target.value || null)}
              style={{
                background: 'var(--paper-raised)',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: '4px',
                padding: '2px 4px',
                fontSize: '11px',
                width: '100%'
              }}
            >
              <option value="">— select —</option>
              {SY_KEYS.map(x => (
                <option key={x} value={x}>{SY[x].glyph} {SY[x].name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Symbol Counts Table with +/- buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span className="search-config-label">SYMBOL OCCURRENCE COUNTS (± to adjust):</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
          {SY_KEYS.map(k => {
            const cnt = counts[k] || 0;
            return (
              <div
                key={k}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 8px',
                  background: 'var(--paper)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px'
                }}
              >
                <span style={{ fontSize: '20px' }}>{SY[k].glyph}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => onCountAdj(k, -1)}
                    style={{ background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer', fontWeight: 700 }}
                  >
                    −
                  </button>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: cnt > 0 ? 'var(--brass)' : 'var(--ink-soft)' }}>
                    {cnt}
                  </span>
                  <button
                    type="button"
                    onClick={() => onCountAdj(k, 1)}
                    style={{ background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer', fontWeight: 700 }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Press Order Steps */}
      {order.length === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span className="search-config-label">PRESS ORDER (HIGHEST COUNT FIRST):</span>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {order.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  background: 'var(--paper)',
                  border: '1px solid var(--brass)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px'
                }}
              >
                <span style={{ color: 'var(--brass)', fontWeight: 700 }}>{i + 1}. Press Button #{r.n}</span>
                <span>({SY[r.k]?.glyph} count: {r.c})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
