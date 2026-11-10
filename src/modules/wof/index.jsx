import React, { useState } from 'react';
import {
  DEFAULT_RULES,
  POS_NAMES,
  BLANK,
  parseRules,
  solveCore
} from './wofSolver.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { WofWorking } from './working.jsx';
import { wofReadImage } from './wofOCR.js';

export const KEY = 'bombvision_wof_rules_v2';

export function WofModule({ isActive = true }) {
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
  const [rules, setRules] = useState(() => parseRules(rulesText));
  const [disp, setDisp] = useState('');
  const [btns, setBtns] = useState(['', '', '', '', '', '']);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');
  const [warnDisp, setWarnDisp] = useState(false);
  const [warnBtn, setWarnBtn] = useState([false, false, false, false, false, false]);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);

  const res = solveCore(rules, disp, btns);
  const lookIdx = res.look !== undefined ? res.look : -1;
  const hitIdx = res.ok ? res.hit : -1;

  React.useEffect(() => {
    if (!isActive) return;
    if (res.ok && res.ans) {
      setLastCopyString(res.ans);
      if (copyOnDecode) {
        copy(res.ans);
      }
    } else {
      setLastCopyString('');
    }
  }, [res.ok, res.ans, isActive]);

  const handleRulesChange = (text) => {
    setRulesText(text);
    const parsed = parseRules(text);
    setRules(parsed);
    try {
      localStorage.setItem(KEY, text);
    } catch (e) {}
  };

  const handleRestoreDefaultRules = () => {
    setRulesText(DEFAULT_RULES);
    setRules(parseRules(DEFAULT_RULES));
    try {
      localStorage.setItem(KEY, DEFAULT_RULES);
    } catch (e) {}
    showToast('RESTORED DEFAULT WOF RULES ✓');
  };

  // Manual edits clear the low-confidence warning for that slot
  const handleDispChange = (val) => { setDisp(val); setWarnDisp(false); };
  const handleBtnChange = (idx, val) => {
    const next = [...btns];
    next[idx] = val;
    setBtns(next);
    setWarnBtn(prev => prev.map((w, i) => (i === idx ? false : w)));
  };

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);
    if (ocrBusy) { showToast('STILL READING THE LAST SCREENSHOT — PASTE AGAIN IN A MOMENT'); return; }
    setOcrBusy(true);
    try {
      const r = await wofReadImage(img, rules, setOcrStatus);
      setDisp(r.disp);
      setBtns(r.btns);
      setWarnDisp(r.warnDisp);
      setWarnBtn(r.warnBtn);
      const anyWarn = r.warnDisp || r.warnBtn.some(Boolean);
      setOcrStatus(anyWarn
        ? '✅ OCR done — ⚠️ gold-bordered slots were read with low confidence, double-check them.'
        : '✅ OCR done — all slots read confidently.');
      showToast('WHO\'S ON FIRST READ ✓');
    } catch (err) {
      setOcrStatus(`⚠️ ${err.message} — pick the words from the dropdowns instead.`);
      showToast('OCR UNAVAILABLE — SELECT WORDS MANUALLY');
    } finally {
      setOcrBusy(false);
    }
  };

  const handleSample = () => {
    setWarnDisp(false);
    setWarnBtn([false, false, false, false, false, false]);
    setDisp('YES');
    setBtns(['OKAY', 'WHAT', 'LEFT', 'READY', 'HOLD ON', 'PRESS']);
    showToast('SAMPLE WHO\'S ON FIRST LOADED ✓');
  };

  const handleClear = () => {
    setDisp('');
    setBtns(['', '', '', '', '', '']);
    setWarnDisp(false);
    setWarnBtn([false, false, false, false, false, false]);
    setOcrStatus('');
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('WOF CLEARED ✓');
  };

  const copyItems = [];
  if (res.ok && res.ans) {
    copyItems.push({ label: `COPY ANSWER (${res.ans})`, value: res.ans });
    copyItems.push({ label: `POSITION (${POS_NAMES[res.hit]})`, value: POS_NAMES[res.hit] });
  }

  const stampStats = res.ok
    ? `DISPLAY "${disp}" → ${POS_NAMES[lookIdx]} = "${res.label}"`
    : `DISPLAY: ${disp || 'NONE'} | BUTTONS: ${btns.filter(Boolean).length}/6`;

  const dw = rules.displayWords.slice().sort((a, b) => (a === BLANK ? -1 : b === BLANK ? 1 : a.localeCompare(b)));
  const bw = rules.buttonLabels.slice().sort();

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🥊 WHO WHAT YES"
              title="Click here, then paste Who's on First screenshot"
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
          {ocrStatus && <div className="module-hint">{ocrStatus}</div>}
          <details className="wof-manual-details" style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', letterSpacing: '0.08em', color: 'var(--ink-soft)', marginBottom: '8px' }}>
              📖 PASTE MANUAL RULES (STEP 1 &amp; STEP 2)
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <label className="search-config-label" style={{ margin: 0 }}>
                  PASTE NEW MANUAL RULES HERE (AUTO-SAVED &amp; REAL-TIME):
                </label>
                <span className="maze-status-tag" style={{ fontSize: '11px', padding: '3px 8px' }}>
                  {dw.length} display words · {bw.length} button lists
                </span>
              </div>
              <textarea
                className="search-words-field"
                style={{ height: '160px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace' }}
                spellCheck={false}
                placeholder="Paste Who's on First manual text (Step 1 & Step 2) here..."
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
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="CORRECT BUTTON TO PRESS"
          stats={stampStats}
          answers={res.ok ? [`${res.ans} (${POS_NAMES[res.hit]})`] : []}
          copyValue={res.ans || ''}
          placeholder={ocrBusy ? '📷 READING…' : (res.msg || 'SELECT DISPLAY & BUTTONS')}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="WHO'S ON FIRST CONSOLE — Display word and 6 button positions"
        >
          <WofWorking
            disp={disp}
            btns={btns}
            lookIdx={lookIdx}
            hitIdx={hitIdx}
            onDispChange={handleDispChange}
            onBtnChange={handleBtnChange}
            displayWords={dw}
            buttonLabels={bw}
            warnDisp={warnDisp}
            warnBtn={warnBtn}
          />
        </WorkingPanel>
      }
    />
  );
}

export const wofModule = {
  id: 'wof',
  tabId: 'tabWof',
  tabLabel: '🥊 WHO\'S ON FIRST',
  eyebrow: 'WHO\'S ON FIRST SOLVER',
  title: 'Who\'s on First Vision',
  sub: 'Select or OCR the display word and the 6 keypad buttons. Automatically follows the manual logic to reveal the <b>exact correct button to press</b> and copies it to your clipboard!',
  Component: WofModule
};
