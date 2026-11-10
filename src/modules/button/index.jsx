import React, { useState, useEffect, useId, useRef } from 'react';
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
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { ButtonWorking, COLOR_SWATCH } from './working.jsx';

const KEY = 'bombvision_button_checklist';
const FACT_KEYS = ['total', 'nonNeedy', 'needy', 'buttonMods'];
const emptyFacts = () => ({ serial: '', total: '', nonNeedy: '', needy: '', buttonMods: '' });

export function ButtonModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const uid = useId(); // per-instance ids: missions show several Button windows

  const [checklist, setChecklist] = useState(() => {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  });
  const [facts, setFacts] = useState(() => {
    const f = emptyFacts();
    const parsed = parseChecklist((() => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } })()).facts;
    if (parsed.serial) f.serial = parsed.serial;
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
    serial: facts.serial.trim().toUpperCase(),
    total, nonNeedy, needy,
    buttonMods: num(facts.buttonMods)
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
      else if (c.kind === 'serial') missing.push('serial');
      else if (c.kind === 'count') missing.push(FACT_LABELS[c.fact]);
    });
  }
  const missingText = Array.from(new Set(missing)).join(', ');

  const answer = match ? `${match.seconds}s` : '';

  useEffect(() => {
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && answer && color && label) copy(answer);
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
    setFacts(prev => {
      const next = { ...prev };
      if (pf.serial) next.serial = pf.serial;
      FACT_KEYS.forEach(k => { if (Number.isFinite(pf[k])) next[k] = String(pf[k]); });
      return next;
    });
  };

  const handleChecklistChange = (text) => {
    setChecklist(text);
    try { localStorage.setItem(KEY, text); } catch (e) {}
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
    try { localStorage.setItem(KEY, SAMPLE_CHECKLIST); } catch (e) {}
    setFacts({ serial: 'E1ZQGHV1', total: '6', nonNeedy: '5', needy: '1', buttonMods: '3' });
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
    ? `RULE ${match.n}${stage ? ` · BUTTON ${stage.current}/${stage.total}` : ''} · ${color.toUpperCase() || '?'} / "${label || '?'}"`
    : `${rules.length} RULES${stage ? ` · BUTTON ${stage.current}/${stage.total}` : ''}`;

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
                <span>{stage ? `Button ${stage.current} of ${stage.total}` : 'Button screenshot'}</span>
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

            <div className="btn-facts">
              <label className="btn-fact btn-fact-serial">
                <span>SERIAL</span>
                <input
                  type="text"
                  className="search-words-field"
                  value={facts.serial}
                  placeholder={pastedFacts.serial || 'E1ZQGHV1'}
                  spellCheck="false"
                  autoComplete="off"
                  onChange={(e) => setFact('serial', e.target.value.toUpperCase())}
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
              {stage && <span className="maze-status-tag">BUTTON {stage.current} / {stage.total}</span>}
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label={`HOLD TIME${stage ? ` — BUTTON ${stage.current}/${stage.total}` : ''}`}
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
