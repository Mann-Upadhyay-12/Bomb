import React, { useState } from 'react';
import { mazeManualStore, useMazeManual } from './mazeStrip.js';
import { useTouchScreen } from '../../utils/touch.js';
import { ManualPasteBox } from '../../core/Dropzone.jsx';

// Shown once above the Maze cards: the manual strip is one image for all of them.
// It's pasted or dropped anywhere on the page (no box of its own); maze #n goes to card #n.
export function MazeManualBar({ count }) {
  const { mazes } = useMazeManual();
  const phone = useTouchScreen();
  const [open, setOpen] = useState(false);
  const loaded = mazes.filter(Boolean).length;
  const status = !loaded ? 'NOT LOADED' : `${loaded} MAZE${loaded > 1 ? 'S' : ''} ✓`;
  const extra = mazes.length > count ? ` — ${mazes.length - count} more than cards` : '';

  return (
    <div className={`mgroup-manual-bar ${open ? 'open' : ''}`}>
      <div className="mgroup-manual-line">
        <span className="mgroup-manual-name">📖 MAZE MANUAL</span>
        <span className={`mgroup-manual-status ${loaded ? 'on' : 'off'}`}>{status}</span>
        <span className="mgroup-manual-tip">
          {phone
            ? <>paste the manual strip or its link in the 📖 box below — maze #n goes to card #n{extra}</>
            : <>paste (Ctrl+V) or drop the manual strip anywhere — maze #n goes to card #n{extra}</>}
        </span>
        {loaded > 0 && (
          <button type="button" className="mgroup-manual-debug" onClick={() => setOpen(o => !o)}>{open ? 'hide' : 'check walls'}</button>
        )}
        {loaded > 0 && (
          <button type="button" className="mgroup-manual-debug" style={{ marginLeft: 0 }} onClick={() => { mazeManualStore.clear(); setOpen(false); }}>clear</button>
        )}
      </div>
      <ManualPasteBox what="Maze manual strip" />
      {open && loaded > 0 && (
        <div className="mz-thumbs">
          {mazes.map((m, i) => (
            <div key={i} className={`mz-thumb ${i >= count ? 'spare' : ''}`}>
              <span className="mz-thumb-n">MAZE {i + 1}{i >= count ? ' (no card)' : ''}</span>
              {m && m.thumb ? <img src={m.thumb} alt={`maze ${i + 1} walls`} /> : <div className="mz-thumb-empty">—</div>}
              <span className="mz-thumb-s">{m ? `${m.count} walls ${m.fallback ? '⚠' : '✓'}` : 'not loaded'}</span>
            </div>
          ))}
          <div className="mz-thumbs-tip">Pink lines = detected walls; they should sit exactly on the black walls. ⚠ = board not found, fixed position used.</div>
        </div>
      )}
    </div>
  );
}
