import React, { useState, useId, useMemo } from 'react';
import { preWarmOCR } from '../search/searchOCR.js';
import { readLaundryPicture } from './laundryOCR.js';
import { solveLaundry, pressesFor, parseLaundryText, parseLaundryManual, describeFormula, CONTROLS, TABLES, SAMPLE_MANUAL_TEXT } from './laundrySolver.js';
import { useSharedState } from '../../core/sharedSetting.js';
import { SPRITE, SPRITE_CELL } from './laundrySprite.js';
import { useBombSerial } from '../../core/bombSerial.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { Dropzone, ManualPasteBox } from '../../core/Dropzone.jsx';
import { manualBoxPaste } from '../../core/airPaste.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { useCardState } from '../../core/room/useCardState.js';

const COUNT_FIELDS = [['remaining', 'REMAINING'], ['solved', 'SOLVED'], ['needy', 'NEEDY'], ['total', 'TOTAL']];
const EMPTY = { remaining: '', solved: '', needy: '', total: '' };
const SAMPLE_TEXT = 'Load 1. Set wash, dry, iron and special care using the helper manual.\nCaptured counts: 7 remaining, 0 solved, 1 needy, 8 total. Serial: LROOXIWG.\nCheck in 50 seconds.';

/** One care symbol, cut from the helper's sheet. */
function CareSymbol({ control, name, size = 40 }) {
  const row = CONTROLS.findIndex(c => c[0] === control);
  const col = row >= 0 ? CONTROLS[row][2].indexOf(name) : -1;
  if (col < 0) return <span className="ld-sym ld-sym-none" style={{ width: size, height: size }}>?</span>;
  const k = size / SPRITE_CELL;
  return (
    <span className="ld-sym" title={name} style={{
      width: size, height: size, backgroundImage: `url(${SPRITE})`,
      backgroundSize: `${12 * SPRITE_CELL * k}px ${4 * SPRITE_CELL * k}px`,
      backgroundPosition: `-${col * size}px -${row * size}px`
    }} />
  );
}

/** What was read from the manual, one line, with what is missing or borrowed. */
function ManualSummary({ manual, borrowed }) {
  const f = TABLES.filter(k => manual.formulas[k]);
  if (!f.length && !Object.keys(manual.tables).length && !manual.care.length) return null;
  const rows = TABLES.map(k => `${k} ${manual.tables[k] ? manual.tables[k].length : 0}`).join(' · ');
  return (
    <div className="ld-manual-sum">
      {manual.load ? <span className="ld-tag">LOAD {manual.load}</span> : null}
      {TABLES.map(k => (
        <span key={k} className={`ld-tag ${manual.formulas[k] && !manual.formulas[k].unknown ? 'ok' : 'bad'}`}>{describeFormula(k, manual.formulas[k])}</span>
      ))}
      <span className="ld-tag">rows: {rows}</span>
      <span className={`ld-tag ${manual.care.some(r => r.when.kind === 'unknown') ? 'bad' : ''}`}>{manual.overrides.length} exceptions · {manual.care.length} care rules</span>
      {borrowed && borrowed.length > 0 && <span className="ld-tag warn">not in the pasted manual, so the usual {borrowed.join(', ')} (the same in both manuals seen so far)</span>}
      {manual.unread.length > 0 && <span className="ld-tag warn" title={manual.unread.join('\n')}>{manual.unread.length} line{manual.unread.length === 1 ? '' : 's'} not understood</span>}
    </div>
  );
}

