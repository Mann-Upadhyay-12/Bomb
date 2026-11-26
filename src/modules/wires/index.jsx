import React, { useState, useEffect, useId } from 'react';
import { WIRE_COLORS, WIRE_SWATCH, SAMPLE_MANUAL, parseWiresManual, solveWires } from './wiresSolver.js';
import { readWiresImage } from './wiresVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { useBombSerial } from '../../core/bombSerial.js';
import { manualBoxPaste } from '../../core/airPaste.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';

export const WIRES_MANUAL_KEY = 'bombvision_wires_manual';
const KEY = WIRES_MANUAL_KEY;
const ordinal = (n) => ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][n] || `${n}th`;

export function WiresModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  const uid = useId();
  // a card of the multiple page: the manual is the 📖 bar above the cards (pasted once for all)
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);
  const [manual, setManual] = useSharedSetting(KEY, '');
  const [serial, setSerial] = useBombSerial();
  const [wires, setWires] = useState([]);
  const [status, setStatus] = useState({ text: '', ok: null });
  const [previewUri, setPreviewUri] = useState('');

  const parsed = parseWiresManual(manual);
  const counts = [3, 4, 5, 6].filter(n => parsed.sections[n] && parsed.sections[n].length);
  const r = solveWires(parsed, wires, serial);
  const cutIdx = r.cut;
  const answer = cutIdx >= 0 ? `Cut wire ${cutIdx + 1} (${wires[cutIdx]})` : '';

  useEffect(() => {
    const fresh = answerChanged(answer);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setLastImage(img, fileBlob);
    const res = readWiresImage(img);
    if (!res.wires) { setStatus({ text: `⚠ ${res.reason}`, ok: false }); return; }
    setWires(res.wires.map(w => w || 'black'));
    setStatus(res.sure
      ? { text: `✓ ${res.wires.length} wires: ${res.wires.join(', ')}`, ok: true }
      : { text: `⚠ ${res.wires.length} wires: ${res.wires.map(w => w || '?').join(', ')} — check the colours against the picture.`, ok: false });
  };

  const setAt = (i, col) => setWires(prev => prev.map((w, j) => (j === i ? col : w)));
  const addWire = (col) => setWires(prev => (prev.length < 6 ? [...prev, col] : prev));
  const removeAt = (i) => setWires(prev => prev.filter((_, j) => j !== i));
  const handleClear = () => { setWires([]); setPreviewUri(''); setStatus({ text: '', ok: null }); setLastImage(null, null); setLastCopyString(''); };
  const handleSample = () => { setManual(SAMPLE_MANUAL); setWires(['yellow', 'black', 'blue', 'red', 'black', 'white']); setStatus({ text: '', ok: null }); };

  // what is still needed to decide
  const blockedBy = r.blocked ? r.blocked.clauses.filter((c, i) => r.rows.find(x => x.rule === r.blocked).vals[i] === null) : [];
  const placeholder = !manual.trim() ? 'PASTE THE WIRES MANUAL'
    : !wires.length ? 'PASTE THE WIRES PICTURE'
    : wires.length < 3 ? 'ADD THE WIRES (3–6)'
    : !r.section ? `NO ${wires.length}-WIRE SECTION IN THE MANUAL`
    : r.blocked ? (blockedBy.some(c => c.serial) ? 'NEED: SERIAL' : `RULE ${r.blocked.n} UNCLEAR — CHECK IT BELOW`)
    : r.match && !r.match.cut ? `RULE ${r.match.n}: CUT NOT UNDERSTOOD`
    : r.match ? 'THAT WIRE ISN\'T THERE — CHECK THE COLOURS'
    : 'NO RULE MATCHED';

  const copyItems = answer ? [
    { label: `COPY (${answer})`, value: answer },
    { label: `JUST THE NUMBER (${cutIdx + 1})`, value: String(cutIdx + 1) }
  ] : [];

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={<Dropzone onImage={handleImage} icon="〰 〰 〰" title="Click here, then paste the Wires picture" sub={<>reads every wire's <b>colour</b>, left → right</>} />}
          preview={previewUri ? (
            <div className="preview-row show">
              <img src={previewUri} alt="wires picture" />
              <span>{wires.length ? `${wires.length} wires` : 'Wires picture'}</span>
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
                  : <label className="search-config-label" htmlFor={`${uid}-man`} style={{ margin: 0 }}>HELPER MANUAL (paste as-is — the 3, 4, 5 and 6 wire lists):</label>}
                <span className={`maze-status-tag ${parsed.unclear.length ? 'warn' : ''}`}>
                  {counts.length ? counts.map(n => `${n}w ×${parsed.sections[n].length}`).join(' · ') : 'no rules yet'}{parsed.unclear.length ? ` · ⚠ ${parsed.unclear.length} unclear` : ''}
                </span>
              </div>
              {!grouped && (
              <textarea id={`${uid}-man`} className="search-words-field manual-text" spellCheck={false}
                placeholder={'3 wires:\nIf there are no yellow wires, cut the second wire.\nOtherwise, cut the last wire.\n\n4 wires:\n…'}
                value={manual} onChange={(e) => setManual(e.target.value)} onPaste={manualBoxPaste()} />
              )}
            </div>
            <div className="btn-facts wires-facts">
              <label className="btn-fact btn-fact-serial">
                <span>SERIAL (all bombs)</span>
                <input type="text" className="search-words-field" value={serial} placeholder="E1ZQGHV1" spellCheck="false" autoComplete="off" onChange={(e) => setSerial(e.target.value)} />
              </label>
            </div>
            <div className="search-config-row">
              <span className="search-config-label" style={{ margin: 0 }}>WIRES LEFT → RIGHT ({wires.length}) — tap a colour to change it:</span>
              <div className="wires-row">
                {wires.map((w, i) => (
                  <div key={i} className={`wires-wire ${i === cutIdx ? 'cut' : ''}`}>
                    <span className="wires-n">{i + 1}</span>
                    <span className="wires-line" style={{ '--wc': WIRE_SWATCH[w] }} />
                    <select aria-label={`Wire ${i + 1} colour`} value={w} onChange={(e) => setAt(i, e.target.value)}>
                      {WIRE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button type="button" className="wires-x" title="Remove this wire" onClick={() => removeAt(i)}>✕</button>
                  </div>
                ))}
              </div>
              {wires.length < 6 && (
                <div className="btn-swatches">
                  <span className="search-config-label" style={{ margin: 0 }}>ADD:</span>
                  {WIRE_COLORS.map(c => (
                    <button key={c} type="button" className="btn-swatch" style={{ '--sw': WIRE_SWATCH[c] }} onClick={() => addWire(c)}>{c}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="CUT"
          stats={r.match ? `${wires.length} WIRES · RULE ${r.match.n}` : `${wires.length} WIRES`}
          answers={answer ? [`✂ ${ordinal(cutIdx + 1)} WIRE (${wires[cutIdx].toUpperCase()})`] : []}
          copyValue={answer}
          placeholder={placeholder}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={r.section ? (
        <WorkingPanel title={`${wires.length}-WIRE RULES — the first one that matches wins`}>
          <RuleRows rows={r.rows} match={r.match} blocked={r.blocked} />
          {parsed.unclear.length > 0 && <div className="bsod-note">Not understood: {parsed.unclear.map((l, i) => <div key={i}>• {l}</div>)}</div>}
        </WorkingPanel>
      ) : null}
    />
  );
}

/** The section's rules with each clause green (true), struck (false) or dashed (unknown). */
export function RuleRows({ rows, match, blocked }) {
  return (
    <ol className="btn-rules">
      {rows.map(({ rule, vals, result }) => (
        <li key={rule.n} className={`btn-rule ${rule === match ? 'hit' : rule === blocked ? 'block' : result === false || match ? 'no' : ''}`}>
          <span className="btn-rule-n">{rule.n}</span>
          <span className="btn-rule-clauses">
            {rule.clauses.map((c, i) => (
              <span key={i} className={`btn-clause ${c.unknown ? 'unk' : vals[i] === true ? 't' : vals[i] === false ? 'f' : 'q'}`}>{c.desc}</span>
            ))}
          </span>
          <span className="btn-rule-time">{rule.cut ? rule.cut.desc : '?'}</span>
          <span className={`btn-rule-status ${rule === match ? 'match' : result === null ? 'unknown' : ''}`}>{rule === match ? '✓' : result === false ? '✗' : '?'}</span>
        </li>
      ))}
    </ol>
  );
}

export const wiresModule = {
  id: 'wires',
  tabId: 'tabWires',
  tabLabel: '🧵 WIRES',
  eyebrow: 'WIRES SOLVER',
  title: 'Wires Vision',
  sub: 'Paste the Helper manual once (its 3, 4, 5 and 6 wire lists), then the Wires picture. Reads every wire\'s colour, takes the <b>first rule that matches</b> for that many wires and says <b>which one wire to cut</b>.',
  Component: WiresModule
};
