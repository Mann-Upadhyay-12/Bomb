import React, { useState, useEffect } from 'react';
import {
  DEFAULT_RULES,
  KEY,
  parseKnobRules,
  solveKnob
} from './knobSolver.js';
import { detectKnobStateFromImage } from './knobVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { KnobWorking } from './working.jsx';

export function KnobModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [rulesText, setRulesText] = useState(() => {
    try {
      const sv = localStorage.getItem(KEY);
      return sv && sv.trim() ? sv : DEFAULT_RULES;
    } catch (e) {
      return DEFAULT_RULES;
    }
  });
  const [rules, setRules] = useState(() => parseKnobRules(rulesText));
  const [knobState, setKnobState] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [disarmedCount, setDisarmedCount] = useState(0);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  const topPat = knobState.slice(0, 6).map(v => (v ? 'X' : 'O')).join('');
  const botPat = knobState.slice(6, 12).map(v => (v ? 'X' : 'O')).join('');

  const res = solveKnob(topPat, botPat, disarmedCount, rules);
  const resOdd = solveKnob(topPat, botPat, 1, rules);
  const resEven = solveKnob(topPat, botPat, 0, rules);

  const oddDir = resOdd.ok ? resOdd.direction : '—';
  const evenDir = resEven.ok ? resEven.direction : '—';
  const knobMsg = `ODD : ${oddDir} EVEN : ${evenDir}`;

  useEffect(() => {
    if (!isActive) return;
    setLastCopyString(knobMsg);
    if (copyOnDecode && (resOdd.ok || resEven.ok)) {
      copy(knobMsg);
    }
  }, [knobMsg, resOdd.ok, resEven.ok, isActive]);

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    try {
      const st = await detectKnobStateFromImage(img);
      if (st && st.length === 12) {
        setKnobState(st);
        showToast('KNOB LEDS DETECTED ✓');
      }
    } catch (e) {
      showToast('COULD NOT READ KNOB IMAGE');
    }
  };

  const handleLedToggle = (i) => {
    const next = [...knobState];
    next[i] = next[i] ? 0 : 1;
    setKnobState(next);
  };

  const handleSample = () => {
    setKnobState([0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0]);
    showToast('SAMPLE KNOB LEDS LOADED ✓');
  };

  const handleRulesChange = (text) => {
    setRulesText(text);
    const parsed = parseKnobRules(text);
    setRules(parsed);
    try {
      localStorage.setItem(KEY, text);
    } catch (e) {}
  };

  const handleRestoreDefaultRules = () => {
    setRulesText(DEFAULT_RULES);
    setRules(parseKnobRules(DEFAULT_RULES));
    try {
      localStorage.setItem(KEY, DEFAULT_RULES);
    } catch (e) {}
    showToast('RESTORED DEFAULT KNOB RULES ✓');
  };

  const handleClear = () => {
    setKnobState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setDisarmedCount(0);
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('KNOB CLEARED ✓');
  };

  const copyItems = [];
  if (res.ok) {
    copyItems.push({ label: `COPY FULL (${knobMsg})`, value: knobMsg });
    copyItems.push({ label: `DIRECTION (${res.direction})`, value: res.direction });
  }

  const isOdd = disarmedCount % 2 !== 0;
  const stampStats = res.ok
    ? `TOP: ${topPat} (${res.dirTop || '?'}) | BOT: ${botPat} (${res.dirBot || '?'}) | RESOLVED: ${res.direction}`
    : `TOP: ${topPat} | BOT: ${botPat}`;

  const totRules = (rules.UP?.length || 0) + (rules.DOWN?.length || 0) + (rules.LEFT?.length || 0) + (rules.RIGHT?.length || 0);
  const ruleCountsStr = `${totRules} rules loaded (UP:${rules.UP?.length || 0}, DOWN:${rules.DOWN?.length || 0}, LEFT:${rules.LEFT?.length || 0}, RIGHT:${rules.RIGHT?.length || 0})`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🎛️ ⭕ ❌ ⭕ ❌"
              title="Click here, then paste a screenshot of the 12 knob LEDs"
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
              <button className="reset-btn" type="button" onClick={handleClear}>
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
        >
          <div className="knob-config" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="search-config-label">RESOLVED DISARMED COUNT:</span>
              <button
                type="button"
                className="bg-btn"
                onClick={() => setDisarmedCount(prev => Math.max(0, prev - 1))}
              >
                -
              </button>
              <span style={{ fontWeight: 700, fontSize: '15px' }}>{disarmedCount}</span>
              <button
                type="button"
                className="bg-btn"
                onClick={() => setDisarmedCount(prev => prev + 1)}
              >
                +
              </button>
              <span className={`knob-parity-badge ${isOdd ? 'odd' : 'even'}`} style={{ padding: '4px 8px', borderRadius: '4px' }}>
                {isOdd ? 'ODD' : 'EVEN'}
              </span>
            </div>

            <details className="knob-manual-details" style={{ marginTop: '8px' }} open>
              <summary style={{ cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', letterSpacing: '0.08em', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                📖 PASTE MANUAL RULES (AUTO-SAVED &amp; REAL-TIME)
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <label className="search-config-label" style={{ margin: 0 }}>
                    KNOB TRUTH TABLE (UP, DOWN, LEFT, RIGHT):
                  </label>
                  <span className="maze-status-tag" style={{ fontSize: '11px', padding: '3px 8px' }}>
                    {ruleCountsStr}
                  </span>
                </div>
                <textarea
                  className="search-words-field"
                  style={{ height: '140px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace' }}
                  spellCheck={false}
                  placeholder="Paste Knob manual text here..."
                  value={rulesText}
                  onChange={e => handleRulesChange(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="bg-btn"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={handleRestoreDefaultRules}
                  >
                    🔄 RESTORE DEFAULT RULES
                  </button>
                </div>
              </div>
            </details>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="KNOB ROTATION DIRECTION"
          stats={stampStats}
          answers={res.ok ? [knobMsg] : []}
          copyValue={knobMsg}
          placeholder={res.msg || 'TOGGLE LEDS OR UPLOAD'}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="KNOB LED CONFIGURATION — 12 LEDs (top row & bottom row) & direction indicator"
        >
          <KnobWorking
            knobState={knobState}
            onLedToggle={handleLedToggle}
            direction={res.ok ? res.direction : '—'}
            arrow={res.ok ? res.arrow : '—'}
          />
        </WorkingPanel>
      }
    />
  );
}

export const knobModule = {
  id: 'knob',
  tabId: 'tabKnob',
  tabLabel: '🎛️ KNOBS',
  eyebrow: 'KNOB POSITION SOLVER',
  title: 'Knob Vision',
  sub: 'Upload a screenshot of the 12 knob LEDs or click to toggle ON (X) / OFF (O). Automatically determines the <b>exact position (UP / DOWN / LEFT / RIGHT)</b> for odd/even disarmed counts!',
  Component: KnobModule
};