export function LaundryModule({ isActive = true }) {
  React.useEffect(() => { preWarmOCR(); }, []);
  const uid = useId();
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  const [serial, setSerial] = useBombSerial();

  // this game's manual (its formulas change every game): in memory, shared by every Laundry card
  const [manualText, setManualText] = useSharedState('laundry_manual', '');
  // the manual's text box: open while there is no manual (to paste it), folded once it's loaded
  const [editManual, setEditManual] = useState(false);
  const showManual = !manualText.trim() || editManual;
  const manual = useMemo(() => parseLaundryManual(manualText), [manualText]);
  // in a room, the load's counts, number and message are the room's (core/room/useCardState.js)
  const [counts, setCounts] = useCardState('counts', EMPTY);
  const [load, setLoad] = useCardState('load', null);
  const [botText, setBotText] = useCardState('botText', '');
  const [current, setCurrent] = useState(null); // symbols the tiles show now (from a picture)
  const [unsure, setUnsure] = useState([]);
  const [status, setStatus] = useState({ text: '', ok: null });
  const [busy, setBusy] = useState(false);
  const [thumb, setThumb] = useState('');
  const [checkAt, setCheckAt] = useCardState('checkAt', null);
  const [now, setNow] = useState(() => Date.now());

  React.useEffect(() => {
    if (!checkAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [checkAt]);

  const res = solveLaundry(manual, counts, serial);
  // presses from what the tiles show; without a picture, from the first symbols. Load 1 always starts
  // there (30°C, High heat, 150°C, Bleach) and a press steps to the next symbol in the sheet's order —
  // both confirmed by players (Discord walkthrough, 40°C / Low heat / Iron / Non-chlorine bleach = 1, 4, 2, 11 presses)
  const start = { wash: CONTROLS[0][2][0], dry: CONTROLS[1][2][0], iron: CONTROLS[2][2][0], care: CONTROLS[3][2][0] };
  const startKnown = Boolean(current) || load === 1;
  const from = current || start;
  const presses = res.ready ? pressesFor(res.set, from) : null;
  const pressNote = (k) => (presses && presses[k] ? ` ↻${presses[k]}` : '');
  const answer = res.ready
    ? CONTROLS.map(([k, label]) => `${label === 'Special care' ? 'Care' : label} ${res.set[k]}${startKnown ? pressNote(k) : ''}`).join(' · ')
    : '';

  React.useEffect(() => {
    const fresh = answerChanged(answer); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  const takeFacts = (f, from) => {
    const next = {};
    for (const [k] of COUNT_FIELDS) if (f[k] != null) next[k] = String(f[k]);
    if (Object.keys(next).length) setCounts(c => ({ ...c, ...next }));
    if (f.serial) setSerial(f.serial);
    if (f.load != null) setLoad(f.load);
    if (f.checkIn != null) setCheckAt(Date.now() + f.checkIn * 1000);
    const got = Object.keys(next).length + (f.serial ? 1 : 0);
    return got ? `${from}: ${COUNT_FIELDS.filter(([k]) => next[k] != null).map(([k]) => `${next[k]} ${k}`).join(', ')}${f.serial ? ` · serial ${f.serial}` : ''}` : '';
  };

  const handleText = (text) => {
    setBotText(text);
    const f = parseLaundryText(text);
    const msg = takeFacts(f, '✓ Message');
    setStatus(msg ? { text: msg, ok: true } : { text: text.trim() ? 'No counts found in that text yet.' : '', ok: text.trim() ? false : null });
  };

  // A manual picture with the formulas starts the manual over (page 1 / a new game); one without
  // them (page 2) is added to what is there.
  const addManualText = (text, hasFormulas) => setManualText(prev => (hasFormulas || !prev.trim() ? text : `${prev.trim()}\n\n${text}`));

  const readPictures = async (items) => {
    setBusy(true);
    const notes = [];
    let bad = false;
    const manuals = [];
    for (const { img, uri, blob } of items) {
      try {
        const r = await readLaundryPicture(img, (t) => setStatus({ text: t, ok: null }));
        if (!r.ok) { notes.push(`⚠ ${r.reason || 'Not a Laundry picture.'}`); bad = true; continue; }
        if (r.type === 'manual') { manuals.push(r); continue; }
        if (r.type === 'message') { const f = takeFacts(r.facts, '✓ Message'); notes.push(f || '⚠ No counts found in that picture'); if (!f) bad = true; continue; }
        setLastImage(img, blob);
        setThumb(uri || '');
        setCurrent(r.symbols.current);
        setUnsure(r.symbols.sure ? [] : Object.entries(r.symbols.scores || {}).filter(([, v]) => v.score < 0.6 || v.margin < 0.04).map(([k]) => k));
        const sym = CONTROLS.map(([k]) => r.symbols.current[k] || '?').join(' / ');
        const facts = r.facts ? takeFacts(r.facts, 'message') : '';
        notes.push(`✓ Module shows ${sym}${facts ? ` · ${facts}` : r.text ? ' · counts not found in the text — type them' : ''}`);
        if (!r.symbols.sure) bad = true;
      } catch (e) {
        notes.push(`⚠ ${e.message || 'Could not read that picture.'}`);
        bad = true;
      }
    }
    // page 1 (formulas) before page 2, whatever order they came in
    manuals.sort((a, b) => Object.keys(b.manual.formulas).length - Object.keys(a.manual.formulas).length);
    manuals.forEach((m, i) => addManualText(m.text, i === 0 && Object.keys(m.manual.formulas).length > 0));
    if (manuals.length) notes.push(`✓ Manual text read from ${manuals.length === 1 ? 'the picture' : `${manuals.length} pictures`} — check it below`);
    setBusy(false);
    setStatus({ text: notes.join('  ·  '), ok: !bad });
  };

  const handleImage = (img, dataUri, blob) => readPictures([{ img, uri: dataUri, blob }]);
  const handleFiles = async (files) => {
    const items = [];
    for (const f of Array.from(files).filter(f => f && (!f.type || f.type.startsWith('image/')))) {
      const uri = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = uri; });
      items.push({ img, uri, blob: f });
    }
    readPictures(items);
  };

  const nextLoad = () => {
    setCounts(EMPTY);
    setLoad(l => (l ? l + 1 : null));
    setBotText('');
    // the module picture stays the same through a game's loads: keep the symbols read from it
    setCheckAt(null);
    setStatus({ text: 'Next load — paste its message (the manual, serial and module symbols stay).', ok: null });
    setLastImage(null, null);
    setLastCopyString('');
  };
  const handleClear = () => {
    setCounts(EMPTY); setLoad(null); setBotText(''); setCurrent(null); setUnsure([]); setThumb(''); setCheckAt(null);
    setStatus({ text: '', ok: null });
    setLastImage(null, null);
    setLastCopyString('');
  };
  const handleSample = () => { setManualText(SAMPLE_MANUAL_TEXT); setCurrent(null); setUnsure([]); handleText(SAMPLE_TEXT); };
  const clearManual = () => { setManualText(''); setStatus({ text: 'Manual cleared — paste the new game\'s manual.', ok: null }); };

  const left = checkAt ? Math.max(0, Math.ceil((checkAt - now) / 1000)) : null;
  const answers = res.ready ? CONTROLS.map(([k, label]) => `${label}: ${res.set[k]}${pressNote(k)}`) : [];
  const placeholder = busy ? '📷 READING…'
    : res.missing && res.missing.includes('manual') ? "PASTE THIS GAME'S LAUNDRY MANUAL"
    : res.missing && res.missing.length ? `NEED ${res.missing.map(m => m.toUpperCase()).join(', ')}`
    : res.reason ? res.reason.toUpperCase() : '— — —';
  const haveFormulas = Object.keys(manual.formulas).length > 0;
  const loadMismatch = manual.load && load && manual.load !== load;
  const stats = res.ready ? `${res.item.name.toUpperCase()} · ${res.material.name.toUpperCase()} · ${res.color.name.toUpperCase()}${load ? ` · LOAD ${load}` : ''}` : 'ITEM · MATERIAL · COLOR';

  const copyItems = [];
  if (answer) copyItems.push({ label: 'COPY ALL FOUR', value: answer });

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              onFiles={handleFiles}
              multiple
              icon={busy ? '⏳' : '🧺 30° ⊡ ▵'}
              title="Click here, then paste the manual (once per game) and the module picture"
              sub={<>pictures of the <b>manual</b> (both pages at once is fine), the <b>module</b>, or a screenshot of the whole <b>message</b> · text goes in the boxes below</>}
            />
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear} data-card-clear>clear</button>
              <button className="reset-btn" type="button" style={{ borderColor: 'var(--brass)', color: 'var(--brass)', fontWeight: 600 }} onClick={nextLoad} title="Keep the serial, clear the counts for the next load">↻ next load</button>
              <button className="reset-btn" type="button" onClick={clearManual} disabled={!manualText} title="New game: forget this game's manual">clear manual</button>
              <button className="reset-btn" type="button" style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }} onClick={handleSample}>⚡ SAMPLE</button>
            </>
          }
        >
          {status.text && <div className={`module-hint ${status.ok === false ? 'bad' : status.ok ? 'ok' : ''}`}>{status.text}</div>}
          <div className="ld-config">
            <div className={`mgroup-manual-bar ${showManual ? 'open' : ''}`}>
              <div className="mgroup-manual-line">
                <span className="mgroup-manual-name">📖 MANUAL</span>
                <span className={`mgroup-manual-status ${manualText.trim() ? 'on' : 'off'}`}>{manualText.trim() ? 'LOADED ✓' : 'NOT LOADED'}</span>
                <span className="mgroup-manual-tip">once per game — its formulas change every game; paste its text or pictures (Ctrl+V)</span>
                {manualText.trim() && <button type="button" className="mgroup-manual-debug" onClick={() => setEditManual(o => !o)}>{showManual ? 'hide' : 'edit'}</button>}
              </div>
            </div>
            <ManualPasteBox what="Laundry manual page" />
            {showManual && (
            <textarea
              id={`${uid}-man`}
              className="search-words-field ld-msg ld-manual"
              spellCheck={false}
              placeholder={"Paste the Laundry manual's text here, or paste pictures of it above.\nItem = remaining + 3\nMaterial = solved + needy + 5\nColor = last serial digit + total + 3 (no digit: use 0)\n…"}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              onPaste={manualBoxPaste()}
            />
            )}
            <ManualSummary manual={manual} borrowed={res.ready ? res.borrowed : []} />
            {loadMismatch && <div className="module-hint">The manual is for load {manual.load}, the message is load {load} — if this load's manual is different, paste it.</div>}
            <label className="search-config-label" htmlFor={`${uid}-msg`}>BOT MESSAGE (each load, paste as-is):</label>
            <textarea
              id={`${uid}-msg`}
              className="search-words-field ld-msg"
              spellCheck={false}
              placeholder={'Load 1. Set wash, dry, iron and special care using the helper manual.\nCaptured counts: 7 remaining, 0 solved, 1 needy, 8 total. Serial: LROOXIWG.'}
              value={botText}
              onChange={(e) => handleText(e.target.value)}
            />
            <div className="ld-facts">
              {COUNT_FIELDS.map(([k, lbl]) => (
                <label key={k} className="btn-fact">
                  <span>{lbl}</span>
                  <input type="number" min="0" inputMode="numeric" className="search-words-field" value={counts[k]} placeholder="—"
                    onChange={(e) => setCounts(c => ({ ...c, [k]: e.target.value }))} />
                </label>
              ))}
              <label className="btn-fact btn-fact-serial">
                <span>SERIAL (all bombs)</span>
                <input type="text" className="search-words-field" value={serial} placeholder="LROOXIWG" spellCheck="false" autoComplete="off" onChange={(e) => setSerial(e.target.value)} />
              </label>
              {thumb && <img className="bat-thumb" src={thumb} alt="module" />}
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <>
          <AnswerPanel label={load ? `SET — LOAD ${load}` : 'SET'} stats={stats} answers={answers} copyValue={answer} placeholder={placeholder} />
          {res.ready && (
            <div className="ld-grid">
              {CONTROLS.map(([k, label]) => (
                <div key={k} className="ld-card">
                  <div className="ld-card-head">{label.toUpperCase()}</div>
                  <div className="ld-card-row">
                    <CareSymbol control={k} name={res.set[k]} size={48} />
                    <div className="ld-card-txt">
                      <b>{res.set[k]}</b>
                      <span className={`ld-press ${presses[k] ? '' : 'zero'}`}>
                        {presses[k] == null ? '' : presses[k] ? `press ${presses[k]}×` : 'already set'}
                        {!startKnown && presses[k] ? ' *' : ''}
                      </span>
                      <span className="ld-why">{res.why[k]}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {res.ready && (
            <div className="ld-note">
              {current
                ? <>Presses count from the symbols in the picture{unsure.length ? <> — <b>not sure about {unsure.join(', ')}</b>, check them below</> : ''}; each press steps to the next symbol in the sheet's order.</>
                : startKnown
                  ? <>Load 1 always starts on 30°C, High heat, 150°C, Bleach; each press steps to the next symbol in the sheet's order.</>
                  : <>* Presses count from 30°C, High heat, 150°C, Bleach (how load 1 starts); each press steps to the next symbol in the sheet's order. Paste the module picture to count from what it shows now.</>}
              {left != null && <div className="ld-check">⏱ Next check in <b>{left}s</b>{left === 0 ? ' — it is checking now' : ''}</div>}
            </div>
          )}
        </>
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel title="HOW THE LOAD WAS FOUND · the tiles' current symbols" defaultExpanded={false}>
          {res.ready ? (
            <div className="ld-work">
              {TABLES.map(k => (
                <div key={k}><b>{k[0].toUpperCase() + k.slice(1)}</b> = {res.why[k]} → <b>{res[k].name}</b>{manual.tables[k] ? <span className="ld-dim"> ({manual.tables[k].map(x => x.name).join(', ')})</span> : null}</div>
              ))}
              <div className="ld-dim">numbers past {res.modulus - 1} lose {res.modulus} until they are 0–{res.modulus - 1} · 0 = first in the list</div>
            </div>
          ) : <div className="simon-status">{!haveFormulas ? "Paste this game's manual, then the bot message (or type the counts and the serial)." : 'Paste the bot message (or type the counts and the serial).'}</div>}
          <div className="ld-current">
            <span className="search-config-label">TILES SHOW NOW:</span>
            {CONTROLS.map(([k, label, list]) => (
              <label key={k} className={`ld-cur ${unsure.includes(k) ? 'unsure' : ''}`}>
                <CareSymbol control={k} name={from[k]} size={28} />
                <select value={from[k]} onChange={(e) => { setCurrent({ ...from, [k]: e.target.value }); setUnsure(u => u.filter(x => x !== k)); }} title={`${label}: the symbol the tile shows now`}>
                  {list.map(n => <option key={n}>{n}</option>)}
                </select>
              </label>
            ))}
          </div>
        </WorkingPanel>
      }
    />
  );
}

export const laundryModule = {
  id: 'laundry',
  tabId: 'tabLaundry',
  tabLabel: '🧺 LAUNDRY',
  eyebrow: 'CARE LABEL SOLVER',
  title: 'Laundry Vision',
  sub: "Paste this game's <b>manual</b> once (text or pictures — its formulas change every game), then the bot message for each <b>load</b> (text, or a screenshot). The captured counts and the serial give the <b>item</b>, <b>material</b> and <b>color</b>, and from them the <b>Wash</b>, <b>Dry</b>, <b>Iron</b> and <b>Special care</b> settings, with how many presses each button needs.",
  Component: LaundryModule
};
