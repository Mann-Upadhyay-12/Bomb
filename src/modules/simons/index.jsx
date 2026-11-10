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

  // Analyse one image/GIF blob → list of flashed colours (GIF frames are decoded
  // one by one when the browser supports ImageDecoder, like the original app).
  const analyzeBlob = async (blob, img) => {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const isGif = blob && (blob.type === 'image/gif' || /\.gif$/i.test(blob.name || ''));
    if (isGif && typeof window !== 'undefined' && 'ImageDecoder' in window) {
      try {
        const dec = new window.ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
        await dec.tracks.ready;
        const n = dec.tracks.selectedTrack.frameCount;
        const seq = [];
        for (let i = 0; i < n; i++) {
          const { image } = await dec.decode({ frameIndex: i });
          cv.width = image.displayWidth; cv.height = image.displayHeight;
          ctx.drawImage(image, 0, 0);
          image.close();
          const c = analyzeSimonFrame(ctx, cv.width, cv.height);
          // consecutive frames of the same glow count once
          if (c && seq[seq.length - 1] !== c) seq.push(c);
        }
        return { colors: seq, note: `GIF ${n} frames` };
      } catch (e) {
        console.warn('Simon GIF decode failed, falling back to first frame', e);
      }
    }
    let source = img;
    if (!source && blob) source = await createImageBitmap(blob);
    if (!source) return { colors: [], note: '' };
    const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
    cv.width = w; cv.height = h;
    ctx.drawImage(source, 0, 0);
    const c = analyzeSimonFrame(ctx, w, h);
    return { colors: c ? [c] : [], note: isGif ? 'GIF: first frame only (ImageDecoder unsupported)' : '' };
  };

  const ingest = async (items) => {
    const found = [];
    for (const { blob, img } of items) {
      try {
        const r = await analyzeBlob(blob, img);
        found.push(...r.colors);
      } catch (e) {}
    }
    if (found.length) {
      setEntries(prev => [...prev, ...found]);
      showToast(`FLASH${found.length > 1 ? 'ES' : ''} DETECTED: ${found.map(c => SINAMES[c] || c).join(' → ')} ✓`);
    } else {
      showToast('NO GLOW DETECTED — TAP BUTTONS TO ADD SEQUENCE');
    }
  };

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);
    ingest([{ blob: fileBlob, img }]);
  };

  // Several frames at once: process in file-name order (frame1, frame2, …)
  const handleFiles = (files) => {
    const list = Array.from(files).filter(f => f && (!f.type || f.type.startsWith('image/')));
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
    if (list[0]) {
      const reader = new FileReader();
      reader.onload = ev => { setPreviewUri(ev.target.result); setPreviewMeta(`${list.length} file(s)`); };
      reader.readAsDataURL(list[0]);
    }
    ingest(list.map(f => ({ blob: f, img: null })));
  };

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

  const evenSeq = entries.map(c => (rules.even || {})[c] || c).join(' ');
  const oddSeq = entries.map(c => (rules.odd || {})[c] || c).join(' ');

  const copyItems = [];
  if (pressedSeq.length > 0) {
    copyItems.push({ label: `COPY SEQUENCE (${copyFormatted})`, value: copyFormatted });
    copyItems.push({ label: `EVEN: ${evenSeq}`, value: evenSeq });
    copyItems.push({ label: `ODD: ${oddSeq}`, value: oddSeq });
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
              onImage={handleImage}
              onFiles={handleFiles}
              multiple
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
