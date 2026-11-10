import React, { useState } from 'react';
import { SY } from './symbolsConstants.js';
import { syReadPanels, syReadModule } from './symbolsVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { SymbolsWorking } from './working.jsx';
import { stripStore, useStrip } from './stripStore.js';

const MAX_GRIDS = 6;
const EMPTY_BUTTONS = [null, null, null, null];
let gridSeq = 0;

function toImageData(img) {
  const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * sc), H = Math.round(img.naturalHeight * sc);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  return g.getImageData(0, 0, W, H);
}

export function SymbolsModule({ isActive = true, instance = 0, instanceCount = 1 }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  // The strip ("SYMBOLS #1", "#2" … grids) is shared by every Symbols window;
  // this window uses grid #(instance + 1) by default, and can be pointed at another one.
  const { grids, version } = useStrip();
  const [gridIdx, setGridIdx] = useState(instance);
  const [buttons, setButtons] = useState(EMPTY_BUTTONS);
  const [adj, setAdj] = useState({});

  // A new strip resets this window's ± corrections and goes back to its own grid number
  React.useEffect(() => { setAdj({}); setGridIdx(instance); }, [version, instance]);

  const myGrid = grids[gridIdx] || null;
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Totals = symbols read in every grid + manual ± corrections
  const rawCounts = {};
  if (myGrid) for (const k of myGrid.cells) if (k) rawCounts[k] = (rawCounts[k] || 0) + 1;
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
    if (!myGrid && !Object.keys(adj).length) {
      warnings.push(grids.length
        ? `The strip has ${grids.length} grid${grids.length > 1 ? 's' : ''} — there is no SYMBOLS #${gridIdx + 1}`
        : 'No reference grid loaded yet');
    }
  }

  React.useEffect(() => {
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && copyFormatted) copy(copyFormatted);
  }, [copyFormatted, isActive]);

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    let d;
    try { d = toImageData(img); } catch (e) { showToast('IMAGE LOADED — SET SYMBOLS BELOW'); return; }

    // A reference grid is checked first: a full 5×5 read means it is a grid, not the 2×2 keypad
    const pr = syReadPanels(d);
    const fullGrids = pr.panels.filter(p => p.cells.filter(Boolean).length >= 20);

    if (!fullGrids.length) {
      const probe = syReadModule(d);
      if (probe.tiles >= 4) {
        setButtons(prev => prev.map((k, i) => probe.buttons[i] || k));
        const got = probe.buttons.filter(Boolean).length;
        showToast(got === 4 ? 'KEYPAD READ: 4/4 BUTTONS ✓' : `KEYPAD READ: ${got}/4 — PICK THE REST`);
        return;
      }
    }

    const panels = fullGrids.length ? fullGrids : pr.panels;
    if (!panels.length) { showToast('COULD NOT DETECT SYMBOLS'); return; }

    stripStore.setGrids(panels.slice(0, MAX_GRIDS).map(p => ({ id: ++gridSeq, cells: p.cells })));
    const cells = panels.reduce((s, p) => s + p.cells.filter(Boolean).length, 0);
    showToast(panels.length > 1
      ? `STRIP READ: ${panels.length} GRIDS · ${cells} CELLS ✓`
      : `GRID READ: ${cells}/25 CELLS ✓`);
  };

  const handleAddBlankGrid = () => {
    if (grids.length >= MAX_GRIDS) return;
    stripStore.setGrids([...grids, { id: ++gridSeq, cells: Array(25).fill(null) }]);
  };

  const handleCountAdj = (k, delta) => {
    const nextTotal = Math.max(0, (counts[k] || 0) + delta);
    setAdj(prev => ({ ...prev, [k]: nextTotal - (rawCounts[k] || 0) }));
  };

  const handleSample = () => {
    // The two-grid strip from the game: Ѣ 17, Ж 9, ¿ 5, ƛ 4 …
    const g1 = ['STAR_SOLID','YAT','INV_QUESTION','YAT','YAT','YAT','INV_QUESTION','LAMBDA_STROKE','YAT','YAT','OT','OT','COPYRIGHT','INV_QUESTION','LAMBDA_STROKE','YAT','LAMBDA_STROKE','OT','OT','INV_QUESTION','KOPPA','YAT','LAMBDA_STROKE','OT','YAT'];
    const g2 = ['YAT','YAT','YAT','YAT','YAT','STAR_HOLLOW','ZHE','ZHE','STAR_HOLLOW','ZHE','YAT','STAR_HOLLOW','ZHE','ZHE','DOUBLE_CROSS','INV_QUESTION','ZHE','KOPPA','ZHE','YAT','ZHE','STAR_HOLLOW','ZHE','YAT','STAR_HOLLOW'];
    stripStore.setGrids([{ id: ++gridSeq, cells: g1 }, { id: ++gridSeq, cells: g2 }]);
    setButtons(['LAMBDA_STROKE', 'YAT', 'INV_QUESTION', 'ZHE']);
    showToast('SAMPLE STRIP LOADED ✓');
  };

  const handleClear = () => {
    stripStore.setGrids([]); // the strip is shared — clearing it clears every Symbols window
    setButtons(EMPTY_BUTTONS);
    setAdj({});
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

  const gridInfo = myGrid
    ? (grids.length > 1 ? `USING SYMBOLS #${gridIdx + 1} OF ${grids.length}` : '1 GRID')
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
              title="Click here, then paste the grid strip or the 2×2 keypad"
              sub={
                <>
                  press <kbd>Ctrl</kbd>+<kbd>V</kbd> anywhere — a strip with <b>SYMBOLS #1, #2 …</b> grids is split, one grid per Symbols module
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
            buttons={buttons}
            counts={counts}
            order={order}
            warnings={warnings}
            onButtonSelect={(i, k) => setButtons(prev => prev.map((x, j) => (j === i ? k : x)))}
            onClearButtons={() => setButtons(EMPTY_BUTTONS)}
            onCellSet={stripStore.setCell}
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
  sub: 'Paste the reference grid screenshot — a single 5×5 grid, or a <b>strip of SYMBOLS #1, #2 …</b> grids where grid #n belongs to Symbols module #n — plus the 2×2 keypad. Buttons are pressed from <b>highest count to lowest</b>.',
  Component: SymbolsModule
};
