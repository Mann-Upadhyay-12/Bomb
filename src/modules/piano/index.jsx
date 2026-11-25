import React, { useState, useEffect, useId } from 'react';
import { PN_DEFAULT_CODES, pnNote, pnDrawnName, PN_NATURAL, pnParseCodes, PN_KEYS, pnKeyAccidentals, pnParseKeyField, pnEffectiveAcc, pnInterval } from './pianoSolver.js';
import { pnAnalyze } from './pianoVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
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
  const answerChanged = useAnswerGate();
  const uid = useId(); // per-instance ids: missions can show the same module several times

  const [clefSel, setClefSel] = useState('auto');
  const [detClef, setDetClef] = useState('bass');
  const [notes, setNotes] = useState([{ pos: 0, acc: 0 }, { pos: 0, acc: 0 }]);
  // no answer until both notes come from a picture, the sample, a tap on the staff or ▲ ▼ (two
  // default notes would read as "Unison"); a tap places one note at a time
  const [placed, setPlaced] = useState([false, false]);
  const touched = placed[0] && placed[1];
  const setTouched = (v) => setPlaced([v, v]);
  // key signature from the bot's message ("Key Signature: F Major."), '' = none / C major
  const [keySig, setKeySig] = useState('');
  // what's in the key field ("E", "E Major" or the whole bot message); a readable key sets keySig
  const [keyText, setKeyText] = useState('');
  const keyTextBad = keyText.trim() !== '' && !pnParseKeyField(keyText);
  const onKeyText = (v) => {
    setKeyText(v);
    // unreadable text clears the key too: a stale key from the last stage would give a wrong answer
    setKeySig(pnParseKeyField(v) || '');
  };
  // The interval → code table is the same for every Piano module, so all windows share it
  const [codesText, setCodesText] = useSharedSetting(PN_KEY, PN_DEFAULT_CODES);
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);

  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');
  const [statusText, setStatusText] = useState('');

  const effectiveClef = clefSel === 'auto' ? detClef : clefSel;
  // a note drawn without ♯ / ♭ takes the key signature's
  const ns = notes.map(n => {
    const sounding = pnNote(effectiveClef, n.pos, pnEffectiveAcc(effectiveClef, n.pos, n.acc, keySig));
    // a drawn ♮ shows as A♮4 so it's clear the key was cancelled
    return n.acc === PN_NATURAL ? { ...sounding, name: pnDrawnName(effectiveClef, n.pos, n.acc) } : sounding;
  });
  // the distance between the two notes as drawn (no up / down)
  const iv = pnInterval(ns[0].semi, ns[1].semi);
  const name = touched ? iv.name : '';

  // the code the helpers give for that interval: only trusted once this game's table is pasted
  // (the built-in table is an old game's)
  const parsedCodes = pnParseCodes(codesText);
  const defaultCodes = codesText.replace(/\s+/g, ' ').trim() === PN_DEFAULT_CODES.replace(/\s+/g, ' ').trim();
  const code = touched && !defaultCodes ? parsedCodes[iv.name.toLowerCase()] || '' : '';
  const copyVal = name ? (code ? `${name} ${code}` : name) : '';

  useEffect(() => {
    const fresh = answerChanged(copyVal); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(copyVal);
    if (copyOnDecode && fresh && copyVal) copy(copyVal);
  }, [copyVal, isActive]);

  // this copy's one-line answer in a module group
  const summary = copyVal;
  useEffect(() => { if (inst && inst.report) inst.report(summary); }, [summary]);

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
        setTouched(true);
      }
      return;
    }

    setDetClef(r.clef);
    const twoNotes = r.notes.slice(0, 2);
    setNotes(twoNotes.map(n => ({ pos: n.pos, acc: n.acc })));
    setTouched(true);
    setStatusText(`Read: ${r.clef} clef, ${twoNotes.map(n => pnDrawnName(r.clef, n.pos, n.acc)).join(' then ')} (as drawn).`);
    showToast('PIANO NOTES READ ✓');
  };

  const handleSample = () => {
    setClefSel('treble');
    // pos 0 = bottom staff line (E4 in treble), pos 4 = middle line (B4) → Perfect 5th
    setNotes([{ pos: 0, acc: 0 }, { pos: 4, acc: 0 }]);
    setKeySig('');
    setKeyText('');
    setTouched(true);
    setStatusText('Loaded Sample: Treble Clef, E4 then B4 (Perfect 5th)');
    showToast('SAMPLE NOTES (E4 - B4) LOADED ✓');
  };

  const handleClear = () => {
    setNotes([{ pos: 0, acc: 0 }, { pos: 0, acc: 0 }]);
    setTouched(false);
    setKeySig('');
    setKeyText('');
    setPreviewUri('');
    setPreviewMeta('');
    setStatusText('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('PIANO CLEARED ✓');
  };

  const placeNote = (index) => setPlaced(p => p.map((x, k) => x || k === index));

  const handlePosChange = (index, delta) => {
    const updated = [...notes];
    updated[index] = { ...updated[index], pos: updated[index].pos + delta };
    setNotes(updated);
    placeNote(index);
  };

  // a tap on the staff puts that note there
  const handleSetPos = (index, pos) => {
    const updated = [...notes];
    updated[index] = { ...updated[index], pos };
    setNotes(updated);
    placeNote(index);
  };

  // the sign drawn before a note: 1 ♯, -1 ♭, 'n' ♮, 0 nothing (the key decides)
  const handleAccChange = (index, acc) => {
    const updated = [...notes];
    updated[index] = { ...updated[index], acc };
    setNotes(updated);
  };

  // tapping the clef on the staff switches it (and stops following the picture's clef)
  const toggleClef = () => setClefSel(effectiveClef === 'treble' ? 'bass' : 'treble');
  // nothing drawn, but the key changes this note (A in A♭ major → A♭)
  const fromKey = notes.map(n => !n.acc && pnEffectiveAcc(effectiveClef, n.pos, 0, keySig) !== 0);

  const copyItems = [];
  if (touched) {
    copyItems.push({ label: iv.name, value: iv.name });
    if (code) copyItems.push({ label: `CODE ONLY (${code})`, value: code });
  }

  const keyAcc = pnKeyAccidentals(keySig);
  const keyDesc = Object.keys(keyAcc).length
    ? Object.entries(keyAcc).map(([l, a]) => l + (a > 0 ? '♯' : '♭')).join(' ')
    : 'no ♯ / ♭';
  const stats = touched
    ? `${ns[0].name} → ${ns[1].name} · ${iv.distance} HALF-STEP${iv.distance === 1 ? '' : 'S'}${iv.octaveDropped ? ' (OCTAVE DROPPED)' : ''} · KEY: ${keySig ? keySig.toUpperCase() : 'NONE'}${defaultCodes ? ' · PASTE THIS GAME\'S CODE TABLE FOR THE CODE' : ''}`
    : null;

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
            <div className="piano-key-row">
              <label className="search-config-label" htmlFor={`${uid}-keytext`}>KEY SIGNATURE:</label>
              <input
                id={`${uid}-keytext`}
                type="text"
                className={`bg-hex piano-key-text${keyTextBad ? ' bad' : ''}`}
                placeholder="paste: E Major"
                value={keyText}
                spellCheck={false}
                autoComplete="off"
                title="Paste or type the key from the bot's message: E, E Major, Bb, F# minor, or the whole message"
                onFocus={e => e.target.select()}
                onChange={e => onKeyText(e.target.value)}
              />
              <select id={`${uid}-key`} aria-label="Key signature" className="bg-hex piano-key-select" value={keySig} onChange={e => { setKeySig(e.target.value); setKeyText(''); }}>
                <option value="">None (no ♯ / ♭)</option>
                {PN_KEYS.map(k => {
                  const a = pnKeyAccidentals(k.id);
                  const d = Object.keys(a).length ? Object.entries(a).map(([l, x]) => l + (x > 0 ? '♯' : '♭')).join(' ') : 'no ♯ / ♭';
                  return <option key={k.id} value={k.id}>{k.id} — {d}</option>;
                })}
              </select>
              <span className="piano-key-tip">{keyTextBad ? <>can't read that key — try “E Major”, “Bb”, “F#”</> : keySig ? <>notes without their own ♯ / ♭: <b>{keyDesc}</b></> : <>changes every stage — paste the new one each time</>}</span>
            </div>

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

            {!grouped && (
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
                onChange={(e) => setCodesText(e.target.value)}
              />
            </div>
            )}

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
          report={false}
          label="INTERVAL"
          stats={stats}
          answers={copyVal ? [copyVal] : []}
          copyValue={copyVal || null}
          placeholder="PASTE THE STAFF OR TAP BOTH NOTES"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="STAFF — what was read; tap to fix it"
        >
          <PianoWorking
            clef={effectiveClef}
            notes={notes}
            shown={placed}
            noteNames={ns.map(n => n.name)}
            fromKey={fromKey}
            picture={previewUri}
            onSetPos={handleSetPos}
            onPosChange={handlePosChange}
            onAccChange={handleAccChange}
            onToggleClef={toggleClef}
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
  sub: 'Upload a screenshot of the piano music staff. Detects the clef and both notes, and names the <b>interval</b> between them (the distance as drawn) — with its <b>code</b> once this game’s code table is pasted. Paste the <b>key signature</b> from the bot\'s message (“E Major”) into the key field: notes without their own ♯ / ♭ take it.',
  Component: PianoModule
};
