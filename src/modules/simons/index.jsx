import React, { useState } from 'react';
import {
  SINAMES,
  SIMON_DEFAULT_RULES,
  parseSimonRules,
  siAnalyzeFrames
} from './simonsSolver.js';
import { decodeGIFRGBA } from '../../utils/gif.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
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
        const secs = (g.frames.reduce((a, x) => a + x.delay, 0) / 1000).toFixed(1);
        let note = `GIF ${g.frames.length} fr, ${secs}s · ${r.flashes.length} flash${r.flashes.length === 1 ? '' : 'es'}: ${r.flashes.join(' ') || 'none'}`;
        if (r.stage) note += ` · stage ${r.stage}`;
        const warn = (r.stage && r.flashes.length !== r.stage) ? `expected ${r.stage} flashes` : (r.warn ? 'colours look unusual — different crop?' : '');
        return { name, color: r.color, thumb: thumbFrom(g.frames[r.thumbIndex].data, g.w, g.h), note, warn };
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
  return { name, color: r.color, thumb: thumbFrom(data, W, H), note: 'still frame', warn: r.warn ? 'colours look unusual — different crop?' : '' };
}

export function SimonsModule({ isActive = true }) {
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);
  const multi = Boolean(inst && inst.multi);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  // The manual is the same for every copy of this module, so all windows share it
  const [rulesText, setRulesText] = useSharedSetting('bombvision_simon_rules', SIMON_DEFAULT_RULES);
  const rules = React.useMemo(() => parseSimonRules(rulesText) || parseSimonRules(SIMON_DEFAULT_RULES), [rulesText]);
  // Which answer COPY ON DECODE puts on the clipboard (both are always shown)
  const [autoCopy, setAutoCopy] = useSharedSetting('bombvision_simon_autocopy', 'odd');
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);

  const counted = entries.filter(e => e.color);
  const oddSeq = counted.map(e => rules.odd[e.color]);
  const evenSeq = counted.map(e => rules.even[e.color]);
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
    if (!found.length) return;
    setEntries(prev => [...prev, ...found]);
    const got = found.filter(f => f.color);
    showToast(got.length
      ? `STAGE ${counted.length + got.length}: ${got.map(f => SINAMES[f.color]).join(' → ')} ✓`
      : 'NO GLOW FOUND — PICK THE COLOUR ON THE ENTRY');
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

  const answers = (
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
            {seq.length ? seq.map((c, i) => <SimonChip key={i} c={c} />) : <span className="simon-status">—</span>}
          </div>
        </div>
      ))}
    </div>
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
              title={multi ? 'Drop / paste this Simon’s GIF' : 'Click here, then paste the Simon Says GIF or frame'}
              sub={<>one GIF per stage — its <b>last</b> flash is the new colour · several files are read in name order</>}
            />
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear}>clear</button>
              <button className="reset-btn" type="button" onClick={removeLast} disabled={!entries.length}>↶ remove last</button>
              <span className="simon-autocopy">
                <span className="simon-status">copies:</span>
                <button type="button" className={`bg-btn ${autoCopy === 'odd' ? 'active' : ''}`} onClick={() => setAutoCopy('odd')}>ODD</button>
                <button type="button" className={`bg-btn ${autoCopy === 'even' ? 'active' : ''}`} onClick={() => setAutoCopy('even')}>EVEN</button>
              </span>
            </>
          }
        >
          {!grouped && (
            <details className="simon-manual-details" style={{ marginTop: '8px' }}>
              <summary className="simon-manual-summary">📖 MANUAL RULES (EVEN / ODD)</summary>
              <textarea
                className="search-words-field"
                style={{ height: '140px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace', width: '100%' }}
                spellCheck={false}
                value={rulesText}
                onChange={e => setRulesText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="bg-btn" onClick={() => setRulesText(SIMON_DEFAULT_RULES)}>🔄 RESTORE DEFAULT</button>
                {!parseSimonRules(rulesText) && <span className="simon-status warn">Could not find all 8 rules — using the default table.</span>}
              </div>
            </details>
          )}
        </ModuleInput>
      }
      answers={answers}
      working={
        <WorkingPanel title={`STAGES (${counted.length}) — uploads, fixes & rule table`} defaultExpanded>
          <SimonsWorking
            entries={entries}
            rules={rules}
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
  sub: 'Paste one GIF per stage — the <b>last flash</b> in it is read and mapped through both tables. <b>ODD</b> is on the left, <b>EVEN</b> on the right; tap a colour on any stage to fix a misread.',
  Component: SimonsModule
};
