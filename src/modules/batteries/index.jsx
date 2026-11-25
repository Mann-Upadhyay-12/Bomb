import React, { useState } from 'react';
import { preWarmOCR } from '../search/searchOCR.js';
import { readBatteriesFile } from './batteriesOCR.js';
import {
  solveBatteries, parseCondition, describeCondition, oddVolts, digitsLabel, fmtVolts, kindLabel, cellKey, parseCell,
  BATTERY_KINDS, SAMPLE_TABLE, SAMPLE_BATTERIES, BOMB_START, fmtClock, showsDigits, timerWindows, describeWindows
} from './batteriesSolver.js';
import { KNOWN_MODULE_NAMES } from '../../core/sectionsData.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedState } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone, ManualPasteBox } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';

const KIND_ORDER = ['yellow', 'orange', 'red', 'blue', 'green', 'purple'];
const MODULE_NAMES = Object.keys(KNOWN_MODULE_NAMES).filter(n => KNOWN_MODULE_NAMES[n].id !== 'batteries').sort();
const CELL_OPTIONS = ['', 'any', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'first:blue', 'then:blue', 'first:orange', 'then:orange'];

function BatteryChip({ b, onRemove }) {
  const k = BATTERY_KINDS[b.color];
  return (
    <span className={`bat-chip bat-${b.color}`} title={`${kindLabel(b.color)} · ${b.round ? 'round' : '9V block'}${b.read ? ` · label read "${b.read}"` : ''}`}>
      <span className="bat-chip-swatch" />
      <span className="bat-chip-v">{fmtVolts(b.volts)}</span>
      <span className="bat-chip-k">{k ? (b.round ? k.label : '9V block') : b.color}</span>
      {onRemove && <button type="button" className="bat-chip-x" onClick={onRemove} title="Remove this battery">✕</button>}
    </span>
  );
}

function CellPick({ cell, onChange }) {
  const key = cellKey(cell);
  const opts = CELL_OPTIONS.includes(key) ? CELL_OPTIONS : [...CELL_OPTIONS, key];
  const cls = !cell ? 'empty' : cell.kind === 'digit' ? 'digit' : cell.kind === 'any' ? 'any' : `pair pair-${cell.pair}`;
  return (
    <select className={`bat-cell ${cls}`} value={key} onChange={(e) => onChange(parseCell(e.target.value))} title="Fix this cell if it was misread">
      {opts.map(o => <option key={o} value={o}>{o === '' ? '·' : o === 'any' ? 'ANY' : o.replace(':', ' ').toUpperCase()}</option>)}
    </select>
  );
}

/**
 * The timer-gated modules: where their digits show on the countdown from 8:00, and — once synced to
 * the bomb's timer — whether they can be disarmed now, or when next.
 */
function TimerHelp({ timer }) {
  // synced countdown, shared by every Batteries card: { at: Date.now() when synced, sec: timer then }
  const [sync, setSync] = useSharedState('batteries_timer_sync', null);
  const [typed, setTyped] = useState('');
  const [now, setNow] = useState(() => Date.now());
  React.useEffect(() => {
    if (!sync) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [sync]);
  const cur = sync ? Math.max(0, sync.sec - Math.floor((now - sync.at) / 1000)) : null;
  const startSync = (sec) => { setSync({ at: Date.now(), sec }); setNow(Date.now()); };
  const typedSec = (() => {
    const m = typed.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    return m && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  })();
  const live = (digits) => {
    if (cur == null) return null;
    if (showsDigits(cur, digits)) {
      const w = timerWindows(digits, cur)[0];
      return <span className="bat-now">✅ NOW — {w.len} s left in this window</span>;
    }
    const ws = timerWindows(digits, cur);
    if (!ws.length) return <span className="bat-late">⚠ no {digitsLabel(digits)} left on the timer</span>;
    const next = ws[0], long = ws.find(w => w.len >= 10);
    return (
      <span className="bat-next">
        next at <b>{fmtClock(next.start)}</b> in {cur - next.start} s ({next.len} s)
        {next.len < 10 && long ? <> · longer: <b>{fmtClock(long.start)}</b> in {cur - long.start} s ({long.len} s)</> : null}
      </span>
    );
  };
  return (
    <div className="bat-timer-note">
      <div className="bat-timer-bar">
        <span className="search-config-label">TIMER (counts down from 8:00):</span>
        {cur != null && <span className="bat-clock">{fmtClock(cur)}</span>}
        <button type="button" className="reset-btn" onClick={() => startSync(BOMB_START)} title="Press as the bomb starts">▶ 8:00</button>
        <input className="bat-timer-in" value={typed} placeholder="6:42" inputMode="numeric" spellCheck="false"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && typedSec != null) startSync(typedSec); }}
          title="What the bomb's timer shows right now, then Enter" />
        <button type="button" className="reset-btn" disabled={typedSec == null} onClick={() => startSync(typedSec)}>sync</button>
        {sync && <button type="button" className="reset-btn" onClick={() => setSync(null)}>stop</button>}
      </div>
      {timer.map(t => (
        <div key={t.name} className="bat-timer-row">
          ⏱ <b>{t.name}</b>: only while {t.digits.length > 1 ? 'all of ' : 'a '}<b>{digitsLabel(t.digits)}</b> {t.digits.length > 1 ? 'are' : 'is'} on the timer
          <div className="bat-windows">{describeWindows(t.digits)}</div>
          {live(t.digits)}
        </div>
      ))}
    </div>
  );
}

