import React, { useState } from 'react';
import { SY, SY_KEYS } from './symbolsConstants.js';
import { syReadGrids, syReadModule } from './symbolsVision.js';
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

export function SymbolsModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [buttons, setButtons] = useState([null, null, null, null]);
  // Up to 3 reference-grid screenshots (like the original) + manual ± adjustments.
  // Counts are derived, so re-pasting a grid replaces it instead of double-counting.
  const [grids, setGrids] = useState([null, null, null]);
  const [adj, setAdj] = useState({});
  const [status, setStatus] = useState({ text: '', ok: null });
  const counts = {};
  grids.forEach(g => { if (g) for (const [k, v] of Object.entries(g.counts)) counts[k] = (counts[k] || 0) + v; });
  for (const [k, v] of Object.entries(adj)) counts[k] = Math.max(0, (counts[k] || 0) + v);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Calculate press order: buttons with highest occurrence count first
  const validButtons = buttons.map((k, i) => (k ? { n: i + 1, k, c: counts[k] || 0 } : null)).filter(Boolean);
  const order = validButtons.length === 4
    ? [...validButtons].sort((a, b) => (b.c !== a.c ? b.c - a.c : a.n - b.n))
    : [];

  const copyFormatted = order.length === 4 ? order.map(r => r.n).join(' ') : '';

  React.useEffect(() => {
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && copyFormatted) {
      copy(copyFormatted);
    }
  }, [copyFormatted, isActive]);

  const handleButtonSelect = (idx, symbolKey) => {
    const next = [...buttons];
    next[idx] = symbolKey;
    setButtons(next);
  };

  const handleCountAdj = (symbolKey, delta) => {
    const cur = counts[symbolKey] || 0;
    if (cur + delta < 0) return;
    setAdj(prev => ({ ...prev, [symbolKey]: (prev[symbolKey] || 0) + delta }));
  };

  const handleSample = () => {
    // 4 symbols from the symbol table with sample occurrence counts → press order 3 1 4 2
    setButtons(['OMEGA', 'PSI', 'COPYRIGHT', 'ZHE']);
    setGrids([null, null, null]);
    setAdj({ OMEGA: 3, PSI: 1, COPYRIGHT: 5, ZHE: 2 });
    showToast('SAMPLE SYMBOLS LOADED ✓');
  };

  const removeGrid = (i) => setGrids(prev => prev.map((g, j) => (j === i ? null : g)));

  const readImageData = (img) => {
    const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth * sc), H = Math.round(img.naturalHeight * sc);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    return g.getImageData(0, 0, W, H);
  };

  // A screenshot with 4 pale tiles is the module keypad; anything else is a reference grid
  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);
    try {
      const imgData = readImageData(img);
      const probe = syReadModule(imgData);
      if (probe.tiles >= 4) {
        setButtons(prev => prev.map((k, i) => probe.buttons[i] || k));
        const got = probe.buttons.filter(Boolean).length;
        setStatus({
          text: got === 4 ? 'Module read: all 4 buttons detected.' : `Module: only ${got}/4 buttons detected. Pick the missing ones by hand.`,
          ok: got === 4
        });
        showToast(`MODULE READ: ${got}/4 BUTTONS ✓`);
      } else {
        const r = syReadGrids(imgData);
        if (r.cells > 0) {
          setGrids(prev => {
            let slot = prev.findIndex(g => !g);
            if (slot < 0) slot = 2;
            return prev.map((g, i) => (i === slot ? { ...r, url: dataUri } : g));
          });
          setStatus({ text: `Grid read: ${r.cells} cells counted (${r.grids} grid(s)). Check the counts below.`, ok: true });
          showToast(`GRID READ: ${r.cells} CELLS COUNTED ✓`);
        } else {
          setStatus({ text: 'Could not detect symbols in that image.', ok: false });
          showToast('COULD NOT DETECT SYMBOLS');
        }
      }
    } catch (e) {
      setStatus({ text: 'Could not read that image — set symbols below.', ok: false });
    }
  };

  const handleClear = () => {
    setButtons([null, null, null, null]);
    setGrids([null, null, null]);
    setAdj({});
    setStatus({ text: '', ok: null });
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

  const stampStats = order.length === 4
    ? `ALL 4 BUTTONS RESOLVED | PRESS ORDER: ${copyFormatted}`
    : `RESOLVED: ${validButtons.length}/4 BUTTONS`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🔣 Ω Ѣ © Ψ"
              title="Click here, then paste screenshot of symbols keypad or grid"
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
        >
          {status.text && (
            <div className={`module-hint ${status.ok === false ? 'bad' : 'ok'}`}>{status.text}</div>
          )}
          {grids.some(Boolean) && (
            <div className="sy-grid-thumbs">
              {grids.map((g, i) => g && (
                <div key={i} className="shot-card">
                  <img src={g.url} alt={`grid ${i + 1}`} />
                  <div className="shot-card-tag">GRID {i + 1}</div>
                  <div className="shot-card-meta">{g.cells} cells</div>
                  <button type="button" className="bg-btn" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => removeGrid(i)}>remove</button>
                </div>
              ))}
            </div>
          )}
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="SYMBOLS BUTTON PRESS ORDER"
          stats={stampStats}
          answers={order.length === 4 ? order.map(r => `${r.n}`) : []}
          copyValue={copyFormatted}
          placeholder="SELECT ALL 4 SYMBOLS"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="SYMBOLS KEYPAD WORKSPACE — Select symbols and adjust occurrence counts"
        >
          <SymbolsWorking
            buttons={buttons}
            counts={counts}
            order={order}
            onButtonSelect={handleButtonSelect}
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
  sub: 'Paste the module keypad screenshot and up to 3 reference-grid screenshots (or pick symbols / adjust counts by hand). Sorts the 4 buttons by occurrence count to give the <b>exact button press order</b> and copies it to your clipboard!',
  Component: SymbolsModule
};
