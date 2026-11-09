import React, { useState, useEffect, useId } from 'react';
import { balanceEquation, SAMPLE_EQUATION } from './balanceSolver.js';
import { readEquationImage } from './balanceVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { BalanceWorking } from './working.jsx';

export function BalanceModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const uid = useId();

  const [equation, setEquation] = useState('');
  const [status, setStatus] = useState({ text: '', ok: null });
  const [busy, setBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState('');

  const result = equation.trim() ? balanceEquation(equation) : null;
  const answer = result && result.ok ? result.answer : '';

  useEffect(() => {
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && answer) copy(answer);
  }, [answer, isActive]);

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setLastImage(img, fileBlob);
    if (busy) return;
    setBusy(true);
    setStatus({ text: 'Reading equation…', ok: null });
    try {
      const r = await readEquationImage(img, (t) => setStatus({ text: t, ok: null }));
      if (!r.ok) { setStatus({ text: r.reason, ok: false }); return; }
      setEquation(r.equation);
      setStatus(r.parsed
        ? { text: `✓ Read: ${r.equation} — check it matches the screenshot.`, ok: true }
        : { text: `⚠ Read "${r.equation}" but it doesn't balance — fix the formula text below.`, ok: false });
      if (r.parsed) showToast('EQUATION READ ✓');
    } catch (e) {
      setStatus({ text: `⚠ ${e.message} — type the equation below instead.`, ok: false });
      showToast('OCR UNAVAILABLE — TYPE THE EQUATION');
    } finally {
      setBusy(false);
    }
  };

  const handleSample = () => {
    setEquation(SAMPLE_EQUATION);
    setStatus({ text: '', ok: null });
    showToast('SAMPLE EQUATION LOADED ✓');
  };

  const handleClear = () => {
    setEquation('');
    setStatus({ text: '', ok: null });
    setPreviewUri('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('BALANCE CLEARED ✓');
  };

  const insert = (txt) => setEquation(prev => (prev ? `${prev.replace(/\s+$/, '')} ${txt} ` : `${txt} `));

  const copyItems = [];
  if (answer) {
    copyItems.push({ label: `COPY COEFFICIENTS (${answer})`, value: answer });
    copyItems.push({ label: `BALANCED (${result.balanced})`, value: result.balanced });
  }

  const stampStats = result && result.ok
    ? `${result.species.length} SPECIES · ${result.elements.length} ELEMENTS${result.ambiguous ? ' · ⚠ MULTIPLE SOLUTIONS' : ''}`
    : 'LEFT → RIGHT, INCLUDING 1';

  const placeholder = busy ? '📷 READING…'
    : !equation.trim() ? 'PASTE THE BALANCE SCREENSHOT'
    : (result && result.error ? result.error.toUpperCase() : '— — —');

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="⚖️ KNO₃ → KNO₂ + O₂"
              title="Click here, then paste the Balance screenshot"
            />
          }
          preview={
            previewUri ? (
              <div className="preview-row show">
                <img src={previewUri} alt="balance screenshot" />
                <span>Balance screenshot</span>
                <button type="button" className="preview-clear-btn" onClick={() => setPreviewUri('')}>✕</button>
              </div>
            ) : null
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear}>clear</button>
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
          {status.text && (
            <div className={`module-hint ${status.ok === false ? 'bad' : status.ok ? 'ok' : ''}`}>{status.text}</div>
          )}
          <div className="bal-config">
            <label className="search-config-label" htmlFor={`${uid}-eq`}>
              EQUATION (read from the screenshot, or type it — subscripts as plain digits):
            </label>
            <div className="bal-input-row">
              <input
                id={`${uid}-eq`}
                type="text"
                className={`search-words-field bal-input ${result && !result.ok ? 'bad' : ''}`}
                value={equation}
                placeholder="KNO3 -> KNO2 + O2"
                spellCheck="false"
                autoComplete="off"
                onChange={(e) => setEquation(e.target.value)}
              />
              <button type="button" className="bg-btn" onClick={() => insert('→')} title="Insert arrow">→</button>
              <button type="button" className="bg-btn" onClick={() => insert('+')} title="Insert plus">+</button>
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="COEFFICIENTS (LEFT TO RIGHT)"
          stats={stampStats}
          answers={answer ? result.coefficients.map(String) : []}
          copyValue={answer}
          placeholder={placeholder}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel title="BALANCED EQUATION — atom count per element on each side">
          <BalanceWorking result={result} />
        </WorkingPanel>
      }
    />
  );
}

export const balanceModule = {
  id: 'balance',
  tabId: 'tabBalance',
  tabLabel: '⚖️ BALANCE',
  eyebrow: 'CHEMICAL EQUATION BALANCER',
  title: 'Balance Vision',
  sub: 'Paste the Balance screenshot (or type the equation). Reads the formulas, balances the equation exactly and copies the <b>coefficients from left to right in simplest form</b> (e.g. <code>2 2 1</code>).',
  Component: BalanceModule
};
