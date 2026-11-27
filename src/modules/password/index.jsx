import React, { useState, useEffect, useId, useRef } from 'react';
import { preWarmOCR } from '../search/searchOCR.js';
import { MASTER_PASSWORDS, filterPasswordCandidates, splitPasswordRows } from './passwordSolver.js';

// The rows box shown tidy: one 5-letter row per line, an unfinished row (still being typed) last
function tidyRows(text) {
  const letters = String(text || '').toUpperCase().replace(/[^A-Z]/g, '');
  const full = splitPasswordRows(letters), rest = letters.slice(full.length * 5);
  return [...full, ...(rest ? [rest] : [])].join('\n');
}
import { readPasswordRow } from './passwordVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
import { useCardState } from '../../core/room/useCardState.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { PasswordWorking } from './working.jsx';

const DEFAULT_COUNT = MASTER_PASSWORDS.filter(w => w.length === 5).length;

export const PASSWORD_WORDS_KEY = 'bombvision_password_words';
export const PASSWORD_DEFAULT_WORDS = MASTER_PASSWORDS.join(' ');

export function PasswordModule({ isActive = true }) {
  // start the OCR engine while the screenshot is being taken, so the first read doesn't wait for it
  React.useEffect(() => { preWarmOCR(); }, []);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  const uid = useId(); // per-instance ids: missions can show the same module several times
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);

  // in a room, the rows (typed or read from a picture) are the room's: only the app that took the
  // picture reads it, the teammates get the row (core/room/useCardState.js)
  const [rowsText, setRowsText] = useCardState('rows', '');
  // The passwords list is the same for every Password module, so all windows share it
  const [masterText, setMasterText] = useSharedSetting(PASSWORD_WORDS_KEY, PASSWORD_DEFAULT_WORDS);
  const [status, setStatus] = useCardState('status', { text: '', ok: null });
  const [busy, setBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const activeRef = useRef(isActive);
  activeRef.current = isActive;

  // Every 5 letters is a row — separators (space / Enter / comma) are optional and ignored
  const rawRows = splitPasswordRows(rowsText);
  const { rows, masterSet, matches, cols } = filterPasswordCandidates(rawRows, masterText);

  useEffect(() => {
    const fresh = answerChanged(matches.join(' ')); // false when only isActive changed
    if (!isActive) return;
    if (matches.length === 1) {
      setLastCopyString(matches[0]);
      if (copyOnDecode && fresh) copy(matches[0]);
    } else {
      setLastCopyString(matches.length > 1 ? matches.join(' ') : '');
    }
  }, [matches.join(' '), isActive]); // re-run only when the result changes, not on every keystroke

  // One screenshot = one row: the letter currently showing on each of the 5 columns
  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setLastImage(img, fileBlob);
    if (busy) { showToast('STILL READING THE LAST ROW — PASTE AGAIN IN A MOMENT'); return; }
    setBusy(true);
    setStatus({ text: 'Reading letters…', ok: null });
    try {
      // letters each column can show according to the list — used to flag doubtful reads
      const allowed = Array.from({ length: 5 }, (_, i) => new Set(masterSet.map(w => w[i])));
      const r = await readPasswordRow(img, allowed, t => setStatus({ text: t, ok: null }));
      if (!r.ok) { setStatus({ text: r.reason, ok: false }); return; }
      const existing = splitPasswordRows(rowsText);
      if (existing.includes(r.row)) {
        setStatus({ text: `Row ${r.row} is already in the list.`, ok: true });
        return;
      }
      setRowsText(prev => (prev.trim() ? `${prev.trim()}\n${r.row}` : r.row));
      const doubt = r.unsure.map((u, i) => (u ? i + 1 : 0)).filter(Boolean);
      setStatus(doubt.length
        ? { text: `⚠ Added row ${r.row} — check letter ${doubt.join(', ')} (edit the rows box if it's wrong).`, ok: false }
        : { text: `✓ Added row ${r.row}.`, ok: true });
      showToast(`ROW ${r.row} ADDED ✓`);
    } catch (e) {
      setStatus({ text: `⚠ ${e.message} — type the row instead.`, ok: false });
      showToast('OCR UNAVAILABLE — TYPE THE ROW');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    setRowsText('');
    setStatus({ text: '', ok: null });
    setPreviewUri('');
    setLastCopyString('');
    showToast('ROWS CLEARED ✓');
  };

  const handleRestoreWords = () => {
    setMasterText(PASSWORD_DEFAULT_WORDS);
    showToast(`RESTORED ${DEFAULT_COUNT} PASSWORDS ✓`);
  };

  const handleSample = () => {
    setRowsText('LHLOD\nLBANE\nTHAIR\nWIAIE\nCEUUW\nLOASW');
    showToast('SAMPLE ROWS LOADED ✓');
  };

  const copyItems = matches.map(w => ({ label: `COPY "${w}"`, value: w }));

  const stampStats = `CANDIDATES: ${matches.length} / ${masterSet.length} | ROWS: ${rows.length}`;
  const answerDisplay = matches.length === 1 ? `🔑 ${matches[0]}` : matches.length > 1 ? matches : [];

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone shareReading
              onImage={handleImage}
              icon="🔑 S M E D N"
              title="Click here, then paste a Password screenshot — each one adds a row"
            />
          }
          preview={
            previewUri ? (
              <div className="preview-row show">
                <img src={previewUri} alt="password screenshot" />
                <span>{busy ? 'Reading…' : 'Last row screenshot'}</span>
                <button type="button" className="preview-clear-btn" onClick={() => setPreviewUri('')}>✕</button>
              </div>
            ) : null
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear} data-card-clear>clear</button>
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
          <div className="password-config" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            {status.text && (
              <div className={`ws-status ${status.ok === true ? 'ok' : status.ok === false ? 'err' : ''}`}>{status.text}</div>
            )}
            <div className="search-config-row">
              <label className="search-config-label" htmlFor={`${uid}-rows`}>
                LETTER ROWS ({rows.length}) — ONE PER SCREENSHOT, OR TYPE THE LETTERS (EVERY 5 = A ROW):
              </label>
              <textarea
                id={`${uid}-rows`}
                className="password-rows-field"
                rows={6}
                value={rowsText}
                onChange={(e) => setRowsText(e.target.value)}
                // tidy to one row per line when leaving the box, so the split into rows is visible
                onBlur={() => setRowsText(t => tidyRows(t))}
                placeholder={'LHLOD\nLBANE\nTHAIR'}
                spellCheck="false"
              />
            </div>

            {!grouped && (
              <div className="search-config-row">
                <label className="search-config-label" htmlFor={`${uid}-master`}>
                  POSSIBLE PASSWORDS LIST ({masterSet.length} WORDS) — SHARED BY ALL PASSWORD MODULES:
                </label>
                <textarea
                  id={`${uid}-master`}
                  className="search-words-field"
                  style={{ height: '70px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace' }}
                  value={masterText}
                  onChange={(e) => setMasterText(e.target.value)}
                  spellCheck="false"
                  placeholder="Paste the possible passwords from the manual…"
                />
                <div className="search-btn-row" style={{ marginTop: 6 }}>
                  <button type="button" className="bg-btn" onClick={handleRestoreWords}>
                    🔄 RESTORE {DEFAULT_COUNT} WORDS
                  </button>
                </div>
              </div>
            )}
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="DECODED PASSWORD"
          stats={stampStats}
          answers={answerDisplay}
          copyValue={matches.length === 1 ? matches[0] : matches.join(' ')}
          placeholder={busy ? '📷 READING…' : rows.length === 0 ? 'PASTE A SCREENSHOT OR TYPE ROWS' : 'NO MATCHING PASSWORD'}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title={`PASSWORD COLUMNS — Available letters per position (${rows.length} row(s) entered)`}
        >
          <PasswordWorking cols={cols} rowsCount={rows.length} />
        </WorkingPanel>
      }
    />
  );
}

export const passwordModule = {
  id: 'password',
  tabId: 'tabPassword',
  tabLabel: '🔑 PASSWORD',
  eyebrow: 'PASSWORD DECODER',
  title: 'Password Vision',
  sub: 'Paste a screenshot of the Password module each time the letters change — every screenshot adds one <b>row</b> (the 5 letters showing). The rows are matched against the possible passwords to find the <b>unique password</b>, which is copied to your clipboard.',
  Component: PasswordModule
};
