import React, { useState } from 'react';
import { SY, SY_KEYS, SY_RANK_COLORS } from './symbolsConstants.js';
import { SymbolGlyph } from './SymbolGlyph.jsx';

export function SymbolsWorking({
  grids = [],
  buttons = [null, null, null, null],
  counts = {},
  order = [],
  warnings = [],
  pasteMode = 'replace',
  onPasteMode = () => {},
  onButtonSelect = () => {},
  onClearButtons = () => {},
  onCellSet = () => {},
  onRemoveGrid = () => {},
  onAddBlankGrid = null,
  onClearGrids = () => {},
  onCountAdj = () => {}
}) {
  const [editing, setEditing] = useState(null); // { gi, ci } of the cell being corrected

  // symbol → press rank (0..3) so cells / counts of keypad symbols get highlighted
  const rankOf = {};
  order.forEach((r, i) => { if (rankOf[r.k] === undefined) rankOf[r.k] = i; });
  const onKeypad = new Set(buttons.filter(Boolean));
  const multi = grids.length > 1;

  const pickCell = (k) => {
    if (!editing) return;
    onCellSet(editing.gi, editing.ci, k);
    setEditing(null);
  };

  return (
    <div className="sy-working">
      {/* ── 1. Keypad (2×2 module buttons) ── */}
      <section className="sy-section">
        <div className="sy-section-head">
          <span className="search-config-label">KEYPAD (2×2 BUTTONS)</span>
          <button type="button" className="bg-btn" onClick={onClearButtons}>Clear keypad</button>
        </div>
        <div className="sy-btns">
          {buttons.map((k, i) => {
            const rank = k ? order.findIndex(r => r.n === i + 1) : -1;
            return (
              <div
                key={i}
                className={`sy-btn ${rank >= 0 ? 'ranked' : ''}`}
                style={rank >= 0 ? { borderColor: SY_RANK_COLORS[rank] } : undefined}
              >
                <div className="n">
                  BUTTON {i + 1}
                  {rank >= 0 && <span className="sy-rank" style={{ background: SY_RANK_COLORS[rank] }}>#{rank + 1}</span>}
                </div>
                <div className="g">{k ? <SymbolGlyph k={k} size={36} /> : '—'}</div>
                <div className="c">{k ? `${SY[k].name} · ${counts[k] || 0}` : 'not set'}</div>
                <select value={k || ''} onChange={(e) => onButtonSelect(i, e.target.value || null)}>
                  <option value="">— select —</option>
                  {SY_KEYS.map(x => (
                    <option key={x} value={x}>{SY[x].glyph} {SY[x].name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 2. Reference grids (strip) ── */}
      <section className="sy-section">
        <div className="sy-section-head">
          <span className="search-config-label">
            REFERENCE GRID{multi ? `S (${grids.length}) — COUNTS ARE SUMMED` : ''}
          </span>
          <div className="sy-head-actions">
            <div className="sy-seg" role="group" aria-label="What a new grid paste does">
              <button type="button" className={pasteMode === 'replace' ? 'on' : ''} onClick={() => onPasteMode('replace')}
                title="A new grid screenshot replaces the current grids">
                PASTE REPLACES
              </button>
              <button type="button" className={pasteMode === 'add' ? 'on' : ''} onClick={() => onPasteMode('add')}
                title="A new grid screenshot is added next to the current grids">
                PASTE ADDS
              </button>
            </div>
            {onAddBlankGrid && <button type="button" className="bg-btn" onClick={onAddBlankGrid}>+ Blank grid</button>}
            {grids.length > 0 && <button type="button" className="bg-btn" onClick={() => { setEditing(null); onClearGrids(); }}>Clear grids</button>}
          </div>
        </div>

        {grids.length === 0 ? (
          <div className="sy-empty">
            Paste the grid screenshot. One grid is read as-is; a strip with <b>SYMBOLS #1</b>, <b>#2</b> … headers is
            split into its grids. Click any cell afterwards to fix a misread.
          </div>
        ) : (
          <div className={`sy-strip ${onKeypad.size ? 'has-keypad' : ''}`}>
            {grids.map((g, gi) => (
              <div key={g.id} className="sy-grid-card">
                {multi && (
                  <div className="sy-grid-header">
                    <span>SYMBOLS #{gi + 1}</span>
                    <button type="button" title={`Remove grid #${gi + 1}`} onClick={() => { setEditing(null); onRemoveGrid(gi); }}>✕</button>
                  </div>
                )}
                <div className="sy-grid">
                  {g.cells.map((k, ci) => {
                    const rank = k ? rankOf[k] : undefined;
                    const isEdit = editing && editing.gi === gi && editing.ci === ci;
                    return (
                      <button
                        key={ci}
                        type="button"
                        className={`sy-cell ${(ci + Math.floor(ci / 5)) % 2 ? 'alt' : ''} ${k && onKeypad.has(k) ? 'hit' : ''} ${isEdit ? 'editing' : ''} ${!k ? 'blank' : ''}`}
                        style={rank !== undefined ? { boxShadow: `inset 0 0 0 2px ${SY_RANK_COLORS[rank]}` } : undefined}
                        title={k ? `${SY[k].name} — click to change` : 'Unread — click to set'}
                        onClick={() => setEditing(isEdit ? null : { gi, ci })}
                      >
                        {k ? <SymbolGlyph k={k} size={24} /> : '·'}
                      </button>
                    );
                  })}
                </div>
                {!multi && (
                  <div className="sy-grid-foot">
                    <button type="button" className="bg-btn" onClick={() => { setEditing(null); onRemoveGrid(gi); }}>Remove grid</button>
                  </div>
                )}
                {editing && editing.gi === gi && (
                  <div className="sy-palette">
                    {SY_KEYS.map(x => (
                      <button key={x} type="button" title={SY[x].name} onClick={() => pickCell(x)}
                        className={g.cells[editing.ci] === x ? 'on' : ''}>
                        <SymbolGlyph k={x} size={20} />
                      </button>
                    ))}
                    <button type="button" title="Clear cell" onClick={() => pickCell(null)}>∅</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 3. Totals ── */}
      <section className="sy-section">
        <span className="search-config-label">SYMBOL COUNTS (± TO FIX A MISREAD)</span>
        <div className="sy-counts">
          {SY_KEYS.map(k => {
            const cnt = counts[k] || 0;
            const rank = rankOf[k];
            return (
              <div
                key={k}
                className={`sy-count ${onKeypad.has(k) ? 'keypad' : ''}`}
                style={rank !== undefined ? { borderColor: SY_RANK_COLORS[rank] } : undefined}
              >
                <div className="g"><SymbolGlyph k={k} size={22} /></div>
                <div className={`k ${cnt > 0 ? 'on' : ''}`}>
                  <button type="button" aria-label={`Decrease ${SY[k].name}`} onClick={() => onCountAdj(k, -1)}>−</button>
                  {cnt}
                  <button type="button" aria-label={`Increase ${SY[k].name}`} onClick={() => onCountAdj(k, 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. Press order ── */}
      <section className="sy-section">
        <span className="search-config-label">PRESS ORDER (HIGHEST COUNT FIRST)</span>
        {order.length === 4 ? (
          <div className="sy-seq">
            {order.map((r, i) => (
              <div key={i} className="sy-step" style={{ borderColor: SY_RANK_COLORS[i] }}>
                <span>{i + 1}. press <b style={{ color: SY_RANK_COLORS[i] }}>button {r.n}</b></span>
                <span><SymbolGlyph k={r.k} size={20} /> {SY[r.k].name} · {r.c}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="sy-empty">Set all 4 keypad buttons (paste the keypad screenshot or pick each one) to get the press order.</div>
        )}
        {warnings.length > 0 && (
          <ul className="sy-warn">
            {warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
