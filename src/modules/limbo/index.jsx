import React, { useState, useRef } from 'react';
import { solveLimbo, SLOT_NAMES } from './limboSolver.js';
import { decodeGIFRGBA } from '../../utils/gif.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { LimboWorking, LimboBoard } from './working.jsx';

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const isGifBytes = (u8) => u8.length > 3 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46;

/** ImageData of one decoded frame → data URI (for the preview). */
function frameUri(fr, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(fr.data), W, H), 0, 0);
  return c.toDataURL();
}

export function LimboModule({ isActive = true }) {
  const inst = useInstance();
  const multi = Boolean(inst && inst.multi);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  const gifRef = useRef(null); // { frames, w, h } of the last GIF, to re-run with a picked start key
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState({ start: '', end: '' });
  const [meta, setMeta] = useState('');

  const answer = result && result.answer ? cap(result.answer) : '';

  React.useEffect(() => {
    const fresh = answerChanged(answer);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  const run = (override = null) => {
    const g = gifRef.current;
    if (!g) return null;
    const r = solveLimbo(g.frames, g.w, g.h, override);
    setResult(r);
    return r;
  };

  const handleImage = async (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    setError('');
    if (!fileBlob) { setError('Drop or paste the Limbo .gif file itself — a still image has no shuffle to follow.'); return; }
    setBusy(true);
    try {
      const buf = await fileBlob.arrayBuffer();
      if (!isGifBytes(new Uint8Array(buf, 0, Math.min(4, buf.byteLength)))) {
        setError('That is a still image — Limbo needs the GIF (the whole shuffle).');
        return;
      }
      const g = decodeGIFRGBA(buf);
      if (!g.frames.length) throw new Error('no frames');
      gifRef.current = g;
      const r = run(null);
      const secs = (g.frames.reduce((a, x) => a + (x.delay || 0), 0) / 1000).toFixed(1);
      setMeta(`${g.w}×${g.h} · ${g.frames.length} frames · ${secs}s`);
      setThumbs({
        start: frameUri(g.frames[Math.min(1, g.frames.length - 1)], g.w, g.h),
        end: frameUri(g.frames[g.frames.length - 1], g.w, g.h)
      });
      if (!r.ok) { setError(r.reason); return; }
      if (r.answer) showToast(`LIMBO: ${r.answer.toUpperCase()} ✓`);
      else if (r.start === null) showToast('NO GLOWING KEY FOUND — TAP THE START KEY');
      else showToast('NO COLOUR FRAME AT THE END OF THE GIF');
    } catch (e) {
      setError(`Could not read that GIF (${e.message || e}).`);
    } finally {
      setBusy(false);
    }
  };

  const pickStart = (k) => {
    const r = run(k);
    if (r && r.answer) showToast(`START = ${SLOT_NAMES[k].toUpperCase()} → ${r.answer.toUpperCase()} ✓`);
  };

  const handleClear = () => {
    gifRef.current = null;
    setResult(null);
    setError('');
    setThumbs({ start: '', end: '' });
    setMeta('');
    setLastImage(null, null);
    setLastCopyString('');
  };

  const r = result && result.ok ? result : null;
  const stats = r
    ? `${SLOT_NAMES[r.start] || '?'} → ${SLOT_NAMES[r.end] || '?'} · ${r.moves.length} moves${r.unsureMoves ? ` · ${r.unsureMoves} unsure` : ''}`
    : null;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon={busy ? '⏳' : '🗝️'}
              title={multi ? 'Drop / paste this Limbo GIF' : 'Click here, then paste the Limbo GIF'}
              sub={<>the whole GIF: the glowing key at the start, the shuffle, the colours at the end</>}
            />
          }
          controls={<button className="reset-btn" type="button" onClick={handleClear}>clear</button>}
        >
          {error && <div className="limbo-status warn">{error}</div>}
          {r && !r.startSure && (
            <div className="limbo-status warn">
              {r.detectedStart === null ? 'No glowing key found at the start' : 'The start glow is faint'} — tap the key that glowed on the board below.
            </div>
          )}
          {r && !r.colors && <div className="limbo-status warn">The GIF has no colour frame at the end — the answer is the slot: <b>{SLOT_NAMES[r.end]}</b>.</div>}
        </ModuleInput>
      }
      answers={
        <>
          <AnswerPanel
            label="KEY COLOUR"
            stats={stats}
            answers={answer}
            placeholder="— — —"
          />
          {r && (
            <LimboBoard result={r} onPickStart={pickStart} />
          )}
        </>
      }
      working={
        <WorkingPanel title={r ? `SHUFFLE (${r.moves.length} MOVES)` : 'SHUFFLE'} defaultExpanded={false}>
          <LimboWorking result={r} thumbs={thumbs} meta={meta} />
        </WorkingPanel>
      }
    />
  );
}

export const limboModule = {
  id: 'limbo',
  tabId: 'tabLimbo',
  tabLabel: '🗝️ LIMBO',
  eyebrow: 'LIMBO SOLVER',
  title: 'Limbo Vision',
  sub: 'Paste the Limbo <b>GIF</b>. The key that <b>glows</b> at the start is followed through every swap, and its colour in the <b>last frame</b> is the answer. If the start glow is missing, tap the start key on the board.',
  Component: LimboModule
};
