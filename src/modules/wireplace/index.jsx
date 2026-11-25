import React, { useState } from 'react';
import { classifyWirePicture } from './wireplaceVision.js';
import { solveWirePlacement, wireLabel, cap, CELLS, PICK_COLORS, SAMPLE_TABLE, SAMPLE_WIRES } from './wireplaceSolver.js';
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

const SWATCH = { black: '#141414', blue: '#2f7fe0', red: '#e0352b', white: '#f1f1f1', yellow: '#f2c531', green: '#3a9d5d', orange: '#e07b1f', purple: '#8e44ad' };

function pictureData(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, W, H);
}

const ColorPick = ({ value, onChange, title, className = '' }) => (
  <select className={`wp-color ${className}`} value={value || ''} title={title} onChange={(e) => onChange(e.target.value || null)}
    style={{ '--wp-c': SWATCH[value] || 'transparent' }}>
    {!value && <option value="">?</option>}
    {PICK_COLORS.map(c => <option key={c} value={c}>{cap(c)}</option>)}
  </select>
);

/** The 4×4 board as the defuser sees it: cut wires bold with ✂, the rest faded. */
function Board({ wires, res }) {
  const P = 46, M = 26; // tile pitch, margin for the labels
  const at = (n) => ({ x: M + 'ABCD'.indexOf(n[0]) * P + P / 2, y: M + (Number(n[1]) - 1) * P + P / 2 });
  const cutSet = new Set(res && res.ready ? res.cut : []);
  return (
    <svg className="wp-board" viewBox={`0 0 ${M + 4 * P + 6} ${M + 4 * P + 6}`} role="img" aria-label="Wire Placement board">
      {'ABCD'.split('').map((c, i) => <text key={c} x={M + i * P + P / 2} y={16} className="wp-lbl">{c}</text>)}
      {[1, 2, 3, 4].map((r, i) => <text key={r} x={10} y={M + i * P + P / 2 + 4} className="wp-lbl">{r}</text>)}
      {CELLS.map(n => { const p = at(n); return <rect key={n} x={p.x - P / 2 + 3} y={p.y - P / 2 + 3} width={P - 6} height={P - 6} rx={6} className={`wp-tile ${n === 'C3' ? 'c3' : ''}`} />; })}
      {wires.map((w, i) => {
        const a = at(w.a), b = at(w.b);
        const cut = cutSet.has(w);
        const done = res && res.ready;
        return (
          <g key={i} className={`wp-wire ${done ? (cut ? 'cut' : 'keep') : ''}`}>
            {cut && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="wp-cut-halo" />}
            {w.color === 'black' && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="wp-line-edge" />}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={SWATCH[w.color] || '#888'} className="wp-line" />
            {cut && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 + 5} className="wp-scissors">✂</text>}
          </g>
        );
      })}
      {CELLS.map(n => { const p = at(n); return <circle key={n} cx={p.x} cy={p.y} r={4.5} className="wp-peg" />; })}
    </svg>
  );
}

