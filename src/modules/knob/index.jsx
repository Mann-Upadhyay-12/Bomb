import React, { useState, useEffect } from 'react';
import { preWarmOCR } from '../search/searchOCR.js';
import {
  KEY,
  parseKnobRules,
  solveKnob
} from './knobSolver.js';
import { detectKnobStateFromImage } from './knobVision.js';
import { readKnobManual, knobManualText } from './knobManual.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { Dropzone, ManualPasteBox } from '../../core/Dropzone.jsx';
import { manualBoxPaste } from '../../core/airPaste.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { KnobWorking } from './working.jsx';

const STAMP = '# read from the manual picture';
const stampedAt = (text) => {
  const m = new RegExp(`^${STAMP} (\\S+)`, 'm').exec(String(text || ''));
  const t = m ? Date.parse(m[1]) : NaN;
  return Number.isFinite(t) ? t : null;
};
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export function KnobModule({ isActive = true }) {
  // start the OCR engine while the screenshot is being taken, so the first read doesn't wait for it
  React.useEffect(() => { preWarmOCR(); }, []);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  // this game's table, shared by every Knobs on the bomb (read from the manual picture, or pasted)
  const [rulesText, setRulesText] = useSharedSetting(KEY, '');
  const rules = React.useMemo(() => parseKnobRules(rulesText), [rulesText]);
  const readAt = stampedAt(rulesText);
  const [manualProblem, setManualProblem] = useState('');
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
    const fresh = answerChanged(knobMsg); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(knobMsg);
    if (copyOnDecode && fresh && (resOdd.ok || resEven.ok)) {
      copy(knobMsg);
    }
  }, [knobMsg, resOdd.ok, resEven.ok, isActive]);

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    // the manual picture (four panels of X / O) or the defuser's LEDs?
    try {
      const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const man = readKnobManual(ctx.getImageData(0, 0, W, H).data, W, H);
      const marks = man.panels.reduce((n, p) => n + p.rows.join('').length, 0);
      if (man.panels.length === 4 && marks >= 150) { // 4 panels × 48 X / O when read cleanly
        setPreviewUri(''); setPreviewMeta('');
        if (man.ok) {
          setRulesText(knobManualText(man.dirs, `${STAMP} ${new Date().toISOString()}`));
          setManualProblem('');
          showToast('KNOBS MANUAL READ ✓ 4 × 8 PATTERNS');
        } else {
          setManualProblem(`Manual picture not read cleanly: ${man.problems.join('; ')} — fix the table below by hand`);
          showToast('KNOBS MANUAL — CHECK THE TABLE');
        }
        return;
      }
    } catch (e) {}

    try {
      const st = await detectKnobStateFromImage(img);
      if (st && st.length === 12) {
        setKnobState(st);
        showToast('KNOB LEDS DETECTED ✓');
      } else {
        showToast('NO KNOB LAMPS FOUND — TAP THE LEDS BY HAND');
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
    setManualProblem('');
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
  const manualLine = !totRules
    ? 'Paste this game’s Knobs manual picture (the UP / DOWN / LEFT / RIGHT panels) first'
    : `Manual ✓ ${totRules} patterns · ${readAt ? `read from the picture ${ago(readAt)}` : 'typed / pasted text — check it’s this game’s'}`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🎛️ ⭕ ❌ ⭕ ❌"
              title="Click here, then paste the Knobs manual picture or the 12 knob LEDs"
              sub={<>the <b>manual</b> (UP / DOWN / LEFT / RIGHT panels) changes every game — paste it once · then the <b>LEDs</b></>}
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
            <div className={`module-hint ${totRules && !manualProblem ? 'ok' : 'bad'}`}>{manualProblem || manualLine}</div>
            <ManualPasteBox what="Knobs manual" />
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

            <details className="knob-manual-details" style={{ marginTop: '8px' }} open={!totRules || Boolean(manualProblem)}>
              <summary style={{ cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', letterSpacing: '0.08em', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                📖 MANUAL TABLE (read from the picture — or paste / type it)
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
                  placeholder={'Paste the manual picture above — or type it:\nUP:\nOOOOXO\n…'}
                  value={rulesText}
                  onChange={e => handleRulesChange(e.target.value)}
                  onPaste={manualBoxPaste()}
                />
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
          placeholder={!totRules ? 'PASTE THE KNOBS MANUAL PICTURE' : (res.msg || 'TOGGLE LEDS OR UPLOAD')}
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
  sub: 'Paste this game’s <b>Knobs manual picture</b> (UP / DOWN / LEFT / RIGHT panels) once, then a screenshot of the 12 knob LEDs — or click the LEDs to toggle ON (X) / OFF (O). Gives the <b>position (UP / DOWN / LEFT / RIGHT)</b> for odd and even disarmed counts.',
  Component: KnobModule
};
