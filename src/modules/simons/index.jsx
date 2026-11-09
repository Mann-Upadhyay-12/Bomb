import React, { useState, useEffect } from 'react';
import {
  SINAMES,
  SIMON_DEFAULT_RULES,
  parseSimonRules,
  analyzeSimonFrame
} from './simonsSolver.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { SimonsWorking } from './working.jsx';

export function SimonsModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [rulesText, setRulesText] = useState(() => {
    try {
      const sv = localStorage.getItem('bombvision_simon_rules');
      return sv && sv.trim() ? sv : SIMON_DEFAULT_RULES;
    } catch (e) {
      return SIMON_DEFAULT_RULES;
    }
  });
  const [rules, setRules] = useState(() => parseSimonRules(rulesText) || {
    even: { R: 'R', B: 'G', Y: 'Y', G: 'B' },
    odd: { R: 'G', B: 'R', Y: 'B', G: 'Y' }
  });
  const [stageParity, setStageParity] = useState('even'); // 'even' or 'odd'
  const [entries, setEntries] = useState([]);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Map entries through rules
  const map = rules[stageParity] || rules.even;
  const pressedSeq = entries.map(c => map[c] || c);
  const copyFormatted = pressedSeq.join(' ');

  React.useEffect(() => {
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && copyFormatted) {
      copy(copyFormatted);
    }
  }, [copyFormatted, isActive]);

  const handleAddColor = (c) => {
    setEntries(prev => [...prev, c]);
  };

  const handleRemoveEntry = (idx) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSample = () => {
    setEntries(['R', 'B', 'Y', 'G', 'R']);
    showToast('SAMPLE SEQUENCE LOADED ✓');
  };

  const handleRulesChange = (text) => {
    setRulesText(text);
    const parsed = parseSimonRules(text);
    if (parsed) {
      setRules(parsed);
      try { localStorage.setItem('bombvision_simon_rules', text); } catch (e) {}
    }
  };

  const handleRestoreDefaultRules = () => {
    setRulesText(SIMON_DEFAULT_RULES);
    setRules(parseSimonRules(SIMON_DEFAULT_RULES));
    try { localStorage.setItem('bombvision_simon_rules', SIMON_DEFAULT_RULES); } catch (e) {}
    showToast('RESTORED DEFAULT SIMON RULES ✓');
  };

  const handleClear = () => {
    setEntries([]);
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('SIMON CLEARED ✓');
  };

  const copyItems = [];
  if (pressedSeq.length > 0) {
    copyItems.push({ label: `COPY SEQUENCE (${copyFormatted})`, value: copyFormatted });
    pressedSeq.forEach((c, i) => {
      copyItems.push({ label: `#${i + 1}: ${c}`, value: c });
    });
  }

  const stampStats = `STAGE: ${stageParity.toUpperCase()} | FLASHED: ${entries.length} | PRESS: ${copyFormatted || 'NONE'}`;

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

                try {
                  const w = img.naturalWidth || img.width;
                  const h = img.naturalHeight || img.height;
                  const cv = document.createElement('canvas');
                  cv.width = w; cv.height = h;
                  const ctx = cv.getContext('2d', { willReadFrequently: true });
                  ctx.drawImage(img, 0, 0);
                  const flashed = analyzeSimonFrame(ctx, w, h);
                  if (flashed) {
                    setEntries(prev => [...prev, flashed]);
                    showToast(`FLASH DETECTED: ${SINAMES[flashed] || flashed} ✓`);
                  } else {
                    showToast('IMAGE LOADED — TAP BUTTONS TO ADD SEQUENCE');
                  }
                } catch (e) {
                  showToast('IMAGE LOADED — TAP BUTTONS TO ADD SEQUENCE');
                }
              }}
              icon="🔴 🔵 🟡 🟢"
              title="Click here, then paste Simon Says frame or GIF"
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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span className="search-config-label">STAGE PARITY:</span>
            <button
              type="button"
              className={`bg-btn ${stageParity === 'even' ? 'active' : ''}`}
              style={{ borderColor: stageParity === 'even' ? 'var(--brass)' : '' }}
              onClick={() => setStageParity('even')}
            >
              EVEN STAGE
            </button>
            <button
              type="button"
              className={`bg-btn ${stageParity === 'odd' ? 'active' : ''}`}
              style={{ borderColor: stageParity === 'odd' ? 'var(--brass)' : '' }}
              onClick={() => setStageParity('odd')}
            >
              ODD STAGE
            </button>
          </div>

          <details className="simon-manual-details" style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', letterSpacing: '0.08em', color: 'var(--ink-soft)', marginBottom: '8px' }}>
              📖 MANUAL RULES — PASTE &amp; PARSE (EVEN / ODD DISARMED RULES)
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <label className="search-config-label" style={{ margin: 0 }}>
                  PASTE SIMON SAYS MANUAL RULES:
                </label>
              </div>
              <textarea
                className="search-words-field"
                style={{ height: '140px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace' }}
                spellCheck={false}
                placeholder="Paste Simon Says manual text here..."
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
          label="SIMON SAYS BUTTON PRESS SEQUENCE"
          stats={stampStats}
          answers={pressedSeq.length ? pressedSeq : []}
          copyValue={copyFormatted}
          placeholder="ADD FLASHED COLORS"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="SIMON SAYS CONSOLE — Flashed light inputs and mapped button sequence"
        >
          <SimonsWorking
            entries={entries}
            onAddColor={handleAddColor}
            onRemoveEntry={handleRemoveEntry}
            onClear={handleClear}
          />
        </WorkingPanel>
      }
    />
  );
}

export const simonsModule = {
  id: 'simons',
  tabId: 'tabSimons',
  tabLabel: '🔴 SIMON SAYS',
  eyebrow: 'SIMON SAYS SOLVER',
  title: 'Simon Says Vision',
  sub: 'Upload frame images or click colored buttons to record flashed lights. Maps each light according to <b>Even or Odd stage rules</b> and copies the press sequence to your clipboard!',
  Component: SimonsModule
};
