import React from 'react';
import { STAGE_SYMBOLS } from './logicSolver.js';

export function LogicWorking({
  vars = { P: true, Q: true, R: false, S: true, T: true },
  stages = ['', '', '', '', ''],
  results = [null, null, null, null, null],
  onVarToggle = () => {},
  onStageChange = () => {},
  onPadInsert = () => {}
}) {
  const padSymbols = ['(', ')', '¬', '^', 'V', '→', 'P', 'Q', 'R', 'S', 'T'];

  return (
    <div className="logic-working-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Variable Truth Values */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span className="search-config-label">BOOLEAN VARIABLES:</span>
        {Object.keys(vars).map(k => {
          const val = vars[k];
          return (
            <button
              key={k}
              type="button"
              className="bg-btn"
              onClick={() => onVarToggle(k)}
              style={{
                borderColor: val ? 'var(--select-green)' : '#EF5350',
                color: val ? '#68D391' : '#EF5350',
                fontWeight: 700
              }}
            >
              {k} = {val ? 'T' : 'F'}
            </button>
          );
        })}
      </div>

      {/* Logic Keypad */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {padSymbols.map(sym => (
          <button
            key={sym}
            type="button"
            className="bg-btn"
            onClick={() => onPadInsert(sym)}
            style={{ minWidth: '38px', fontWeight: 700 }}
          >
            {sym}
          </button>
        ))}
      </div>

      {/* 5 Stage Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {STAGE_SYMBOLS.map((sym, idx) => {
          const res = results[idx];
          let badgeText = '–';
          let badgeColor = 'var(--line)';
          let textColor = 'var(--ink-soft)';
          if (res !== null) {
            badgeText = res.val ? 'T' : 'F';
            badgeColor = res.val ? 'var(--select-green)' : '#EF5350';
            textColor = res.val ? '#68D391' : '#EF5350';
          }

          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 700, fontSize: '18px', width: '24px', textAlign: 'center', color: 'var(--brass)' }}>
                {sym}
              </span>
              <input
                type="text"
                className="search-words-field"
                style={{ flex: 1 }}
                value={stages[idx]}
                onChange={(e) => onStageChange(idx, e.target.value)}
                placeholder={`Stage ${idx + 1} formula (e.g. (¬R^S)^¬S)`}
                spellCheck="false"
              />
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '6px',
                  border: `2px solid ${badgeColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                  color: textColor
                }}
              >
                {badgeText}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