export function BatteriesModule({ isActive = true }) {
  React.useEffect(() => { preWarmOCR(); }, []);
  const inst = useInstance();
  const multi = Boolean(inst && inst.multi);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  // This game's table (new every game: in memory only), shared by every Batteries card
  const [table, setTable] = useSharedState('batteries_table', null);
  const [batteries, setBatteries] = useState([]);
  const [overrides, setOverrides] = useState({}); // row → true / false set by hand
  const [status, setStatus] = useState({ text: '', ok: null });
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState({ table: '', batteries: '' });

  // a new table (new game) drops the hand-set rows
  React.useEffect(() => { setOverrides({}); }, [table]);

  const res = table ? solveBatteries(table, batteries, overrides) : null;
  const answer = res && res.ready ? res.copy : '';

  React.useEffect(() => {
    const fresh = answerChanged(answer); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  const readOne = async (img, dataUri) => {
    const r = await readBatteriesFile(img, (t) => setStatus({ text: t, ok: null }));
    if (r.type === 'table') {
      setTable(r.table);
      setThumbs(p => ({ ...p, table: dataUri || p.table }));
      const unsure = r.table.unsure.length ? ` · check the name of column ${r.table.unsure.map(i => i + 1).join(', ')}` : '';
      const odd = r.table.rows.filter(row => parseCondition(row.text, row.icon).type === 'unknown').length;
      return { ok: !unsure && !odd, text: `✓ Table read: ${r.table.rows.length} rows × ${r.table.modules.length} modules${unsure}${odd ? ` · ${odd} condition${odd === 1 ? '' : 's'} not understood — fix below` : ''}` };
    }
    if (r.type === 'batteries') {
      setBatteries(r.batteries);
      setThumbs(p => ({ ...p, batteries: dataUri || p.batteries }));
      const total = r.batteries.reduce((a, b) => a + b.volts, 0);
      return { ok: true, text: `✓ Batteries: ${r.batteries.map(b => `${kindLabel(b.color)}${b.round ? '' : ' block'} ${fmtVolts(b.volts)}`).join(', ')} = ${fmtVolts(total)}` };
    }
    return { ok: false, text: `⚠ ${r.reason || 'Not a Batteries picture.'}` };
  };

  const ingest = async (items) => {
    setBusy(true);
    const notes = [];
    let bad = false;
    for (const { img, uri } of items) {
      try {
        const n = await readOne(img, uri);
        notes.push(n.text);
        if (!n.ok) bad = true;
      } catch (e) {
        notes.push(`⚠ ${e.message || 'Could not read that picture.'}`);
        bad = true;
      }
    }
    setBusy(false);
    setStatus({ text: notes.join('  ·  '), ok: !bad });
  };

  const handleImage = (img, dataUri, blob) => {
    setLastImage(img, blob);
    ingest([{ img, uri: dataUri }]);
  };

  const handleFiles = async (files) => {
    const list = Array.from(files).filter(f => f && (!f.type || f.type.startsWith('image/')));
    const items = [];
    for (const f of list) {
      const uri = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = uri; });
      items.push({ img, uri });
    }
    ingest(items);
  };

  const handleSample = () => {
    setTable(SAMPLE_TABLE);
    setBatteries(SAMPLE_BATTERIES);
    setStatus({ text: 'Sample: the 23 Nov table with orange + blue + 9V batteries.', ok: true });
  };

  const handleClear = () => {
    setBatteries([]);
    setOverrides({});
    setThumbs(p => ({ ...p, batteries: '' }));
    setStatus({ text: table ? 'Batteries cleared — the table stays for this game.' : '', ok: null });
    setLastImage(null, null);
    setLastCopyString('');
  };
  const clearTable = () => { setTable(null); setThumbs(p => ({ ...p, table: '' })); setStatus({ text: 'Table cleared.', ok: null }); };

  const addBattery = (color) => {
    const k = BATTERY_KINDS[color];
    setBatteries(prev => [...prev, { color, volts: k.volts, round: k.round, size: null }]);
  };
  const removeBattery = (i) => setBatteries(prev => prev.filter((_, j) => j !== i));

  // table edits (all copies share the table)
  const editRow = (r, patch) => setTable(t => ({ ...t, rows: t.rows.map((row, i) => (i === r ? { ...row, ...patch } : row)) }));
  const editCell = (r, c, cell) => setTable(t => ({ ...t, rows: t.rows.map((row, i) => (i === r ? { ...row, cells: row.cells.map((x, j) => (j === c ? cell : x)) } : row)) }));
  const editModule = (c, name) => setTable(t => ({ ...t, modules: t.modules.map((m, j) => (j === c ? name : m)), unsure: (t.unsure || []).filter(j => j !== c) }));
  const cycleRow = (r) => setOverrides(o => {
    const cur = o[r];
    const next = { ...o };
    if (cur === undefined) next[r] = true; else if (cur === true) next[r] = false; else delete next[r];
    return next;
  });

  const total = batteries.reduce((a, b) => a + (Number(b.volts) || 0), 0);

  const lines = [];
  if (res && res.ready) {
    const named = (n) => { const t = res.timer.find(x => x.name === n); return t ? `${n} ⏱${digitsLabel(t.digits)}` : n; };
    for (const lv of res.chains) lines.push(lv.map(l => l.map(named).join(' + ')).join(' → '));
    for (const t of res.timer) if (!res.chains.some(lv => lv.some(l => l.includes(t.name)))) lines.push(named(t.name));
    if (res.free.length) lines.push(`ANY TIME: ${res.free.join(', ')}`);
  }
  const placeholder = busy ? '📷 READING…'
    : !table ? "PASTE THIS GAME'S BATTERIES TABLE"
    : !batteries.length ? 'PASTE THE BATTERIES PICTURE'
    : '— — —';
  const stats = res && res.ready
    ? `${res.rows.filter(r => r.truth === true).length} OF ${res.rows.length} ROWS TRUE · ${fmtVolts(total)} IN ${batteries.length} BATTER${batteries.length === 1 ? 'Y' : 'IES'}`
    : 'EVERY TRUE ROW APPLIES';

  const warnings = [];
  if (res && res.ready) {
    if (res.cycle) warnings.push(`⚠ The true rows contradict each other (${res.cycle.join(', ')} must each come first) — check the batteries and the rows marked true.`);
    if (res.unknownRows.length) warnings.push(`⚠ Row ${res.unknownRows.map(i => i + 1).join(', ')} can't be decided (condition not understood or a size tie) — tap its ? in the table to set it.`);
    if (table.unsure && table.unsure.length) warnings.push(`⚠ Module name of column ${table.unsure.map(i => i + 1).join(', ')} is a guess — check it in the table header.`);
  }

  const copyItems = [];
  if (answer) copyItems.push({ label: `COPY ORDER (${answer.length > 60 ? answer.slice(0, 57) + '…' : answer})`, value: answer });

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              onFiles={handleFiles}
              multiple
              icon={busy ? '⏳' : '🔋 🔋 9V'}
              title={multi ? 'Drop / paste this bomb’s batteries (or the table)' : 'Click here, then paste the table (once per game) and the batteries picture'}
              sub={<>the <b>table</b> stays for the whole game · the <b>batteries</b> picture is per bomb · both at once works too</>}
            />
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear}>clear batteries</button>
              <button className="reset-btn" type="button" onClick={clearTable} disabled={!table}>clear table</button>
              <button className="reset-btn" type="button" style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }} onClick={handleSample}>⚡ SAMPLE</button>
            </>
          }
        >
          {status.text && <div className={`module-hint ${status.ok === false ? 'bad' : status.ok ? 'ok' : ''}`}>{status.text}</div>}
          <div className="bat-config">
            <div className="bat-row">
              <span className="search-config-label">TABLE:</span>
              {table
                ? <span className="bat-ok">read ✓ {table.rows.length} rows × {table.modules.length} modules</span>
                : <span className="bat-need">paste this game's table picture (it changes every game)</span>}
              {thumbs.table && <img className="bat-thumb" src={thumbs.table} alt="table" />}
            </div>
            <ManualPasteBox what="Batteries table" card={multi ? inst.index : null} />
            <div className="bat-row">
              <span className="search-config-label">BATTERIES:</span>
              {batteries.length
                ? batteries.map((b, i) => <BatteryChip key={i} b={b} onRemove={() => removeBattery(i)} />)
                : <span className="bat-need">paste the batteries picture, or add them:</span>}
              {batteries.length > 0 && <span className="bat-total">= {fmtVolts(total)}</span>}
              {thumbs.batteries && <img className="bat-thumb" src={thumbs.batteries} alt="batteries" />}
            </div>
            <div className="bat-row bat-add">
              <span className="search-config-label">ADD:</span>
              {KIND_ORDER.map(c => (
                <button key={c} type="button" className={`bat-add-btn bat-${c}`} onClick={() => addBattery(c)} title={`Add a ${BATTERY_KINDS[c].label} ${BATTERY_KINDS[c].round ? 'round' : ''} battery (${fmtVolts(BATTERY_KINDS[c].volts)})`}>
                  + {BATTERY_KINDS[c].label}
                </button>
              ))}
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <>
          <AnswerPanel
            label="DISARM ORDER"
            stats={stats}
            answers={lines}
            copyValue={answer}
            placeholder={placeholder}
          />
          {res && res.ready && res.timer.length > 0 && <TimerHelp timer={res.timer} />}
          {warnings.map((w, i) => <div key={i} className="module-hint bad">{w}</div>)}
        </>
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel title="RULES TABLE — true rows apply · tap ? / ✓ / ✗ to set a row · fix any misread cell" defaultExpanded={!multi}>
          {!table ? (
            <div className="simon-status">No table yet — paste this game's Batteries table picture (or press SAMPLE).</div>
          ) : (
            <div className="bat-table-wrap">
              <table className="bat-table">
                <thead>
                  <tr>
                    <th className="bat-th-cond">If the bomb…</th>
                    {table.modules.map((m, c) => (
                      <th key={c} className={(table.unsure || []).includes(c) ? 'unsure' : ''}>
                        <select className="bat-mod" value={m} onChange={(e) => editModule(c, e.target.value)}>
                          {!MODULE_NAMES.includes(m) && <option value={m}>{m || '?'}</option>}
                          {MODULE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, r) => {
                    const info = res.rows[r];
                    const mark = info.truth === true ? '✓' : info.truth === false ? '✗' : '?';
                    return (
                      <tr key={r} className={info.truth === true ? 'on' : info.truth === false ? 'off' : 'unk'}>
                        <td className="bat-cond">
                          <button type="button" className={`bat-truth ${overrides[r] !== undefined ? 'hand' : ''}`} onClick={() => cycleRow(r)} title={overrides[r] !== undefined ? 'Set by hand — tap to change' : 'From the batteries — tap to set by hand'}>{mark}</button>
                          <input className="bat-cond-text" value={row.text} spellCheck="false" onChange={(e) => editRow(r, { text: e.target.value })} />
                          <select className={`bat-icon bat-${row.icon || 'none'}`} value={row.icon || ''} onChange={(e) => editRow(r, { icon: e.target.value || null })} title="The battery shown in this row">
                            <option value="">no icon</option>
                            {KIND_ORDER.map(c => <option key={c} value={c}>{BATTERY_KINDS[c].label}</option>)}
                          </select>
                          <span className="bat-cond-desc">{describeCondition(info.cond)}{oddVolts(info.cond) && <b className="bat-cond-warn" title="Batteries are 1.5V and 9V, so a total is always 1.5, 3, 4.5, 6, 7.5, 9, … — this voltage is probably a misread. Check the picture and fix the text."> ⚠ check the number</b>}</span>
                        </td>
                        {table.modules.map((_, c) => (
                          <td key={c}><CellPick cell={row.cells[c]} onChange={(cell) => editCell(r, c, cell)} /></td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </WorkingPanel>
      }
    />
  );
}

export const batteriesModule = {
  id: 'batteries',
  tabId: 'tabBatteries',
  tabLabel: '🔋 BATTERIES',
  eyebrow: 'MODULE ORDER SOLVER',
  title: 'Batteries Vision',
  sub: "Paste this game's <b>Batteries table</b> (once per game) and the bomb's <b>batteries</b> picture. Every row that is true for those batteries applies: a <b>digit</b> = only disarm while it is on the timer, <b>ANY</b> = whenever, <b>FIRST → THEN</b> = that order. Shows the order to disarm the modules in.",
  Component: BatteriesModule
};
