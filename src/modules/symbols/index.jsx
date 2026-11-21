import React, { useState } from 'react';
import { SY } from './symbolsConstants.js';
import { syReadPanels, syReadModule } from './symbolsVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { SymbolsWorking } from './working.jsx';
import { stripStore, useStrip, addGrids } from './stripStore.js';

const MAX_GRIDS = 18; // 1–3 helper images, each a single grid or a strip with one grid per Symbols module
const EMPTY_BUTTONS = [null, null, null, null];
let gridSeq = 0;

function toCanvas(img) {
  const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * sc), H = Math.round(img.naturalHeight * sc);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  return { cv, data: g.getImageData(0, 0, W, H) };
}

// Small picture of the part of the screenshot a grid / keypad was read from, so you can see
// which image is applied where (a misread is easy to spot against the original).
function cropThumb(cv, x, y, w, h, max = 150) {
  const sc = Math.min(1, max / Math.max(w, h));
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(w * sc)); t.height = Math.max(1, Math.round(h * sc));
  t.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.8);
}

export function SymbolsModule({ isActive = true, instance = 0, instanceCount = 1 }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  // The strip is shared by every Symbols window. Its grids are split into puzzles: the grids in the
  // top section (under the first header / in the top row) are puzzle #1, the next section #2 …
  // This window adds up every grid of puzzle #(instance + 1) by default, and can be pointed at another.
  const { grids, version } = useStrip();
  const [gridIdx, setGridIdx] = useState(instance); // = the puzzle number this window counts (0-based)
  const [buttons, setButtons] = useState(EMPTY_BUTTONS);
  const [adj, setAdj] = useState({});
  const [keypadThumb, setKeypadThumb] = useState('');
  // 'mine' = only this puzzle's grids; 'all' = add up every grid in the strip (old app)
  const [countFrom, setCountFrom] = useState('mine');

  // Grids are added up across pastes, so a level change must start from an empty strip
  // (each mission remounts its modules; window #1 owns the reset)
  React.useEffect(() => { if (instance === 0) stripStore.setGrids([]); }, []);

  // A new strip resets this window's ± corrections and goes back to its own grid number
  React.useEffect(() => { setAdj({}); setGridIdx(instance); }, [version, instance]);

  const groupOf = g => (g.group ?? 0);
  const groups = grids.length ? Math.max(...grids.map(groupOf)) + 1 : 0;
  const myGrids = grids.filter(g => groupOf(g) === gridIdx);
  const myGrid = myGrids[0] || null;
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Totals = symbols read in every grid + manual ± corrections
  const rawCounts = {};
  const countedGrids = countFrom === 'all' ? grids : myGrids;
  for (const g of countedGrids) for (const k of g.cells) if (k) rawCounts[k] = (rawCounts[k] || 0) + 1;
  const counts = { ...rawCounts };
  for (const [k, d] of Object.entries(adj)) counts[k] = Math.max(0, (rawCounts[k] || 0) + d);

  // Press order: highest occurrence count first, ties by button number
  const validButtons = buttons.map((k, i) => (k ? { n: i + 1, k, c: counts[k] || 0 } : null)).filter(Boolean);
  const order = validButtons.length === 4
    ? [...validButtons].sort((a, b) => (b.c !== a.c ? b.c - a.c : a.n - b.n))
    : [];
  const copyFormatted = order.length === 4 ? order.map(r => r.n).join(' ') : '';

  const warnings = [];
  if (order.length === 4) {
    const seen = new Set();
    for (const r of order) {
      if (seen.has(r.k)) warnings.push(`${SY[r.k].name} is set on two buttons`);
      seen.add(r.k);
    }
    for (let i = 1; i < order.length; i++) {
      if (order[i].c === order[i - 1].c && order[i].k !== order[i - 1].k) {
        warnings.push(`Tie: buttons ${order[i - 1].n} & ${order[i].n} both have ${order[i].c}`);
      }
    }
    if (!countedGrids.length && !Object.keys(adj).length) {
      warnings.push(grids.length
        ? `The strip has ${groups} puzzle${groups > 1 ? 's' : ''} — there is no puzzle #${gridIdx + 1}`
        : 'No reference grid loaded yet');
    }
  }

  React.useEffect(() => {
    const fresh = answerChanged(copyFormatted); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && fresh && copyFormatted) copy(copyFormatted);
  }, [copyFormatted, isActive]);

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    let d, cv;
    try { ({ cv, data: d } = toCanvas(img)); } catch (e) { showToast('IMAGE LOADED — SET SYMBOLS BELOW'); return; }

    // A reference grid is checked first: a full 5×5 read means it is a grid, not the 2×2 keypad
    const pr = syReadPanels(d);
    const fullGrids = pr.panels.filter(p => p.cells.filter(Boolean).length >= 20);

    if (!fullGrids.length) {
      const probe = syReadModule(d);
      if (probe.tiles >= 4) {
        setButtons(prev => prev.map((k, i) => probe.buttons[i] || k));
        setKeypadThumb(cropThumb(cv, 0, 0, cv.width, cv.height, 170));
        const got = probe.buttons.filter(Boolean).length;
        showToast(got === 4 ? 'KEYPAD READ: 4/4 BUTTONS ✓' : `KEYPAD READ: ${got}/4 — PICK THE REST`);
        return;
      }
    }

    const panels = fullGrids.length ? fullGrids : pr.panels;
    if (!panels.length) { showToast('COULD NOT DETECT SYMBOLS'); return; }

    const usedGroups = [...new Set(panels.map(p => p.group || 0))].sort((a, b) => a - b);
    const incoming = panels.map(p => ({
      id: ++gridSeq,
      cells: p.cells,
      group: usedGroups.indexOf(p.group || 0),
      thumb: cropThumb(cv, p.x, p.y, p.w, p.h)
    }));

    // Each helper player sends their own image (a single grid, or a strip with one section per
    // Symbols module), so a puzzle's grids arrive over 1–3 pastes: add them up instead of replacing.
    // Section #n of every image belongs to puzzle #n. The same image pasted twice is skipped.
    // Nothing tells us a new bomb has started, so the grids are kept until "clear" or a level change.
    const { grids: next, added: fresh } = addGrids(stripStore.get().grids, incoming, MAX_GRIDS);
    if (!fresh.length) { showToast('GRID ALREADY ADDED — NOTHING CHANGED'); return; }
    stripStore.setGrids(next);

    const perPuzzle = usedGroups.map((_, gi) => next.filter(g => groupOf(g) === gi).length);
    const cells = fresh.reduce((s, g) => s + g.cells.filter(Boolean).length, 0);
    showToast(perPuzzle.length > 1
      ? `STRIP ADDED · GRIDS PER PUZZLE: ${perPuzzle.join(' / ')} · ${cells} CELLS ✓`
      : `GRID ADDED · COUNTING ${perPuzzle[0]} GRID${perPuzzle[0] > 1 ? 'S' : ''} · ${cells} CELLS ✓`, false, 2600);
  };

  const handleAddBlankGrid = () => {
    if (grids.length >= MAX_GRIDS) return;
    stripStore.setGrids([...grids, { id: ++gridSeq, cells: Array(25).fill(null), group: gridIdx }]);
  };

  const handleCountAdj = (k, delta) => {
    const nextTotal = Math.max(0, (counts[k] || 0) + delta);
    setAdj(prev => ({ ...prev, [k]: nextTotal - (rawCounts[k] || 0) }));
  };

  const handleSample = () => {
    // The two-grid strip from the game: Ѣ 17, Ж 9, ¿ 5, ƛ 4 …
    const g1 = ['STAR_SOLID','YAT','INV_QUESTION','YAT','YAT','YAT','INV_QUESTION','LAMBDA_STROKE','YAT','YAT','OT','OT','COPYRIGHT','INV_QUESTION','LAMBDA_STROKE','YAT','LAMBDA_STROKE','OT','OT','INV_QUESTION','KOPPA','YAT','LAMBDA_STROKE','OT','YAT'];
    const g2 = ['YAT','YAT','YAT','YAT','YAT','STAR_HOLLOW','ZHE','ZHE','STAR_HOLLOW','ZHE','YAT','STAR_HOLLOW','ZHE','ZHE','DOUBLE_CROSS','INV_QUESTION','ZHE','KOPPA','ZHE','YAT','ZHE','STAR_HOLLOW','ZHE','YAT','STAR_HOLLOW'];
    stripStore.setGrids([{ id: ++gridSeq, cells: g1, group: 0 }, { id: ++gridSeq, cells: g2, group: 1 }]);
    setButtons(['OT', 'YAT', 'COPYRIGHT', 'LAMBDA_STROKE']); // grid #1: Ѣ 9, Ѿ 5, ƛ 4, © 1 → press 2 1 4 3
    showToast('SAMPLE STRIP LOADED ✓');
  };

  const handleClear = () => {
    stripStore.setGrids([]); // the strip is shared — clearing it clears every Symbols window
    setButtons(EMPTY_BUTTONS);
    setAdj({});
    setKeypadThumb('');
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('SYMBOLS CLEARED ✓');
  };

  const copyItems = [];
  if (order.length === 4) {
    copyItems.push({ label: `COPY ORDER (${copyFormatted})`, value: copyFormatted });
    order.forEach((r, idx) => {
      copyItems.push({ label: `Step ${idx + 1}: Button ${r.n}`, value: String(r.n) });
    });
  }

  const gridInfo = countFrom === 'all' && grids.length
    ? `COUNTING ALL ${grids.length} GRID${grids.length > 1 ? 'S' : ''}`
    : myGrid
    ? (groups > 1 || myGrids.length > 1
      ? `PUZZLE #${gridIdx + 1} OF ${groups} · ${myGrids.length} GRID${myGrids.length > 1 ? 'S' : ''}`
      : `${myGrids.length} GRID${myGrids.length > 1 ? 'S' : ''} ADDED UP`)
    : 'NO GRID';
  const stampStats = order.length === 4
    ? `${gridInfo} | PRESS ORDER: ${copyFormatted}${warnings.length ? ' | ⚠ CHECK' : ''}`
    : `${gridInfo} | BUTTONS: ${validButtons.length}/4`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🔣 Ω Ѣ © Ψ"
              title="Click here, then paste each helper's grid (or strip) and the 2×2 keypad"
              sub={
                <>
                  press <kbd>Ctrl</kbd>+<kbd>V</kbd> anywhere — every pasted grid is added up (one per helper); in a strip, section #n goes to Symbols #n. Clear before the next bomb
                </>
              }
            />
          }
          preview={
            previewUri ? (
              <div className="preview-row show">
                <img src={previewUri} alt="uploaded preview" />
                <span>{previewMeta}</span>
                <button type="button" className="preview-clear-btn" onClick={() => { setPreviewUri(''); setPreviewMeta(''); }}>✕</button>
              </div>
            ) : null
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear}>
                clear
              </button>
              <button
                className="reset-btn"
                type="button"
                style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }}
                onClick={handleSample}
              >
                ⚡ SAMPLE
              </button>
            </>
          }
        />
      }
      answers={
        <AnswerPanel
          label={instanceCount > 1 ? `SYMBOLS #${instance + 1} — BUTTON PRESS ORDER` : 'SYMBOLS BUTTON PRESS ORDER'}
          stats={stampStats}
          answers={order.length === 4 ? order.map(r => `Button ${r.n}`) : []}
          copyValue={copyFormatted}
          placeholder={myGrid ? 'SET ALL 4 KEYPAD BUTTONS' : 'PASTE GRID STRIP + KEYPAD'}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel title="SYMBOLS WORKSPACE — keypad buttons, reference grids & counts">
          <SymbolsWorking
            grids={grids}
            gridIdx={gridIdx}
            onUseGrid={setGridIdx}
            countFrom={countFrom}
            onCountFrom={setCountFrom}
            keypadThumb={keypadThumb}
            buttons={buttons}
            counts={counts}
            order={order}
            warnings={warnings}
            onButtonSelect={(i, k) => setButtons(prev => prev.map((x, j) => (j === i ? k : x)))}
            onClearButtons={() => { setButtons(EMPTY_BUTTONS); setKeypadThumb(''); }}
            onCellSet={stripStore.setCell}
            onSetGroup={stripStore.setGroup}
            onRemoveGrid={stripStore.removeGrid}
            onAddBlankGrid={grids.length < MAX_GRIDS ? handleAddBlankGrid : null}
            onClearGrids={() => stripStore.setGrids([])}
            onCountAdj={handleCountAdj}
          />
        </WorkingPanel>
      }
    />
  );
}

export const symbolsModule = {
  id: 'symbols',
  tabId: 'tabSymbols',
  tabLabel: '🔣 SYMBOLS',
  eyebrow: 'SYMBOLS PUZZLE SOLVER',
  title: 'Symbols Vision',
  sub: 'Paste <b>every helper\'s</b> reference grid (1–3 images) — they are <b>added up</b>. A <b>strip</b> image gives section #1 to Symbols #1, section #2 to #2 … — plus the 2×2 keypad. Press <b>clear</b> before the next bomb. Buttons are pressed from <b>highest count to lowest</b>.',
  Component: SymbolsModule
};
