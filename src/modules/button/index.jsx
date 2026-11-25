import React, { useState, useEffect, useId, useRef } from 'react';
import { preWarmOCR } from '../search/searchOCR.js';
import {
  BUTTON_COLORS,
  SAMPLE_CHECKLIST,
  FACT_LABELS,
  parseChecklist,
  evaluateRules,
  labelVocab
} from './buttonSolver.js';
import { readButtonImage } from './buttonVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting, useSharedState } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { useBombSerial } from '../../core/bombSerial.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { ButtonWorking, COLOR_SWATCH } from './working.jsx';

const KEY = 'bombvision_button_checklist';
const FACT_KEYS = ['total', 'nonNeedy', 'needy', 'buttonMods'];
const emptyFacts = () => ({ total: '', nonNeedy: '', needy: '', buttonMods: '' });

export function ButtonModule({ isActive = true }) {
  // start the OCR engine while the screenshot is being taken, so the first read doesn't wait for it
  React.useEffect(() => { preWarmOCR(); }, []);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  const uid = useId(); // per-instance ids: missions show several Button windows

  // The checklist and the bomb facts (module counts) are the same for every Button on the bomb,
  // so all Button windows share them. The serial is game-wide and lives in the top bar.
  const [checklist, setChecklistShared] = useSharedSetting(KEY, '');
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);
  const [serial, setSerial] = useBombSerial();
  const [facts, setFacts] = useSharedState('button-facts', () => {
    const f = emptyFacts();
    const parsed = parseChecklist((() => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } })()).facts;
    FACT_KEYS.forEach(k => { if (Number.isFinite(parsed[k])) f[k] = String(parsed[k]); });
    return f;
  });
  const [color, setColor] = useState('');
  const [label, setLabel] = useState('');
  const [stage, setStage] = useState(null);
  const [warn, setWarn] = useState({ color: false, label: false });
  const [status, setStatus] = useState({ text: '', ok: null });
  const [busy, setBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const [log, setLog] = useState([]);
  const lastLogged = useRef('');

  const { rules, facts: pastedFacts } = parseChecklist(checklist);
  const vocab = labelVocab(rules);
  const unknownRules = rules.filter(r => r.clauses.some(c => c.unknown));

  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  let total = num(facts.total);
  const nonNeedy = num(facts.nonNeedy), needy = num(facts.needy);
  // Total = non-needy + needy when only those two were given
  if (!Number.isFinite(total) && Number.isFinite(nonNeedy) && Number.isFinite(needy)) total = nonNeedy + needy;
  const ctx = {
    color, label,
    serial,
    total, nonNeedy, needy,
    buttonMods: num(facts.buttonMods),
    // which button of the module this is (dots in the screenshot, or typed) — "this is button 1 or 3"
    buttonNum: stage ? num(stage.current) : NaN,
    buttonTotal: stage ? num(stage.total) : NaN
  };
  const usesStage = rules.some(r => r.clauses.some(c => c.kind === 'stage'));
  const stageText = stage && Number.isFinite(ctx.buttonNum) ? `${stage.current}/${Number.isFinite(ctx.buttonTotal) ? stage.total : '?'}` : '';
  const setButtonNum = (v) => {
    const n = parseInt(v, 10);
    setStage(s => (Number.isFinite(n) && n > 0 ? { total: s ? s.total : NaN, done: n - 1, current: n } : null));
  };
  const { rows, match, blocked } = evaluateRules(rules, ctx);

  // Which inputs are still needed to decide the blocking rule
  const missing = [];
  if (blocked) {
    blocked.clauses.forEach((c, i) => {
      if (blocked.vals[i] !== null) return;
      if (c.unknown) missing.push(`rule ${blocked.n} wording ("${c.desc}")`);
      else if (c.kind === 'color') missing.push('button colour');
      else if (c.kind === 'label') missing.push('label');
      else if (c.kind === 'labelColor') missing.push(!ctx.label ? 'label' : 'button colour');
      else if (c.kind === 'stage') missing.push('which button (#)');
      else if (c.kind === 'serial') missing.push('serial');
      else if (c.kind === 'count') missing.push(FACT_LABELS[c.fact]);
    });
  }
  const missingText = Array.from(new Set(missing)).join(', ');

  const answer = match ? `${match.seconds}s` : '';

  useEffect(() => {
    const fresh = answerChanged(`${answer}|${match && match.n}|${color}|${label}`); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer && color && label) copy(answer);
  }, [answer, match && match.n, color, label, isActive]);

  // Keep a per-stage log of solved buttons
  useEffect(() => {
    if (!match || !color || !label) return;
    const key = `${stage ? stage.current : '-'}|${color}|${label}|${match.seconds}`;
    if (key === lastLogged.current) return;
    lastLogged.current = key;
    setLog(prev => {
      const st = stage ? stage.current : null;
      const rest = st ? prev.filter(e => e.stage !== st) : prev;
      return [...rest, { stage: st, color, label, seconds: match.seconds, rule: match.n }].slice(-6);
    });
  }, [match && match.n, color, label, stage && stage.current]);

  const applyPastedFacts = (text) => {
    const pf = parseChecklist(text).facts;
    if (pf.serial) setSerial(pf.serial);
    setFacts(prev => {
      const next = { ...prev };
      FACT_KEYS.forEach(k => { if (Number.isFinite(pf[k])) next[k] = String(pf[k]); });
      return next;
    });
  };

  // The manual is usually pasted on the page (one bar for every Button card), not typed here:
  // whenever it changes, take its "Serial: …" / module count lines into the bomb facts
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; } // the facts were read from it on load
    applyPastedFacts(checklist);
  }, [checklist]);

  const setChecklist = (text) => setChecklistShared(text);
  const handleChecklistChange = (text) => {
    setChecklist(text);
    applyPastedFacts(text);
  };

  const setFact = (k, v) => setFacts(prev => ({ ...prev, [k]: v }));

  const handleImage = async (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setLastImage(img, fileBlob);
    if (busy) { showToast('STILL READING THE LAST BUTTON — PASTE AGAIN IN A MOMENT'); return; }
    setBusy(true);
    setStatus({ text: 'Reading button…', ok: null });
    try {
      const r = await readButtonImage(img, vocab, (t) => setStatus({ text: t, ok: null }));
      if (!r.ok) { setStatus({ text: r.reason, ok: false }); return; }
      setColor(r.color);
      if (r.label) setLabel(r.label);
      setStage(r.stage);
      const colorUnsure = r.confidence < 0.45 || !BUTTON_COLORS.includes(r.color);
      setWarn({ color: colorUnsure, label: !r.labelSure });
      const parts = [`colour ${r.color.toUpperCase()}`];
      if (r.label) parts.push(`label ${r.label}${r.labelSure ? '' : ` (read "${r.labelRaw}" — check)`}`);
      else parts.push(r.ocrError ? `label unreadable (${r.ocrError})` : 'label not read — type it below');
      if (r.stage) parts.push(`button ${r.stage.current}/${r.stage.total}`);
      setStatus({ text: `✓ ${parts.join(' · ')}`, ok: !!r.label && !colorUnsure });
      showToast('BUTTON READ ✓');
    } catch (e) {
      setStatus({ text: 'Could not read that image — set colour and label below.', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const handleSample = () => {
    setChecklist(SAMPLE_CHECKLIST);
    setSerial('E1ZQGHV1');
    setFacts({ total: '6', nonNeedy: '5', needy: '1', buttonMods: '3' });
    setColor('green');
    setLabel('WHITE');
    setStage({ total: 3, current: 3, done: 2 });
    setWarn({ color: false, label: false });
    showToast('SAMPLE BUTTON LOADED ✓');
  };

  // New button (next stage): keep the checklist + bomb facts, clear the button itself
  const handleNextButton = () => {
    setColor('');
    setLabel('');
    setWarn({ color: false, label: false });
    setStage(s => (s ? { ...s, current: Math.min(s.total, s.current + 1), done: s.done + 1 } : s));
    setPreviewUri('');
    setStatus({ text: '', ok: null });
  };

  const handleClear = () => {
    handleNextButton();
    setStage(null);
    setFacts(emptyFacts());
    setLog([]);
    lastLogged.current = '';
    setLastImage(null, null);
    setLastCopyString('');
    showToast('BUTTON CLEARED ✓');
  };

  const copyItems = [];
  if (answer) {
    copyItems.push({ label: `COPY HOLD TIME (${answer})`, value: answer });
    copyItems.push({ label: `HOLD ${match.seconds} SECONDS`, value: `Hold ${match.seconds} seconds` });
  }
  if (log.length > 1) {
    const all = log.map(e => `${e.seconds}s`).join(' ');
    copyItems.push({ label: `ALL BUTTONS (${all})`, value: all });
  }

  const stampStats = match
    ? `RULE ${match.n}${stageText ? ` · BUTTON ${stageText}` : ''} · ${color.toUpperCase() || '?'} / "${label || '?'}"`
    : `${rules.length} RULES${stageText ? ` · BUTTON ${stageText}` : ''}`;

  const placeholder = !rules.length
    ? 'PASTE THE CHECKLIST'
    : busy ? '📷 READING…'
    : blocked ? `NEED: ${missingText.toUpperCase()}`
    : 'NO RULE MATCHED';

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🔘 ⏱️"
              title="Click here, then paste the Button screenshot"
              sub={<>reads the <b>physical colour</b>, the <b>label</b> and which button (dots) you are on</>}
            />
          }
          preview={
            previewUri ? (
              <div className="preview-row show">
                <img src={previewUri} alt="button screenshot" />
                <span>{stageText ? `Button ${stageText.replace('/', ' of ')}` : 'Button screenshot'}</span>
                <button type="button" className="preview-clear-btn" onClick={() => setPreviewUri('')}>✕</button>
              </div>
            ) : null
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear}>clear</button>
              <button
                className="reset-btn"
                type="button"
                style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }}
                onClick={handleSample}
              >
                ⚡ SAMPLE
              </button>
              <button className="reset-btn" type="button" onClick={handleNextButton} title="Keep checklist & bomb info, clear the button">
                ↻ next button
              </button>
            </>
          }
        >
          {status.text && (
            <div className={`module-hint ${status.ok === false ? 'bad' : status.ok ? 'ok' : ''}`}>{status.text}</div>
          )}

          <div className="btn-config">
            {!grouped && (
            <div className="search-config-row">
              <div className="btn-config-head">
                <label className="search-config-label" htmlFor={`${uid}-list`} style={{ margin: 0 }}>
                  HELPER CHECKLIST (paste as-is — with or without ** and 1. 2. 3.):
                </label>
                <span className={`maze-status-tag ${unknownRules.length ? 'warn' : ''}`}>
                  {rules.length} rules{unknownRules.length ? ` · ⚠ ${unknownRules.length} unclear` : ''}
                </span>
              </div>
              <textarea
                id={`${uid}-list`}
                className="search-words-field"
                style={{ height: '150px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace' }}
                spellCheck={false}
                placeholder={'button is white and label says Blue: 3s\nthere is exactly 1 needy module, button is blue, and label says Hold: 11s\n…\nOtherwise: 7s\n\nSerial: E1ZQGHV1'}
                value={checklist}
                onChange={(e) => handleChecklistChange(e.target.value)}
              />
            </div>
            )}

            <div className="btn-facts">
              <label className="btn-fact btn-fact-serial">
                <span>SERIAL (all bombs)</span>
                <input
                  type="text"
                  className="search-words-field"
                  value={serial}
                  placeholder={pastedFacts.serial || 'E1ZQGHV1'}
                  spellCheck="false"
                  autoComplete="off"
                  onChange={(e) => setSerial(e.target.value)}
                />
              </label>
              {[['total', 'TOTAL MODULES'], ['nonNeedy', 'NON-NEEDY'], ['needy', 'NEEDY'], ['buttonMods', 'BUTTON MODULES']].map(([k, lbl]) => (
                <label key={k} className="btn-fact">
                  <span>{lbl}</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className="search-words-field"
                    value={facts[k]}
                    placeholder={k === 'total' && Number.isFinite(total) && facts.total === '' ? String(total) : '—'}
                    onChange={(e) => setFact(k, e.target.value)}
                  />
                </label>
              ))}
            </div>

            <div className="btn-pick-row">
              <span className="search-config-label" style={{ margin: 0 }}>BUTTON COLOUR:</span>
              <div className="btn-swatches">
                {BUTTON_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`btn-swatch ${color === c ? 'on' : ''} ${color === c && warn.color ? 'warn' : ''}`}
                    style={{ '--sw': COLOR_SWATCH[c] }}
                    title={c}
                    aria-pressed={color === c}
                    onClick={() => { setColor(color === c ? '' : c); setWarn(w => ({ ...w, color: false })); }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="btn-pick-row">
              <label className="search-config-label" htmlFor={`${uid}-label`} style={{ margin: 0 }}>LABEL SAYS:</label>
              <input
                id={`${uid}-label`}
                list={`${uid}-vocab`}
                type="text"
                className={`search-words-field btn-label-input ${warn.label && label ? 'warn' : ''}`}
                value={label}
                placeholder="e.g. WHITE"
                spellCheck="false"
                autoComplete="off"
                onChange={(e) => { setLabel(e.target.value.toUpperCase()); setWarn(w => ({ ...w, label: false })); }}
              />
              <datalist id={`${uid}-vocab`}>
                {vocab.map(w => <option key={w} value={w} />)}
              </datalist>
              {(usesStage || stageText) && (
                <label className="btn-fact btn-fact-num" title="Which button of the module this is (the dots in the screenshot)">
                  <span>BUTTON #</span>
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    className={`search-words-field ${usesStage && !stageText ? 'warn' : ''}`}
                    value={stageText ? stage.current : ''}
                    placeholder="?"
                    onChange={(e) => setButtonNum(e.target.value)}
                  />
                  {stageText && Number.isFinite(ctx.buttonTotal) && <span>of {stage.total}</span>}
                </label>
              )}
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label={`HOLD TIME${stageText ? ` — BUTTON ${stageText}` : ''}`}
          stats={stampStats}
          answers={answer ? [`⏱️ ${answer}`] : []}
          copyValue={answer}
          placeholder={placeholder}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel title="CHECKLIST — first matching rule wins (counted from the top)">
          <ButtonWorking rows={rows} match={match} blocked={blocked} log={log} />
        </WorkingPanel>
      }
    />
  );
}

export const buttonModule = {
  id: 'button',
  tabId: 'tabButton',
  tabLabel: '🔘 THE BUTTON',
  eyebrow: 'THE BUTTON SOLVER',
  title: 'Button Vision',
  sub: 'Paste the helper checklist once, enter the serial and module counts, then paste each Button screenshot. Reads the <b>physical colour</b> and <b>label</b>, applies the first matching rule and copies the <b>hold time</b>.',
  Component: ButtonModule
};
