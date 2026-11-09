import React from 'react';
import { CW_REGIONS, CW_LETTERS, cwKey } from './complexwiresConstants.js';

export function ComplexWiresWorking({
  wires = [],
  rules = {},
  edge = { even: false, needy: false, gte5: true },
  results = [],
  onWireToggle = () => {},
  onWireColor = () => {},
  onWireStar = () => {},
  onWireLed = () => {},
  onRuleChange = () => {}
}) {
  const COLOR_OPTIONS = ['white', 'red', 'blue', 'striped'];

  return (
    <div className="complexwires-working-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 6 Wire Strips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {wires.map((w, i) => {
          const res = results[i] || { cut: false, why: '' };

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 14px',
                background: w.active ? 'var(--paper)' : 'rgba(255,255,255,0.02)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                opacity: w.active ? 1 : 0.4
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--brass)', width: '20px' }}>
                {i + 1}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={w.active}
                  onChange={(e) => onWireToggle(i, e.target.checked)}
                />
                On
              </label>

              {/* Wire Color swatches */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {COLOR_OPTIONS.map(c => {
                  const isSel = w.color === c;
                  let bg = '#FFFFFF';
                  if (c === 'red') bg = '#EF5350';
                  else if (c === 'blue') bg = '#42A5F5';
                  else if (c === 'striped') bg = 'repeating-linear-gradient(45deg, #EF5350, #EF5350 4px, #42A5F5 4px, #42A5F5 8px)';

                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onWireColor(i, c)}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        background: bg,
                        border: isSel ? '2px solid var(--brass)' : '1px solid var(--line)',
                        cursor: 'pointer'
                      }}
                      title={c}
                    />
                  );
                })}
              </div>

              {/* Star toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={w.star}
                  onChange={(e) => onWireStar(i, e.target.checked)}
                />
                ★ Star
              </label>

              {/* LED toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={w.led}
                  onChange={(e) => onWireLed(i, e.target.checked)}
                />
                💡 LED
              </label>

              {/* Result Cut Badge */}
              {w.active && (
                <div
                  style={{
                    marginLeft: 'auto',
                    fontWeight: 700,
                    fontSize: '12px',
                    color: res.cut ? '#68D391' : '#EF5350',
                    border: `1px solid ${res.cut ? 'var(--select-green)' : '#EF5350'}`,
                    padding: '3px 8px',
                    borderRadius: '4px'
                  }}
                >
                  {res.cut ? 'CUT' : 'LEAVE'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 16 Venn Regions Manual Rule Letter Assignment */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span className="search-config-label">VENN DIAGRAM RULE LETTERS (16 COMBINATIONS):</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px' }}>
          {CW_REGIONS.map(reg => (
            <div
              key={reg.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                fontSize: '11px'
              }}
            >
              <span style={{ color: 'var(--ink-soft)' }}>{reg.label}</span>
              <select
                value={rules[reg.id] || 'C'}
                onChange={(e) => onRuleChange(reg.id, e.target.value)}
                style={{
                  background: 'var(--paper-raised)',
                  color: 'var(--brass)',
                  border: '1px solid var(--line)',
                  borderRadius: '4px',
                  fontWeight: 700,
                  padding: '2px 4px'
                }}
              >
                {CW_LETTERS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
