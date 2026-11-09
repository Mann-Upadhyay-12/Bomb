import React, { useState, useEffect, useId } from 'react';
import { PN_DEFAULT_CODES, pnNote, pnParseCodes, PN_INT } from './pianoSolver.js';
import { pnAnalyze } from './pianoVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { PianoWorking } from './working.jsx';

export const PN_KEY = 'bombvision_piano_codes';

export function PianoModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const uid = useId(); // per-instance ids: missions can show the same module several times

  const [clefSel, setClefSel] = useState('auto');
  const [detClef, setDetClef] = useState('bass');
  const [notes, setNotes] = useState([{ pos: 0, acc: 0 }, { pos: 0, acc: 0 }]);
  const [codesText, setCodesText] = useState(() => {
    try {
      return localStorage.getItem(PN_KEY) || PN_DEFAULT_CODES;
    } catch (e) {
      return PN_DEFAULT_CODES;
    }
  });

  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');
  const [statusText, setStatusText] = useState('');

  const effectiveClef = clefSel === 'auto' ? detClef : clefSel;
  const ns = notes.map(n => pnNote(effectiveClef, n.pos, n.acc));
  const lo = Math.min(ns[0].semi, ns[1].semi);
  const hi = Math.max(ns[0].semi, ns[1].semi);
  const st = hi - lo;
  const intervalName = PN_INT[st] || `${st} half-steps`;

  const parsedCodes = pnParseCodes(codesText);
  const code = (st >= 1 && st <= 12) ? parsedCodes[intervalName.toLowerCase()] : null;

  useEffect(() => {
    if (!isActive) return;
    const copyVal = code || intervalName;
    setLastCopyString(copyVal);
    if (copyOnDecode && copyVal && st > 0) {
      copy(copyVal);
    }
  }, [code, intervalName, st, isActive]);

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    const MAXDIM = 1200;
    if (w > MAXDIM || h > MAXDIM) {
      const scale = MAXDIM / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const r = pnAnalyze(ctx.getImageData(0, 0, w, h).data, w, h);
    if (!r || r.notes.length !== 2 || r.stray) {
      setStatusText(r ? `⚠️ Found ${r.notes.length} note(s). Verify manually.` : '⚠️ Could not find musical staff.');
      if (r && r.notes.length >= 2) {
        setDetClef(r.clef);
        setNotes(r.notes.slice(0, 2).map(n => ({ pos: n.pos, acc: n.acc })));
      }
      return;
    }

    setDetClef(r.clef);
    const twoNotes = r.notes.slice(0, 2);
    setNotes(twoNotes.map(n => ({ pos: n.pos, acc: n.acc })));
    setStatusText(`Read: ${r.clef} clef, ${twoNotes.map(n => pnNote(r.clef, n.pos, n.acc).name).join(' and ')}.`);
    showToast('PIANO NOTES READ ✓');
  };

  const handleSample = () => {
    setClefSel('treble');
    // pos 0 = bottom staff line (E4 in treble), pos 4 = middle line (B4) → Perfect 5th
    setNotes([{ pos: 0, acc: 0 }, { pos: 4, acc: 0 }]);
    setStatusText('Loaded Sample: Treble Clef, E4 and B4 (Perfect 5th)');
    showToast('SAMPLE NOTES (E4 - B4) LOADED ✓');
  };

  const handleClear = () => {
    setNotes([{ pos: 0, acc: 0 }, { pos: 0, acc: 0 }]);
    setPreviewUri('');
    setPreviewMeta('');
    setStatusText('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('PIANO CLEARED ✓');
  };

  const handlePosChange = (index, delta) => {
    const updated = [...notes];
    updated[index] = { ...updated[index], pos: updated[index].pos + delta };
    setNotes(updated);
  };

  const handleAccChange = (index, acc) => {
    const updated = [...notes];
    updated[index] = { ...updated[index], acc };
    setNotes(updated);
  };

  const copyItems = [];
  if (code) {
    copyItems.push({ label: `COPY CODE (${code})`, value: code });
    copyItems.push({ label: `INTERVAL (${intervalName})`, value: intervalName });
  }

  const stampStats = `${ns[0].name} → ${ns[1].name} | ${st} HALF-STEPS (${effectiveClef.toUpperCase()} CLEF)`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🎹 🎼 ♯ ♭"
              title="Click here, then paste a screenshot of the piano music staff"
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
          <div className="piano-config" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="search-config-label">CLEF:</span>
              <button
                type="button"
                className={`bg-btn ${clefSel === 'auto' ? 'active' : ''}`}
                style={{ borderColor: clefSel === 'auto' ? 'var(--brass)' : '' }}
                onClick={() => setClefSel('auto')}
              >
                Auto ({detClef})
              </button>
              <button
                type="button"
                className={`bg-btn ${clefSel === 'treble' ? 'active' : ''}`}
                style={{ borderColor: clefSel === 'treble' ? 'var(--brass)' : '' }}
                onClick={() => setClefSel('treble')}
              >
                Treble
              </button>
              <button
                type="button"
                className={`bg-btn ${clefSel === 'bass' ? 'active' : ''}`}
                style={{ borderColor: clefSel === 'bass' ? 'var(--brass)' : '' }}
                onClick={() => setClefSel('bass')}
              >
                Bass
              </button>
            </div>

            <div className="search-config-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="search-config-label" htmlFor={`${uid}-codes`}>
                  STAGE CODE TABLE (Interval to Code mapping):
                </label>
                <button
                  type="button"
                  className="bg-btn"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={() => {
                    setCodesText(PN_DEFAULT_CODES);
                    try { localStorage.setItem(PN_KEY, PN_DEFAULT_CODES); } catch (e) {}
                    showToast('RESET CODES TO DEFAULT ✓');
                  }}
                >
                  Reset Defaults
                </button>
              </div>
              <textarea
                id={`${uid}-codes`}
                className="password-rows-field"
                rows={2}
                value={codesText}
                onChange={(e) => {
                  setCodesText(e.target.value);
                  try { localStorage.setItem(PN_KEY, e.target.value); } catch (err) {}
                }}
              />
            </div>

            {statusText && (
              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--brass)' }}>
                {statusText}
              </div>
            )}
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="PIANO INTERVAL &amp; ACCESS CODE"
          stats={stampStats}
          answers={code ? [code, intervalName] : (st > 0 ? [intervalName] : [])}
          copyValue={code || intervalName}
          placeholder="UPLOAD STAFF IMAGE"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="STAFF NOTES ADJUSTMENT — adjust pitch or accidentals if OCR misread"
        >
          <PianoWorking
            notes={notes}
            noteNames={ns.map(n => n.name)}
            onPosChange={handlePosChange}
            onAccChange={handleAccChange}
          />
        </WorkingPanel>
      }
    />
  );
}

export const pianoModule = {
  id: 'piano',
  tabId: 'tabPiano',
  tabLabel: '🎹 PIANO',
  eyebrow: 'PIANO INTERVAL SOLVER',
  title: 'Piano Vision',
  sub: 'Upload a screenshot of the piano music staff. Detects the clef and two notes, computes the <b>semitone interval and code</b>, and copies to your clipboard!',
  Component: PianoModule
};
