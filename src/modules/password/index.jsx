import React, { useState, useEffect } from 'react';
import { MASTER_PASSWORDS, filterPasswordCandidates } from './passwordSolver.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { PasswordWorking } from './working.jsx';

export const PASSWORD_WORDS_KEY = 'bombvision_password_words';

export function PasswordModule({ isActive = true }) {
  const uid = React.useId();
  const { copyOnDecode, setLastCopyString } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [rowsText, setRowsText] = useState('');
  const [masterText, setMasterText] = useState(() => {
    try {
      return localStorage.getItem(PASSWORD_WORDS_KEY) || MASTER_PASSWORDS.join(' ');
    } catch (e) {
      return MASTER_PASSWORDS.join(' ');
    }
  });

  const rawRows = rowsText.split('\n');
  const { rows, masterSet, matches, cols } = filterPasswordCandidates(rawRows, masterText);

  // Trigger copy on decode if single match
  useEffect(() => {
    if (!isActive) return;
    if (matches.length === 1) {
      const match = matches[0];
      setLastCopyString(match);
      if (copyOnDecode) {
        copy(match);
      }
    } else if (matches.length > 1) {
      setLastCopyString(matches[0]);
    } else {
      setLastCopyString('');
    }
  }, [rowsText, masterText, isActive]);

  const handleClear = () => {
    setRowsText('');
    setLastCopyString('');
    showToast('ROWS CLEARED ✓');
  };

  const handleRestoreWords = () => {
    const def = MASTER_PASSWORDS.join(' ');
    setMasterText(def);
    try {
      localStorage.setItem(PASSWORD_WORDS_KEY, def);
    } catch (e) {}
    showToast('RESTORED 35 PASSWORDS ✓');
  };

  const handleSample = () => {
    setRowsText('LHLOD\nLBANE\nPHATD');
    showToast('SAMPLE ROWS LOADED ✓');
  };

  // Copy items
  const copyItems = matches.map(w => ({
    label: `COPY "${w}"`,
    value: w
  }));

  const stampStats = `CANDIDATES: ${matches.length} / ${masterSet.length} | ROWS: ${rows.length}`;
  const answerDisplay = matches.length === 1
    ? `🔑 ${matches[0]}`
    : matches.length > 1
    ? matches
    : [];

  return (
    <ModuleLayout
      input={
        <ModuleInput
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
                ⚡ LOAD SAMPLE (LHLOD...)
              </button>
              <button
                className="reset-btn"
                type="button"
                onClick={handleRestoreWords}
              >
                🔄 RESTORE 35 WORDS
              </button>
            </>
          }
        >
          <div className="password-config" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            <div className="search-config-row">
              <label className="search-config-label" htmlFor={`${uid}-rows`}>
                SCROLLING LETTER ROWS (1 ROW PER LINE, e.g. "LHLOD"):
              </label>
              <textarea
                id={`${uid}-rows`}
                className="password-rows-field"
                rows={4}
                value={rowsText}
                onChange={(e) => setRowsText(e.target.value)}
                placeholder="LHLOD&#10;LBANE&#10;PHATD"
                spellCheck="false"
              />
            </div>

            <div className="search-config-row">
              <label className="search-config-label" htmlFor={`${uid}-master`}>
                35 MASTER PASSWORDS LIST (SPACE-SEPARATED):
              </label>
              <textarea
                id={`${uid}-master`}
                className="search-words-field"
                style={{ height: '70px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace' }}
                value={masterText}
                onChange={(e) => {
                  setMasterText(e.target.value);
                  try { localStorage.setItem(PASSWORD_WORDS_KEY, e.target.value); } catch(err) {}
                }}
                spellCheck="false"
                placeholder="Paste allowed passwords from manual..."
              />
            </div>

            <div className="search-btn-row">
              <button type="button" className="bg-btn" onClick={handleSample}>
                ⚡ LOAD SAMPLE ROWS
              </button>
              <button type="button" className="bg-btn" onClick={handleRestoreWords}>
                🔄 RESTORE 35 WORDS
              </button>
              <button type="button" className="bg-btn" onClick={handleClear}>
                🗑️ CLEAR ROWS
              </button>
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="DECODED PASSWORD"
          stats={stampStats}
          answers={answerDisplay}
          copyValue={matches[0] || ''}
          placeholder={rows.length === 0 ? 'ENTER ROWS' : 'NO MATCHING PASSWORD'}
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
  sub: 'Ask the Defuser to read each row of 5 letters as they scroll. Type or paste rows line-by-line — automatically finds the <b>unique 5-letter password</b> and copies it to your clipboard!',
  Component: PasswordModule
};
