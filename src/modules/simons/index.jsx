import React, { useState } from 'react';
import { SINAMES, simonRules, siAnalyzeFrames, siReadManual } from './simonsSolver.js';
import { decodeGIFRGBA } from '../../utils/gif.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting, useSharedState } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { useBombSerial, serialHasVowel } from '../../core/bombSerial.js';
import { Dropzone, ManualPasteBox } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { SimonsWorking, SimonChip } from './working.jsx';

const THUMB = 56;

function thumbFrom(data, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), W, H), 0, 0);
  const t = document.createElement('canvas'); t.width = t.height = THUMB;
  t.getContext('2d').drawImage(c, 0, 0, THUMB, THUMB);
  return t.toDataURL();
}

const isGifBytes = (u8) => u8.length > 3 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46;

/** One screenshot / GIF → one stage entry { color, thumb, note, warn, name }. */
async function readSimonFile(blob, img) {
  const name = (blob && blob.name) || 'pasted image';
  if (blob) {
    const buf = await blob.arrayBuffer();
    if (isGifBytes(new Uint8Array(buf, 0, Math.min(4, buf.byteLength)))) {
      const g = decodeGIFRGBA(buf);
      if (g.frames.length) {
        const r = siAnalyzeFrames(g.frames, g.w, g.h);
        if (r.notSimon) return { name, notSimon: true };
        const secs = (g.frames.reduce((a, x) => a + x.delay, 0) / 1000).toFixed(1);
        let note = `GIF ${g.frames.length} fr, ${secs}s · ${r.flashes.length} flash${r.flashes.length === 1 ? '' : 'es'}: ${r.flashes.join(' ') || 'none'}`;
        if (r.stage) note += ` · stage ${r.stage}`;
        const warn = (r.stage && r.flashes.length !== r.stage) ? `expected ${r.stage} flashes` : (r.warn ? 'colours look unusual — different crop?' : '');
        // stage: known when the stage lights and the flash count agree
        const stage = r.stage && r.flashes.length === r.stage ? r.stage : 0;
        return { name, color: r.color, thumb: thumbFrom(g.frames[r.thumbIndex].data, g.w, g.h), note, warn, stage };
      }
    }
  }
  // Still image (or a GIF the browser gave us as a decoded <img>): one frame
  let src = img;
  if (!src && blob) src = await createImageBitmap(blob);
  if (!src) return { name, color: null, thumb: '', note: 'could not read file', warn: '' };
  const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, W, H).data;
  const r = siAnalyzeFrames([{ data }], W, H);
  if (r.notSimon) {
    // not the module: maybe this game's manual table
    const table = siReadManual(data, W, H);
    return table ? { name, manual: table } : { name, notSimon: true };
  }
  return { name, color: r.color, thumb: thumbFrom(data, W, H), note: 'still frame', warn: r.warn ? 'colours look unusual — different crop?' : '' };
}

