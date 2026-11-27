import React, { useState, useEffect, useId } from 'react';
import { preWarmOCR } from '../search/searchOCR.js';
import { parseCrashMessage, solveBluescreen, countableModules, moduleLabel, ordinal, SAMPLE_MESSAGE } from './bluescreenSolver.js';
import { readBluescreenImage } from './bluescreenVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useBombSerial } from '../../core/bombSerial.js';
import { useCardState } from '../../core/room/useCardState.js';
import { useLevel, boardOrder } from '../../core/LevelContext.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { useAirText } from '../../core/airPaste.js';

const emptyFacts = () => ({ error: '', disarmed: '', armed: '' });

export function BluescreenModule({ isActive = true }) {
  React.useEffect(() => { preWarmOCR(); }, []);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  const uid = useId();

  const [serial, setSerial] = useBombSerial();
  // in a room, the crash message, its numbers and what the picture gave are the card's, the room's:
  // only the app that took the picture reads it (core/room/useCardState.js)
  const [message, setMessage] = useCardState('message', '');
  const [facts, setFacts] = useCardState('facts', emptyFacts);
  const [status, setStatus] = useCardState('status', { text: '', ok: null });
  const [busy, setBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  // the level's cards the Defuser has disarmed (board slots, 1-based); kept between crashes. In a room
  // they're the room's (core/room/useCardState.js): a list, since a Set isn't plain data
  const [tickedList, setTickedList] = useCardState('ticked', []);
  const ticked = React.useMemo(() => new Set(tickedList), [tickedList]);
  const setTicked = (next) => setTickedList(prev => [...(typeof next === 'function' ? next(new Set(prev)) : next)].sort((a, b) => a - b));

  const level = useLevel();
  const cards = countableModules(boardOrder(level));
  const tickedCards = cards.filter(c => ticked.has(c.slot));
  const toggle = (slot) => setTicked(prev => { const n = new Set(prev); if (n.has(slot)) n.delete(slot); else n.add(slot); return n; });

  // counts: the message (or typed) first; else what the ticks say
  const typedD = facts.disarmed === '' ? null : Number(facts.disarmed);
  const typedA = facts.armed === '' ? null : Number(facts.armed);
  const tickD = tickedCards.length || null;
  const tickA = tickD !== null && cards.length ? cards.length - tickD : null;
  const D = typedD !== null ? typedD : tickD;
  const A = typedA !== null ? typedA : tickA;
  const r = solveBluescreen({ error: facts.error, armed: A, disarmed: D, serial });

  // the module's name, when the ticks match the disarmed count
  const named = r.ok && tickedCards.length === r.disarmed ? tickedCards[r.position - 1] : null;
  const tickMismatch = cards.length > 0 && tickedCards.length > 0 && r.disarmed !== null && tickedCards.length !== r.disarmed;
  const where = r.ok ? (r.onlyOne ? 'the only disarmed module' : `the ${ordinal(r.position)} disarmed module`) : '';
  const answer = !r.ok ? '' : named ? moduleLabel(named) : r.onlyOne ? 'Only disarmed module' : `${ordinal(r.position)} disarmed`;

  useEffect(() => {
    const fresh = answerChanged(answer);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  const takeMessage = (text) => {
    setMessage(text);
    const p = parseCrashMessage(text);
    setFacts(prev => ({
      error: p.error !== null ? p.error : prev.error,
      disarmed: p.disarmed !== null ? String(p.disarmed) : prev.disarmed,
      armed: p.armed !== null ? String(p.armed) : prev.armed
    }));
    if (p.serial) setSerial(p.serial);
  };

  // the crash message pasted anywhere on the page (Ctrl+V, no text box) goes in its box. Any four
  // digits read as an error number, so a bare number needs the word "error" / "crash" with it.
  useAirText(isActive, (t) => {
    const p = parseCrashMessage(t);
    if (p.disarmed === null && p.armed === null && !(p.error && /error|crash/i.test(t))) return false;
    takeMessage(t);
    return true;
  });

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setLastImage(img, fileBlob);
    if (busy) return;
    setBusy(true);
    setStatus({ text: 'Looking for the error number…', ok: null });
    try {
      const res = await readBluescreenImage(img, (t) => setStatus({ text: t, ok: null }));
      if (res.error) setFacts(prev => ({ ...prev, error: res.error.slice(0, 4) }));
      setStatus(res.ok
        ? { text: `✓ Error ${res.error}${res.sure ? '' : ' — check it against the picture'}.${facts.disarmed === '' || facts.armed === '' ? ' Now the disarmed and armed counts: paste the crash message.' : ''}`, ok: res.sure }
        : { text: `⚠ ${res.reason}`, ok: false });
    } catch (e) {
      setStatus({ text: `⚠ ${e.message} — type the error number below.`, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const handleSample = () => { takeMessage(SAMPLE_MESSAGE); setStatus({ text: '', ok: null }); };
  const handleNextCrash = () => { setMessage(''); setFacts(emptyFacts()); setPreviewUri(''); setStatus({ text: '', ok: null }); };
  const handleClear = () => { handleNextCrash(); setTicked(new Set()); setLastImage(null, null); setLastCopyString(''); };

  const copyItems = [];
  if (answer) {
    copyItems.push({ label: `COPY (${answer})`, value: answer });
    if (named) copyItems.push({ label: `POWER CYCLE ${moduleLabel(named).toUpperCase()}`, value: `Power cycle ${moduleLabel(named)}` });
    copyItems.push({ label: `${where.toUpperCase()} (READING ORDER)`, value: `Power cycle ${where} (left to right, top to bottom, skip armed ones)` });
  }

  const placeholder = busy ? '📷 READING…'
    : r.noneDisarmed ? 'NO DISARMED MODULE? CHECK THE COUNTS'
    : r.missing.length ? `NEED: ${r.missing.join(', ').toUpperCase()}`
    : '— — —';
  const stats = r.ok
    ? `${r.count !== null ? `COUNT ${r.count} · ` : ''}${r.disarmed} DISARMED${named ? ` · CARD ${named.slot}` : ''}`
    : `${r.disarmed ?? '?'} DISARMED · ${r.armed ?? '?'} ARMED`;

  const factField = (k, label, placeholderValue) => (
    <label key={k} className="btn-fact">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        className="search-words-field"
        value={facts[k]}
        placeholder={placeholderValue}
        maxLength={k === 'error' ? 4 : 3}
        onChange={(e) => setFacts(prev => ({ ...prev, [k]: e.target.value.replace(/\D/g, '') }))}
      />
    </label>
  );

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone shareReading
              onImage={handleImage}
              icon=":( 8136"
              title="Click here, then paste the crashed Bluescreen picture"
              sub={<>reads the <b>error number</b> — the crash message gives the counts</>}
            />
          }
          preview={
            previewUri ? (
              <div className="preview-row show">
                <img src={previewUri} alt="bluescreen picture" />
                <span>{facts.error ? `Error ${facts.error}` : 'Bluescreen picture'}</span>
                <button type="button" className="preview-clear-btn" onClick={() => setPreviewUri('')}>✕</button>
              </div>
            ) : null
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear} data-card-clear title="Clear everything, the ticked modules too">clear</button>
              <button className="reset-btn" type="button" style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }} onClick={handleSample}>⚡ SAMPLE</button>
              <button className="reset-btn" type="button" onClick={handleNextCrash} title="Keep the ticked modules, clear the error and counts">↻ next crash</button>
            </>
          }
        >
          {status.text && <div className={`module-hint ${status.ok === false ? 'bad' : status.ok ? 'ok' : ''}`}>{status.text}</div>}
          <div className="btn-config">
            <div className="search-config-row">
              <label className="search-config-label" htmlFor={`${uid}-msg`} style={{ margin: 0 }}>CRASH MESSAGE (paste it as-is):</label>
              <textarea
                id={`${uid}-msg`}
                className="search-words-field bsod-msg"
                spellCheck={false}
                placeholder={'The screen crashed with error 8136.\nAt the crash: 1 disarmed and 7 armed modules …'}
                value={message}
                onChange={(e) => takeMessage(e.target.value)}
              />
            </div>
            <div className="btn-facts bsod-facts">
              <label className="btn-fact btn-fact-serial">
                <span>SERIAL (all bombs)</span>
                <input type="text" className="search-words-field" value={serial} placeholder="E1ZQGHV1" spellCheck="false" autoComplete="off" onChange={(e) => setSerial(e.target.value)} />
              </label>
              {factField('error', 'ERROR NUMBER', '8136')}
              {factField('disarmed', 'DISARMED', tickD !== null ? String(tickD) : '—')}
              {factField('armed', 'ARMED', tickA !== null ? String(tickA) : '—')}
            </div>
            {cards.length > 0 && (
              <div className="search-config-row">
                <div className="btn-config-head">
                  <span className="search-config-label" style={{ margin: 0 }}>DISARMED AT THE CRASH — TAP THEM (BOARD ORDER):</span>
                  <span className={`maze-status-tag ${tickMismatch ? 'warn' : ''}`}>
                    {tickedCards.length} ticked{tickMismatch ? ` · ⚠ the counts say ${r.disarmed}` : ''}
                  </span>
                </div>
                <div className="bsod-cards">
                  {cards.map(c => (
                    <button
                      key={c.slot}
                      type="button"
                      className={`lvlgen-chip bsod-card ${ticked.has(c.slot) ? 'on' : ''} ${named && named.slot === c.slot ? 'hit' : ''}`}
                      aria-pressed={ticked.has(c.slot)}
                      title={`Card ${c.slot} on the board`}
                      onClick={() => toggle(c.slot)}
                    >
                      {ticked.has(c.slot) ? '✓ ' : ''}{moduleLabel(c)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="POWER CYCLE"
          stats={stats}
          answers={answer ? [named ? `🔌 ${moduleLabel(named)}` : `🔌 ${where.replace(/^the /, '').toUpperCase()}`] : []}
          copyValue={answer}
          placeholder={placeholder}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel title="WORKING — every true rule, top to bottom, then count the disarmed modules">
          <BluescreenWorking r={r} named={named} where={where} hasCards={cards.length > 0} />
        </WorkingPanel>
      }
    />
  );
}

function BluescreenWorking({ r, named, where, hasCards }) {
  let running = 0;
  return (
    <div className="bsod-working">
      <ol className="btn-rules">
        {r.steps.map((s, i) => {
          if (s.applies && s.delta !== null) running += s.delta;
          const sign = s.delta === null ? '' : s.delta >= 0 && !s.start ? `+${s.delta}` : String(s.delta);
          return (
            <li key={i} className={`btn-rule ${s.applies === true ? 'hit' : s.applies === false ? 'no' : 'block'}`}>
              <span className="btn-rule-n">{s.start ? '=' : i}</span>
              <span className="bsod-step">{s.text}</span>
              <span className="btn-rule-time">{s.applies === false ? '—' : sign}</span>
              <span className={`btn-rule-status ${s.applies === true ? 'match' : s.applies === null ? 'unknown' : ''}`}>
                {s.applies === true ? (r.total !== null ? running : '✓') : s.applies === false ? '✗' : '?'}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="bsod-note">
        {r.onlyOne
          ? 'Only one disarmed module: whatever the total, the count lands on it.'
          : r.total === null ? 'The total needs every fact above.'
          : <>
              Total <b>{r.total}</b>
              {r.wraps ? <> ≤ 0 → + {r.disarmed} × {r.wraps} = <b>{r.count}</b></> : null}
              {r.ok ? <> → count {r.count} disarmed module{r.count === 1 ? '' : 's'}, wrapping after the {ordinal(r.disarmed)} → <b>{where}</b></> : null}
            </>}
        {named ? <> = <b>{moduleLabel(named)}</b> (card {named.slot} on the board).</> : null}
        {!hasCards && r.ok && !r.onlyOne
          ? ' The Defuser counts the disarmed modules left → right, top → bottom, skipping armed ones. (Start the level from the board picture to have it named here.)'
          : null}
      </div>
    </div>
  );
}

export const bluescreenModule = {
  id: 'bluescreen',
  tabId: 'tabBluescreen',
  tabLabel: '💻 BLUESCREEN',
  eyebrow: 'NEEDY · BLUESCREEN',
  title: 'Bluescreen',
  sub: 'When the screen crashes: paste the bot\'s crash message (the error number and the disarmed / armed counts) or the crash picture. With the serial in the top bar it applies the rules and says <b>which disarmed module to power cycle</b>, within 60 seconds. In a level, tap the disarmed modules to get its name.',
  Component: BluescreenModule
};