export function WirePlacementModule({ isActive = true }) {
  const inst = useInstance();
  const multi = Boolean(inst && inst.multi);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  // this game's table (new every game: in memory only), shared by every Wire Placement card
  const [table, setTable] = useSharedState('wireplace_table', null);
  const [wires, setWires] = useState([]);
  const [status, setStatus] = useState({ text: '', ok: null });
  const [thumbs, setThumbs] = useState({ table: '', board: '' });
  const [adding, setAdding] = useState({ a: 'A1', b: 'B1', color: 'yellow' });

  const res = solveWirePlacement(table, wires);
  const answer = res.ready ? res.copy : '';

  React.useEffect(() => {
    const fresh = answerChanged(answer); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  const readOne = (img, uri) => {
    const r = classifyWirePicture(pictureData(img));
    if (r.type === 'table') {
      setTable({ columns: r.table.columns, rows: r.table.rows, unsure: r.table.unsure });
      setThumbs(p => ({ ...p, table: uri || p.table }));
      const odd = r.table.unsure.length + r.table.columns.filter(c => !c).length + r.table.rows.filter(x => !x.color).length;
      return { ok: !odd, text: `✓ Table read: ${r.table.rows.length} rows × ${r.table.columns.length} colours${odd ? ` · ${odd} cell${odd === 1 ? '' : 's'} unsure — marked in the table below` : ''}` };
    }
    if (r.type === 'board') {
      setWires(r.board.wires.map(({ color, a, b }) => ({ color, a, b })));
      setThumbs(p => ({ ...p, board: uri || p.board }));
      return { ok: true, text: `✓ Board: ${r.board.wires.length} wires` };
    }
    return { ok: false, text: `⚠ ${r.reason || 'Not a Wire Placement picture.'}` };
  };

  const ingest = (items) => {
    const notes = [];
    let bad = false;
    for (const { img, uri } of items) {
      try { const n = readOne(img, uri); notes.push(n.text); if (!n.ok) bad = true; } catch (e) { notes.push(`⚠ ${e.message || 'Could not read that picture.'}`); bad = true; }
    }
    setStatus({ text: notes.join('  ·  '), ok: !bad });
  };

  const handleImage = (img, dataUri, blob) => { setLastImage(img, blob); ingest([{ img, uri: dataUri }]); };
  const handleFiles = async (files) => {
    const items = [];
    for (const f of Array.from(files).filter(f => f && (!f.type || f.type.startsWith('image/')))) {
      const uri = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = uri; });
      items.push({ img, uri });
    }
    ingest(items);
  };

  const handleSample = () => {
    setTable(SAMPLE_TABLE);
    setWires(SAMPLE_WIRES);
    setStatus({ text: 'Sample: the 23 Nov table and board (C3 is blue → cut A1-A2 yellow).', ok: true });
  };
  const handleClear = () => {
    setWires([]);
    setThumbs(p => ({ ...p, board: '' }));
    setStatus({ text: table ? 'Board cleared — the table stays for this game.' : '', ok: null });
    setLastImage(null, null);
    setLastCopyString('');
  };
  const clearTable = () => { setTable(null); setThumbs(p => ({ ...p, table: '' })); setStatus({ text: 'Table cleared.', ok: null }); };

  const editWire = (i, patch) => setWires(ws => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const removeWire = (i) => setWires(ws => ws.filter((_, j) => j !== i));
  const addWire = () => { if (adding.a !== adding.b) setWires(ws => [...ws, { ...adding }]); };

  const editColumn = (c, color) => setTable(t => ({ ...t, columns: t.columns.map((x, j) => (j === c ? color : x)) }));
  const editRowColor = (r, color) => setTable(t => ({ ...t, rows: t.rows.map((row, i) => (i === r ? { ...row, color } : row)) }));
  const editCell = (r, c, code) => setTable(t => ({
    ...t,
    rows: t.rows.map((row, i) => (i === r ? { ...row, cells: row.cells.map((x, j) => (j === c ? code || null : x)) } : row)),
    unsure: (t.unsure || []).filter(([rr, cc]) => rr !== r || cc !== c)
  }));
  const isUnsure = (r, c) => (table && table.unsure || []).some(([rr, cc]) => rr === r && cc === c);

  const matched = new Set();
  if (res.ready) res.verdicts.forEach(v => v.rows.forEach(r => matched.add(r)));

  const placeholder = !table ? "PASTE THIS GAME'S WIRE PLACEMENT TABLE" : !wires.length ? 'PASTE THE MODULE PICTURE' : res.reason ? res.reason.toUpperCase() : '— — —';
  const answers = res.ready ? (res.cut.length ? res.cut.map(wireLabel) : ['CUT NOTHING']) : [];
  const stats = res.ready ? `C3 IS ${res.c3.color.toUpperCase()} → ${res.c3.color.toUpperCase()} COLUMN · ${res.cut.length} OF ${wires.length} CUT` : 'COLOUR OF THE C3 WIRE PICKS THE COLUMN';

  const copyItems = [];
  if (answer) copyItems.push({ label: `COPY CUTS (${answer})`, value: answer });
  if (res.ready) res.cut.forEach(w => copyItems.push({ label: wireLabel(w), value: `${w.a}-${w.b}` }));

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              onFiles={handleFiles}
              multiple
              icon="〰️ A1 → C3"
              title={multi ? 'Drop / paste this module’s picture (or the table)' : 'Click here, then paste the table (once per game) and the module picture'}
              sub={<>the <b>table</b> stays for the whole game · the <b>module</b> picture is per bomb · both at once works too</>}
            />
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear}>clear board</button>
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
                ? <span className="bat-ok">read ✓ {table.rows.length} rows × {table.columns.length} colours</span>
                : <span className="bat-need">paste this game's table picture (it can change every game)</span>}
              {thumbs.table && <img className="bat-thumb" src={thumbs.table} alt="table" />}
            </div>
            <ManualPasteBox what="Wire Placement table" card={multi ? inst.index : null} />
            <div className="bat-row">
              <span className="search-config-label">BOARD:</span>
              {wires.length ? <span className="bat-ok">{wires.length} wires{res.c3 ? ` · C3 ${res.c3.color}` : ' · no wire on C3'}</span> : <span className="bat-need">paste the module picture</span>}
              {thumbs.board && <img className="bat-thumb" src={thumbs.board} alt="board" />}
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <>
          <AnswerPanel label="CUT" stats={stats} answers={answers} copyValue={answer} placeholder={placeholder} />
          {wires.length > 0 && (
            <div className="wp-board-wrap">
              <Board wires={wires} res={res} />
              {res.ready && (
                <ul className="wp-why">
                  {res.verdicts.map((v, i) => (
                    <li key={i} className={v.cut ? 'cut' : ''}>
                      <span className="wp-dot" style={{ background: SWATCH[v.wire.color] }} />
                      <b>{v.wire.a}-{v.wire.b}</b> {v.wire.color}: {v.cut ? `CUT (row ${v.rows.map(r => r + 1).join(', ')}: ${cap(v.wire.color)} ${table.rows[v.rows[0]].cells[res.column]})` : 'leave'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <>
          <WorkingPanel title="BOARD — fix a misread wire" defaultExpanded={false}>
            <div className="wp-wires">
              {wires.map((w, i) => (
                <div key={i} className="wp-wire-row">
                  <ColorPick value={w.color} onChange={(color) => editWire(i, { color })} title="Wire colour" />
                  <select className="wp-cell" value={w.a} onChange={(e) => editWire(i, { a: e.target.value })}>{CELLS.map(c => <option key={c}>{c}</option>)}</select>
                  <span>–</span>
                  <select className="wp-cell" value={w.b} onChange={(e) => editWire(i, { b: e.target.value })}>{CELLS.map(c => <option key={c}>{c}</option>)}</select>
                  <button type="button" className="bat-chip-x" onClick={() => removeWire(i)} title="Remove this wire">✕</button>
                </div>
              ))}
              <div className="wp-wire-row add">
                <ColorPick value={adding.color} onChange={(color) => setAdding(p => ({ ...p, color }))} title="New wire colour" />
                <select className="wp-cell" value={adding.a} onChange={(e) => setAdding(p => ({ ...p, a: e.target.value }))}>{CELLS.map(c => <option key={c}>{c}</option>)}</select>
                <span>–</span>
                <select className="wp-cell" value={adding.b} onChange={(e) => setAdding(p => ({ ...p, b: e.target.value }))}>{CELLS.map(c => <option key={c}>{c}</option>)}</select>
                <button type="button" className="reset-btn" onClick={addWire}>+ add wire</button>
              </div>
            </div>
          </WorkingPanel>
          <WorkingPanel title="TABLE — the C3 colour's column is used · fix any misread cell" defaultExpanded={!multi}>
            {!table ? (
              <div className="simon-status">No table yet — paste this game's Wire Placement table picture (or press SAMPLE).</div>
            ) : (
              <div className="bat-table-wrap">
                <table className="bat-table wp-table">
                  <thead>
                    <tr>
                      <th className="bat-th-cond">C3 wire is →<br />Cut wire ↓</th>
                      {table.columns.map((c, j) => (
                        <th key={j} className={j === res.column ? 'used' : ''}><ColorPick value={c} onChange={(v) => editColumn(j, v)} title="Column colour (C3 wire)" /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, r) => (
                      <tr key={r} className={matched.has(r) ? 'on' : ''}>
                        <td className="bat-cond"><ColorPick value={row.color} onChange={(v) => editRowColor(r, v)} title="Cut-wire colour of this row" /></td>
                        {row.cells.map((code, c) => (
                          <td key={c} className={c === res.column ? 'used' : ''}>
                            <select className={`wp-cell ${isUnsure(r, c) ? 'unsure' : ''}`} value={code || ''} onChange={(e) => editCell(r, c, e.target.value)} title={isUnsure(r, c) ? 'Not sure about this one — check it' : 'Fix this cell if it was misread'}>
                              <option value="">·</option>
                              {CELLS.map(x => <option key={x}>{x}</option>)}
                            </select>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkingPanel>
        </>
      }
    />
  );
}

export const wirePlacementModule = {
  id: 'wireplace',
  tabId: 'tabWirePlace',
  tabLabel: '〰️ WIRE PLACEMENT',
  eyebrow: 'WIRE CUTTING SOLVER',
  title: 'Wire Placement Vision',
  sub: "Paste this game's <b>Wire Placement table</b> (once per game) and the <b>module</b> picture. The colour of the wire on <b>C3</b> picks the column; every wire whose colour and one of its two ends match a row in that column is <b>cut</b>.",
  Component: WirePlacementModule
};
