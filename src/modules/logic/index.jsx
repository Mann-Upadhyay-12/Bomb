
import React, { useState, useEffect } from 'react';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { LogicWorking } from './working.jsx';
import {STAGE_SYMBOLS, evaluateExpression, readLogicGrid, detectStage} from './logicSolver.js';
// Extract Boolean assignments from arbitrary text.
const VAR_RE = /\b([PQRST])\s*[:=]\s*(TRUE|FALSE|T|F|1|0)\b/gi;

const DEFAULT_MANUAL_TEXT = 'P = T, Q = T, R = F, S = T, T = T';

const DEFAULT_VARS = {
  P: true,
  Q: true,
  R: false,
  S: true,
  T: true
};

export function LogicModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [vars, setVars] = useState(DEFAULT_VARS);
  const [manualText, setManualText] = useState(DEFAULT_MANUAL_TEXT);
  const [stages, setStages] = useState([
    '(¬R^S)^¬S', '', '', '', ''
  ]);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Parse the single input and update only variables that were supplied.
  const handleManualTextChange = (text) => {
    setManualText(text);

    const matches = [...text.matchAll(VAR_RE)];

    if (matches.length === 0) return;

    const updates = {};

    for (const match of matches) {
      const key = match[1].toUpperCase();
      const value = match[2].toUpperCase();

      updates[key] =
        value === 'T' ||
        value === 'TRUE' ||
        value === '1';
    }

    setVars(prev => ({ ...prev, ...updates }));
  };

  // Evaluate each stage using the current variable assignments.
const results = (() => {
  const greek = {};
  return stages.map((expr, i) => {
    if (!expr || !expr.trim()) return null;
    try {
      const val = evaluateExpression(expr, greek, vars);
      if (STAGE_SYMBOLS[i]) greek[STAGE_SYMBOLS[i]] = val;
      return { val };
    } catch {
      return null;
    }
  });
})();

  const validResults = results
    .map((result, i) =>
      result !== null
        ? `${STAGE_SYMBOLS[i]}=${result.val ? 'T' : 'F'}`
        : null
    )
    .filter(Boolean);

  const copyFormatted = validResults.join(' ');

  useEffect(() => {
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && copyFormatted) {
      copy(copyFormatted);
    }
  }, [copyFormatted, isActive]);

  const handleVarToggle = (key) => {
    setVars(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleStageChange = (idx, value) => {
    setStages(prev =>
      prev.map((stage, i) => i === idx ? value : stage)
    );
    setActiveStageIdx(idx);
  };

  const handlePadInsert = (symbol) => {
    const current = stages[activeStageIdx] || '';
    handleStageChange(activeStageIdx, current + symbol);
  };

  const handleSample = () => {
    setVars({ P: true, Q: true, R: false, S: true, T: true });
    setStages(['(¬R^S)^¬S', 'P→(QVR)', '¬(P^Q)→T', '', '']);
    showToast('SAMPLE LOGIC STAGES LOADED ✓');
  };

  const handleClear = () => {
    setStages(['', '', '', '', '']);
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('LOGIC CLEARED ✓');
  };

  const copyItems = validResults.map(item => ({
    label: item,
    value: item
  }));

  const stampStats =
    `STAGES SOLVED: ${validResults.length} / 5 | EVAL: ${copyFormatted || 'NONE'}`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone

onImage={(img, dataUri, fileBlob) => {
  setPreviewUri(dataUri);
  setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
  setLastImage(img, fileBlob);

  let w = img.naturalWidth, h = img.naturalHeight;
  const MAXDIM = 1200;
  if (w > MAXDIM || h > MAXDIM) {
    const scale = MAXDIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const { text } = readLogicGrid(data, w, h);
  const { idx } = detectStage(data, w, h);

  if (text) {
    handleStageChange(Math.min(idx, 4), text);
    showToast(`STAGE ${idx + 1} READ: ${text}`);
  } else {
    showToast('COULD NOT READ GRID — TYPE IT MANUALLY');
  }
}}
              icon="🧠 ¬ ^ V →"
              title="Click here, then paste screenshot of logic stage expression"
            />
          }
          preview={
            previewUri ? (
              <div className="preview-row show">
                <img src={previewUri} alt="uploaded preview" />
                <span>{previewMeta}</span>
                <button type="button" className="preview-clear-btn" onClick={() => { setPreviewUri(''); setPreviewMeta(''); }}>✕</button>
              </div>
            ) : null
          }
          controls={
            <>
              <button
                className="reset-btn"
                type="button"
                onClick={handleClear}
              >
                clear
              </button>
              <button
                className="reset-btn"
                type="button"
                style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }}
                onClick={handleSample}
              >
                ⚡ SAMPLE
              </button>
            </>
          }
        />
      }
      answers={
        <AnswerPanel
          label="EVALUATED LOGIC STAGE RESULTS"
          stats={stampStats}
          answers={validResults}
          copyValue={copyFormatted}
          placeholder="ENTER STAGE EXPRESSIONS"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="LOGIC FORMULA WORKBENCH — Precedence ¬ > ^ > V > →"
        >
          <div
            className="logic-config"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginBottom: '16px'
            }}
          >
            <label
              className="logic-config-label"
              htmlFor="logicManual"
            >
              PASTE MANUAL TEXT (EXTRACTS P, Q, R, S, T):
            </label>

            <textarea
              id="logicManual"
              className="search-words-field"
              style={{ height: '76px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace' }}
              value={manualText}
              onChange={e => handleManualTextChange(e.target.value)}
              placeholder="Paste manual text here (e.g. On the subject of Logic&#10;P = T, Q = T, R = F, S = T, T = T)..."
              spellCheck={false}
            />

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="bg-btn"
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={() => handleManualTextChange(DEFAULT_MANUAL_TEXT)}
              >
                🔄 RESTORE DEFAULT
              </button>
              <button
                type="button"
                className="bg-btn"
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={() => handleManualTextChange('')}
              >
                🗑️ CLEAR MANUAL
              </button>
              <span style={{ fontSize: '12px', opacity: 0.8, marginLeft: 'auto', fontFamily: 'monospace' }}>
                {Object.entries(vars)
                  .map(([key, value]) => `${key}=${value ? 'T' : 'F'}`)
                  .join('  ·  ')}
              </span>
            </div>
          </div>

          <LogicWorking
            vars={vars}
            stages={stages}
            results={results}
            onVarToggle={handleVarToggle}
            onStageChange={handleStageChange}
            onPadInsert={handlePadInsert}
          />
        </WorkingPanel>
      }
    />
  );
}

export const logicModule = {
  id: 'logic',
  tabId: 'tabLogic',
  tabLabel: '🔣 LOGIC',
  eyebrow: 'LOGIC MODULE SOLVER',
  title: 'Logic Vision',
  sub: 'Evaluates boolean formulas across 5 stages with precedence <b>¬ &gt; ^ &gt; V &gt; →</b>. Click keypad or paste equations to get instant <b>True / False results</b> and copy to clipboard!',
  Component: LogicModule
};
