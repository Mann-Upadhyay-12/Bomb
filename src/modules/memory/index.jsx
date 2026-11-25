import React, { useState, useEffect, useId } from 'react';
import { preWarmOCR } from '../search/searchOCR.js';
import { SAMPLE_MANUAL, parseMemoryManual, solveMemoryStage } from './memorySolver.js';
import { readMemoryImage } from './memoryVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { manualBoxPaste } from '../../core/airPaste.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';

const KEY = 'bombvision_memory_manual';
const ord = (n) => ['', '1st', '2nd', '3rd', '4th'][n] || `${n}th`;

export function MemoryModule({ isActive = true }) {
  React.useEffect(() => { preWarmOCR(); }, []);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  const uid = useId();
  const [manual, setManual] = useSharedSetting(KEY, '');
  const [history, setHistory] = useState([]); // [{ pos, label, display }] per finished stage
  const [display, setDisplay] = useState(null);
  const [labels, setLabels] = useState(['', '', '', '']);
  const [status, setStatus] = useState({ text: '', ok: null });
  const [busy, setBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState('');

  const parsed = parseMemoryManual(manual);
  const stage = Math.min(5, history.length + 1);
  const done = history.length >= 5;
  const labelNums = labels.map(l => (/^[1-4]$/.test(String(l)) ? Number(l) : null));
  const labelsOk = labelNums.every(Boolean) && new Set(labelNums).size === 4;
  const r = !done && display ? solveMemoryStage(parsed, stage, display, labelsOk ? labelNums : null, history) : null;
  const ready = r && !r.error && r.pos;
  const answer = ready ? `Press the ${ord(r.pos)} button (label ${r.label})` : r && !r.error && r.label ? `Press the button labeled ${r.label}` : '';

  useEffect(() => {
    const fresh = answerChanged(`${stage}|${answer}`);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, stage, isActive]);

  // the answer on screen was pressed: remember it and go to the next stage
  const commit = () => {
    if (!ready) return false;
    setHistory(prev => [...prev, { pos: r.pos, label: r.label, display }]);
    setDisplay(null); setLabels(['', '', '', '']);
    return true;
  };

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setLastImage(img, fileBlob);
    if (busy) return;
    // the stage on screen, if answered: a picture of a different stage means it was pressed
    const prev = ready ? { pos: r.pos, label: r.label, display, key: `${display}|${labelNums.join('')}` } : null;
    setBusy(true);
    setStatus({ text: 'Reading the display and buttons…', ok: null });
    try {
      const res = await readMemoryImage(img);
      const advanced = !!(prev && res.ok && `${res.display}|${(res.labels || []).join('')}` !== prev.key);
      if (advanced) setHistory(h => [...h, { pos: prev.pos, label: prev.label, display: prev.display }]);
      if (res.display) setDisplay(res.display);
      if (res.labels && res.labels.length === 4) setLabels(res.labels.map(v => (v ? String(v) : '')));
      const nextStage = Math.min(5, history.length + (advanced ? 1 : 0) + 1);
      const dotNote = res.dots && res.dots.total === 5 && res.dots.lit !== nextStage - 1 && res.dots.lit > 0 ? ` The picture's lights say ${res.dots.lit} stage${res.dots.lit === 1 ? '' : 's'} done — check the stage.` : '';
      setStatus(res.ok
        ? { text: `✓ ${advanced ? `Stage ${nextStage - 1} saved. ` : ''}Stage ${nextStage}: display ${res.display}, buttons ${(res.labels || []).map(v => v || '?').join(' ')}${res.sure ? '' : ' — check them'}.${dotNote}`, ok: res.sure && !dotNote }
        : { text: `⚠ ${res.reason}`, ok: false });
    } catch (e) {
      setStatus({ text: `⚠ ${e.message} — enter the display and buttons below.`, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const handleSample = () => { setManual(SAMPLE_MANUAL); setHistory([]); setDisplay(1); setLabels(['4', '2', '3', '1']); setStatus({ text: '', ok: null }); };
  const handleClear = () => { setHistory([]); setDisplay(null); setLabels(['', '', '', '']); setPreviewUri(''); setStatus({ text: '', ok: null }); setLastImage(null, null); setLastCopyString(''); };
  const back = () => { setHistory(prev => prev.slice(0, -1)); setStatus({ text: '', ok: null }); };

  const placeholder = done ? 'ALL 5 STAGES DONE ✓'
    : !manual.trim() ? 'PASTE THE MEMORY MANUAL'
    : busy ? '📷 READING…'
    : !display ? `STAGE ${stage}: PASTE THE PICTURE`
    : r && r.error ? r.error.toUpperCase()
    : !labelsOk ? 'NEED: THE FOUR BUTTON LABELS'
    : '— — —';

  const copyItems = [];
  if (answer) {
    copyItems.push({ label: `COPY (${answer})`, value: answer });
    if (ready) copyItems.push({ label: `POSITION ${r.pos}`, value: String(r.pos) }, { label: `LABEL ${r.label}`, value: `label ${r.label}` });
  }

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={<Dropzone onImage={handleImage} icon="4 · ▢▢▢▢" title="Click here, then paste the Memory picture" sub={<>reads the <b>display</b> and the four <b>button labels</b> — paste each stage's picture</>} />}
          preview={previewUri ? (
            <div className="preview-row show">
              <img src={previewUri} alt="memory picture" />
              <span>Stage {stage}</span>
              <button type="button" className="preview-clear-btn" onClick={() => setPreviewUri('')}>✕</button>
            </div>
          ) : null}
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear} title="Start the module again from stage 1">clear</button>
              <button className="reset-btn" type="button" style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }} onClick={handleSample}>⚡ SAMPLE</button>
              <button className="reset-btn" type="button" disabled={!ready} onClick={() => { commit(); setStatus({ text: '', ok: null }); }} title="The Defuser pressed it: save this stage and go to the next">✓ pressed → next stage</button>
              <button className="reset-btn" type="button" disabled={!history.length} onClick={back} title="Go back one stage (a press saved by mistake)">↶ back a stage</button>
            </>
          }
        >
          {status.text && <div className={`module-hint ${status.ok === false ? 'bad' : status.ok ? 'ok' : ''}`}>{status.text}</div>}
          <div className="btn-config">
            <div className="search-config-row">
              <div className="btn-config-head">
                <label className="search-config-label" htmlFor={`${uid}-man`} style={{ margin: 0 }}>HELPER MANUAL (paste as-is — a rule per stage and display):</label>
                <span className={`maze-status-tag ${parsed.unclear.length || (manual.trim() && parsed.count < 20) ? 'warn' : ''}`}>
                  {parsed.count} / 20 rules{parsed.unclear.length ? ` · ⚠ ${parsed.unclear.length} unclear` : ''}
                </span>
              </div>
              <textarea id={`${uid}-man`} className="search-words-field manual-text" spellCheck={false}
                placeholder={'Stage 1:\nIf the display is 1, press the button labeled 4.\nIf the display is 2, press the button in the second position.\n…'}
                value={manual} onChange={(e) => setManual(e.target.value)} onPaste={manualBoxPaste()} />
            </div>
            <div className="mem-row">
              <div className="mem-field">
                <span className="search-config-label" style={{ margin: 0 }}>STAGE</span>
                <div className="mem-stages">{[1, 2, 3, 4, 5].map(s => <span key={s} className={`mem-dot ${s < stage || done ? 'done' : s === stage ? 'now' : ''}`}>{s}</span>)}</div>
              </div>
              <div className="mem-field">
                <span className="search-config-label" style={{ margin: 0 }}>DISPLAY</span>
                <div className="btn-swatches">
                  {[1, 2, 3, 4].map(n => <button key={n} type="button" className={`lvlgen-chip mem-pick ${display === n ? 'on' : ''}`} onClick={() => setDisplay(display === n ? null : n)}>{n}</button>)}
                </div>
              </div>
              <div className="mem-field">
                <span className="search-config-label" style={{ margin: 0 }}>BUTTONS LEFT → RIGHT</span>
                <div className="mem-labels">
                  {labels.map((v, i) => (
                    <input key={i} type="text" inputMode="numeric" maxLength={1} aria-label={`Button ${i + 1} label`}
                      className={`search-words-field mem-label ${ready && r.pos === i + 1 ? 'hit' : ''} ${v && !labelsOk ? 'warn' : ''}`}
                      value={v} placeholder="?"
                      onChange={(e) => { const d = e.target.value.replace(/[^1-4]/g, '').slice(-1); setLabels(prev => prev.map((x, j) => (j === i ? d : x))); }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label={`PRESS — STAGE ${stage} OF 5`}
          stats={ready ? `DISPLAY ${display} · ${r.rule.desc.toUpperCase()}` : `${history.length} OF 5 DONE`}
          answers={ready ? [`👆 ${ord(r.pos)} BUTTON · LABEL ${r.label}`] : answer ? [`👆 LABEL ${r.label}`] : []}
          copyValue={answer}
          placeholder={placeholder}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={manual.trim() ? (
        <WorkingPanel title={`STAGE ${stage} RULES — and what each stage pressed`}>
          <ol className="btn-rules">
            {[1, 2, 3, 4].map(d => {
              const rule = parsed.rules[stage] && parsed.rules[stage][d];
              return (
                <li key={d} className={`btn-rule ${display === d ? (ready ? 'hit' : 'block') : 'no'}`}>
                  <span className="btn-rule-n">{d}</span>
                  <span className="bsod-step">{rule ? rule.desc : '— no rule found —'}</span>
                  <span className="btn-rule-time">{display === d && ready ? `→ ${ord(r.pos)}` : ''}</span>
                  <span className={`btn-rule-status ${display === d && ready ? 'match' : ''}`}>{display === d ? (ready ? '✓' : '?') : ''}</span>
                </li>
              );
            })}
          </ol>
          {history.length > 0 && (
            <div className="bsod-note">
              {history.map((h, i) => <div key={i}>Stage {i + 1}: display {h.display} → pressed the <b>{ord(h.pos)}</b> button, label <b>{h.label}</b></div>)}
            </div>
          )}
        </WorkingPanel>
      ) : null}
    />
  );
}

export const memoryModule = {
  id: 'memory',
  tabId: 'tabMemory',
  tabLabel: '🧠 MEMORY',
  eyebrow: 'MEMORY SOLVER',
  title: 'Memory Vision',
  sub: 'Paste the Helper manual once, then each stage\'s Memory picture. Reads the <b>display</b> and the <b>four button labels</b>, applies the stage\'s rule and remembers every press (position and label) for the later stages. Pasting the next picture saves the stage you just answered.',
  Component: MemoryModule
};