export function SimonsModule({ isActive = true }) {
  const inst = useInstance();
  const multi = Boolean(inst && inst.multi);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  // This game's manual table (changes every game, so in memory only: a refresh clears it), shared
  // by every Simon copy; its row comes from the bomb serial (top bar) having a vowel
  const [table, setTable] = useSharedState('simon_manual_table', null);
  const [serial, setSerial] = useBombSerial();
  const hasSerial = Boolean(serial);
  const vowel = serialHasVowel(serial);
  const rules = simonRules(table, vowel);
  const ready = Boolean(table && hasSerial);
  // Which answer COPY ON DECODE puts on the clipboard (both are always shown)
  const [autoCopy, setAutoCopy] = useSharedSetting('bombvision_simon_autocopy', 'odd');
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  // the latest entries, for a picture handler that is an older copy of this function
  const entriesRef = React.useRef(entries);
  entriesRef.current = entries;

  const counted = entries.filter(e => e.color);
  // No manual or no serial yet → no answer (it would be a guess)
  const oddSeq = ready ? counted.map(e => rules.odd[e.color]) : [];
  const evenSeq = ready ? counted.map(e => rules.even[e.color]) : [];
  const oddStr = oddSeq.join(' ');
  const evenStr = evenSeq.join(' ');
  const copyFormatted = autoCopy === 'even' ? evenStr : oddStr;

  // Tell the group box what this copy's answer is
  const summary = counted.length ? `ODD ${oddStr} · EVEN ${evenStr}` : '';
  React.useEffect(() => { if (inst && inst.report) inst.report(summary); }, [summary]);

  React.useEffect(() => {
    const fresh = answerChanged(copyFormatted); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && fresh && copyFormatted) copy(copyFormatted);
  }, [copyFormatted, isActive]);

  const ingest = async (items) => {
    setBusy(true);
    const found = [];
    for (const { blob, img } of items) {
      try { found.push(await readSimonFile(blob, img)); }
      catch (e) { found.push({ name: (blob && blob.name) || 'image', color: null, thumb: '', note: 'could not read file', warn: '' }); }
    }
    setBusy(false);
    // The manual table picture sets this game's rules; anything else that isn't the module is skipped
    const manuals = found.filter(f => f.manual);
    if (manuals.length) setTable(manuals[manuals.length - 1].manual);
    const skipped = found.filter(f => f.notSimon).length;
    const kept = found.filter(f => !f.notSimon && !f.manual);
    if (!kept.length) {
      if (manuals.length) showToast('SIMON MANUAL READ ✓');
      else if (skipped) showToast('NOT A SIMON MODULE OR MANUAL — IGNORED');
      return;
    }
    // a GIF of a stage already in the list (one drop taken twice, or the GIF sent again) replaces
    // that stage instead of adding one
    const add = (list) => {
      const out = [...list];
      for (const k of kept) {
        const at = k.stage ? out.findIndex(e => e.stage === k.stage) : -1;
        if (at >= 0) out[at] = k; else out.push(k);
      }
      return out;
    };
    const before = entriesRef.current;
    const after = add(before);
    setEntries(add);
    const got = kept.filter(f => f.color);
    const again = kept.filter(k => k.stage && before.some(e => e.stage === k.stage)).map(k => k.stage);
    const skipNote = (manuals.length ? ' · manual read' : '')
      + (skipped ? ` · ${skipped} non-Simon image${skipped === 1 ? '' : 's'} ignored` : '')
      + (again.length ? ` · stage ${again.join(', ')} was already in — replaced` : '');
    showToast((got.length
      ? `STAGE ${after.filter(e => e.color).length}: ${got.map(f => SINAMES[f.color]).join(' → ')} ✓`
      : 'NO GLOW FOUND — PICK THE COLOUR ON THE ENTRY') + skipNote);
  };

  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    ingest([{ blob: fileBlob, img }]);
  };

  // Several frames / GIFs at once: one stage each, in file-name order (frame1, frame2, …)
  const handleFiles = (files) => {
    const list = Array.from(files).filter(f => f && (!f.type || f.type.startsWith('image/')));
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
    ingest(list.map(f => ({ blob: f, img: null })));
  };

  const addManual = (c) => setEntries(prev => [...prev, { name: 'manual', color: c, thumb: '', note: 'added by hand', warn: '' }]);
  const fixEntry = (i, c) => setEntries(prev => prev.map((e, j) => (j === i ? { ...e, color: c, note: e.note.includes('manual') ? e.note : `${e.note} · manual`, warn: '' } : e)));
  const removeEntry = (i) => setEntries(prev => prev.filter((_, j) => j !== i));
  const removeLast = () => setEntries(prev => prev.slice(0, -1));

  const handleClear = () => {
    setEntries([]);
    setLastImage(null, null);
    setLastCopyString('');
    showToast('SIMON CLEARED ✓');
  };

  const copySeq = (label, s) => { if (s) copy(s, `${label} COPIED ✓`); };

  const manualPrompt = !table && (
    <div className="simon-serial-need">
      <span>Paste <b>this game's manual table</b> picture here (it changes every game) — then the GIFs.</span>
    </div>
  );

  const serialPrompt = !hasSerial && (
    <div className="simon-serial-need">
      <span>Type the bomb <b>SERIAL</b> (top bar, once per game) — the table row depends on whether it has a vowel:</span>
      <input
        type="text"
        className="bg-hex"
        value={serial}
        placeholder="serial"
        spellCheck="false"
        autoComplete="off"
        onChange={(e) => setSerial(e.target.value)}
      />
    </div>
  );

  const answers = (
    <>
    {manualPrompt}
    {serialPrompt}
    <div className="simon-answer">
      {[['odd', 'ODD', 'odd # of modules disarmed', oddSeq, oddStr], ['even', 'EVEN', 'even # of modules disarmed', evenSeq, evenStr]].map(([k, label, sub, seq, str]) => (
        <div
          key={k}
          className={`simon-ans-col ${autoCopy === k ? 'auto' : ''}`}
          role="button"
          tabIndex={0}
          title={`Click to copy the ${label} sequence`}
          onClick={() => copySeq(label, str)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copySeq(label, str); } }}
        >
          <div className="simon-ans-head">
            <span className="simon-ans-label">{label}</span>
            <span className="simon-ans-sub">{sub}</span>
          </div>
          <div className="simon-ans-row">
            {seq.length ? seq.map((c, i) => <SimonChip key={i} c={c} />) : <span className="simon-status">{ready || !counted.length ? '—' : !table ? 'needs manual' : 'needs serial'}</span>}
          </div>
        </div>
      ))}
    </div>
    </>
  );

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              onFiles={handleFiles}
              multiple
              icon={busy ? '⏳' : '🔴 🔵 🟡 🟢'}
              title={multi ? 'Drop / paste this Simon’s GIF (or the manual)' : 'Click here, then paste the Simon manual table, then each GIF'}
              sub={<>manual picture once per game · one GIF per stage — its <b>last</b> flash is the new colour · several files are read in name order</>}
            />
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear} data-card-clear>clear</button>
              <button className="reset-btn" type="button" onClick={removeLast} disabled={!entries.length}>↶ remove last</button>
              <span className="simon-autocopy">
                <span className="simon-status">copies:</span>
                <button type="button" className={`bg-btn ${autoCopy === 'odd' ? 'active' : ''}`} onClick={() => setAutoCopy('odd')}>ODD</button>
                <button type="button" className={`bg-btn ${autoCopy === 'even' ? 'active' : ''}`} onClick={() => setAutoCopy('even')}>EVEN</button>
              </span>
            </>
          }
        >
          <div className="simon-status" style={{ marginTop: '8px' }}>
            {!table ? <>No manual yet — paste this game's Simon manual table picture.</>
              : hasSerial
                ? <>Manual read ✓ · serial <b>{serial}</b> → <b>{vowel ? 'VOWEL' : 'NO VOWEL'}</b> rows</>
                : <>Manual read ✓ · its rows are picked by the serial — set it in the top bar.</>}
          </div>
          <ManualPasteBox what="Simon manual table" card={multi ? inst.index : null} />
        </ModuleInput>
      }
      answers={answers}
      working={
        <WorkingPanel title={`STAGES (${counted.length}) — uploads, fixes & rule table`} defaultExpanded>
          <SimonsWorking
            entries={entries}
            table={table}
            vowel={hasSerial ? vowel : null}
            compact={multi}
            onAddColor={addManual}
            onFixEntry={fixEntry}
            onRemoveEntry={removeEntry}
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
  sub: 'Paste this game\'s <b>manual table</b> picture (it changes every game), then one GIF per stage — the <b>last flash</b> in it is mapped through that table, using the <b>serial</b> from the top bar (vowel / no vowel). <b>ODD</b> modules disarmed is on the left, <b>EVEN</b> on the right; tap a colour on any stage to fix a misread.',
  Component: SimonsModule
};
