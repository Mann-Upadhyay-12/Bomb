import React, { useState, useEffect, useId } from 'react';
import { preWarmOCR } from '../search/searchOCR.js';
import { SAMPLE_PAIRS, parseEchoPairs, lookupEcho } from './echoSolver.js';
import { readEchoImage } from './echoVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { manualBoxPaste } from '../../core/airPaste.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
import { useCardState } from '../../core/room/useCardState.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';

export const ECHO_PAIRS_KEY = 'bombvision_echo_pairs';
const KEY = ECHO_PAIRS_KEY;

export function EchoModule({ isActive = true }) {
  React.useEffect(() => { preWarmOCR(); }, []);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  const uid = useId();
  // a card of the multiple page: the manual is the 📖 bar above the cards (pasted once for all)
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);
  const [list, setList] = useSharedSetting(KEY, '');
  // in a room, the word (read from a picture or typed) is the room's: only the app that took the
  // picture reads it, the teammates get the word (core/room/useCardState.js)
  const [word, setWord] = useCardState('word', '');
  const [log, setLog] = useState([]); // [{ from, to }] one per stage answered
  const [status, setStatus] = useCardState('status', { text: '', ok: null });
  const [busy, setBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState('');

  const parsed = parseEchoPairs(list);
  const hit = lookupEcho(parsed, word);
  const answer = hit && hit.to ? hit.to : '';

  useEffect(() => {
    const fresh = answerChanged(answer);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  // each answered word is a stage (the same word twice in a row is one stage)
  useEffect(() => {
    if (!hit || !hit.to) return;
    setLog(prev => (prev.length && prev[prev.length - 1].from === hit.from ? prev : [...prev, { from: hit.from, to: hit.to }].slice(-10)));
  }, [hit && hit.from]);

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setLastImage(img, fileBlob);
    if (busy) return;
    setBusy(true);
    setStatus({ text: 'Reading the word…', ok: null });
    try {
      const res = await readEchoImage(img);
      if (!res.ok) { setStatus({ text: `⚠ ${res.reason}`, ok: false }); return; }
      setWord(res.word);
      const h = lookupEcho(parsed, res.word);
      setStatus(!parsed.pairs.length ? { text: `✓ Read ${res.word}. Paste the word list to get its pair.`, ok: null }
        : h && h.to ? { text: `✓ Read ${res.word}${h.exact ? '' : ` — taken as ${h.from} (the closest word on the list)`}.`, ok: h.exact }
        : { text: `⚠ Read ${res.word}, which isn't on the left of the list — check the word.`, ok: false });
    } catch (e) {
      setStatus({ text: `⚠ ${e.message} — type the word below.`, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const handleSample = () => { setList(SAMPLE_PAIRS); setWord('COYLY'); setStatus({ text: '', ok: null }); };
  const handleClear = () => { setWord(''); setLog([]); setPreviewUri(''); setStatus({ text: '', ok: null }); setLastImage(null, null); setLastCopyString(''); };

  const placeholder = !parsed.pairs.length ? 'PASTE THE ECHO WORD LIST'
    : busy ? '📷 READING…'
    : !word ? `STAGE ${Math.min(10, log.length + 1)}: PASTE THE PICTURE`
    : hit && hit.onRight ? `${word.toUpperCase()} IS ONLY ON THE RIGHT (${hit.onRight} → ${word.toUpperCase()})`
    : 'NOT ON THE LIST — CHECK THE WORD';

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={<Dropzone shareReading onImage={handleImage} icon="CONGA → ?" title="Click here, then paste the Echo picture" sub={<>reads the <b>shown word</b> — paste each stage's picture</>} />}
          preview={previewUri ? (
            <div className="preview-row show">
              <img src={previewUri} alt="echo picture" />
              <span>{word || 'Echo picture'}</span>
              <button type="button" className="preview-clear-btn" onClick={() => setPreviewUri('')}>✕</button>
            </div>
          ) : null}
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear} data-card-clear>clear</button>
              <button className="reset-btn" type="button" style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }} onClick={handleSample}>⚡ SAMPLE</button>
            </>
          }
        >
          {status.text && <div className={`module-hint ${status.ok === false ? 'bad' : status.ok ? 'ok' : ''}`}>{status.text}</div>}
          <div className="btn-config">
            <div className="search-config-row">
              <div className="btn-config-head">
                {grouped ? <span className="search-config-label" style={{ margin: 0 }}>📖 MANUAL READ:</span>
                  : <label className="search-config-label" htmlFor={`${uid}-list`} style={{ margin: 0 }}>HELPER WORD LIST (paste as-is — shown word → word to enter):</label>}
                <span className={`maze-status-tag ${parsed.dupes.length ? 'warn' : ''}`}>{parsed.pairs.length} pairs{parsed.dupes.length ? ` · ⚠ ${parsed.dupes.join(', ')} twice` : ''}</span>
              </div>
              {!grouped && (
              <textarea id={`${uid}-list`} className="search-words-field manual-text" spellCheck={false}
                placeholder={'COYLY → CHACE\nHABIT → PLONK\n…'} value={list} onChange={(e) => setList(e.target.value)} onPaste={manualBoxPaste()} />
              )}
            </div>
            <div className="btn-pick-row">
              <label className="search-config-label" htmlFor={`${uid}-word`} style={{ margin: 0 }}>SHOWN WORD:</label>
              <input id={`${uid}-word`} list={`${uid}-words`} type="text" className="search-words-field btn-label-input"
                value={word} placeholder="e.g. CONGA" spellCheck="false" autoComplete="off" onChange={(e) => setWord(e.target.value.toUpperCase())} />
              <datalist id={`${uid}-words`}>{parsed.pairs.map(p => <option key={p.from} value={p.from} />)}</datalist>
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label={`ENTER — STAGE ${Math.min(10, Math.max(1, log.length))} OF 10`}
          stats={hit && hit.to ? `${hit.from} → ${hit.to}${hit.exact ? '' : ' · CLOSEST MATCH'}` : `${parsed.pairs.length} PAIRS`}
          answers={answer ? [answer] : []}
          copyValue={answer}
          placeholder={placeholder}
        />
      }
      copylines={<CopyLines items={answer ? [{ label: `COPY (${answer})`, value: answer }] : []} />}
      working={log.length ? (
        <WorkingPanel title="STAGES SO FAR">
          <div className="bsod-note">
            {log.map((e, i) => <div key={i}>Stage {i + 1}: {e.from} → <b>{e.to}</b></div>)}
            {hit && hit.near && hit.near.length ? <div>Close words on the list: {hit.near.join(', ')}</div> : null}
          </div>
        </WorkingPanel>
      ) : null}
    />
  );
}

export const echoModule = {
  id: 'echo',
  tabId: 'tabEcho',
  tabLabel: '🔁 ECHO',
  eyebrow: 'ECHO SOLVER',
  title: 'Echo Vision',
  sub: 'Paste the Helper word list once, then each stage\'s Echo picture (10 stages). Reads the shown word, finds it on the <b>left</b> of a pair and copies the <b>word on its right</b> to enter.',
  Component: EchoModule
};
