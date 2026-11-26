import React from 'react';
import { STAGE_SYMBOLS, expressionTokens } from './logicSolver.js';

/** The formula as the solver reads it, each letter green (true) or red (false): a misread letter shows. */
function ColouredFormula({ expr, greek, vars }) {
  const tokens = expressionTokens(expr, greek, vars);
  if (!tokens.length) return null;
  return (
    <div className="logic-formula" aria-label="The formula with each letter coloured by its value">
      {tokens.map((tk, i) => {
        const val = tk.val === true ? ' t' : tk.val === false ? ' f' : '';
        return <span key={i} className={`lf ${tk.kind}${val}`} title={tk.kind === 'bad' ? 'not understood' : undefined}>{tk.t}</span>;
      })}
    </div>
  );
}

export function LogicWorking({
  vars = { P: true, Q: true, R: false, S: true, T: true },
  stages = ['', '', '', '', ''],
  results = [null, null, null, null, null],
  onVarToggle = () => {},
  onStageChange = () => {},
  onStageFocus = () => {},
  onStagePaste = () => {},
  activeStageIdx = 0,
  idPrefix = 'logic',
  onPadInsert = () => {}
}) {
  const padSymbols = ['(', ')', '¬', '^', 'V', '→', 'P', 'Q', 'R', 'S', 'T', 'α', 'β', 'γ', 'δ', '⌫'];

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
            onMouseDown={(e) => e.preventDefault() /* keep focus/caret in the stage input */}
            onClick={() => onPadInsert(sym)}
            title={sym === '⌫' ? 'Backspace' : `Insert ${sym} into stage ${activeStageIdx + 1}`}
            style={{ minWidth: '38px', fontWeight: 700, color: 'αβγδ'.includes(sym) ? 'var(--brass)' : undefined }}
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
          const hasError = res && res.error;
          const pending = res && res.pending; // needs an earlier stage's α–δ first
          if (pending) {
            badgeText = '…';
          } else if (hasError) {
            badgeText = '!';
            badgeColor = 'var(--brass)';
            textColor = 'var(--brass)';
          } else if (res) {
            badgeText = res.val ? 'T' : 'F';
            badgeColor = res.val ? 'var(--select-green)' : '#EF5350';
            textColor = res.val ? '#68D391' : '#EF5350';
          }

          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 700, fontSize: '18px', width: '24px', textAlign: 'center', color: 'var(--brass)' }}>
                {sym || '⑤'}
              </span>
              <input
                id={`${idPrefix}-stage${idx}`}
                type="text"
                className="search-words-field"
                style={{ flex: 1, minWidth: 0, borderColor: idx === activeStageIdx ? 'var(--brass)' : undefined }}
                value={stages[idx]}
                onFocus={() => onStageFocus(idx)}
                onPaste={(e) => onStagePaste(idx, e)}
                onChange={(e) => onStageChange(idx, e.target.value)}
                placeholder={`Stage ${idx + 1} formula (e.g. (¬R^S)^¬S)`}
                spellCheck="false"
              />
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  flexShrink: 0,
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
            {stages[idx] && stages[idx].trim() && (
              <ColouredFormula expr={stages[idx]} greek={(res && res.greek) || {}} vars={vars} />
            )}
            {hasError && (
              <div style={{ fontSize: '11px', color: pending ? 'var(--ink-soft)' : 'var(--brass)', fontFamily: 'monospace', paddingLeft: '34px' }}>
                {pending ? `waits for ${res.error.replace(/ not solved yet/, '')}: fill in its stage first` : `⚠ ${res.error}`}
              </div>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
