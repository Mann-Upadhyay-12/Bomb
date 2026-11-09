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
  const [counts, setCounts] = useState({});
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
    setCounts(prev => ({
      ...prev,
      [symbolKey]: Math.max(0, (prev[symbolKey] || 0) + delta)
    }));
  };

  const handleSample = () => {
    // Pick 4 diverse sample symbols and sample counts
    const sampleKeys = ['balloon', 'at', 'squidknife', 'copyright'];
    setButtons(sampleKeys);
    setCounts({ balloon: 3, at: 1, squidknife: 5, copyright: 2 });
    showToast('SAMPLE SYMBOLS LOADED ✓');
  };

  const handleClear = () => {
    setButtons([null, null, null, null]);
    setCounts({});
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
              onImage={(img, dataUri, fileBlob) => {
                setPreviewUri(dataUri);
                setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
                setLastImage(img, fileBlob);

                try {
                  const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
                  const W = Math.round(img.naturalWidth * sc), H = Math.round(img.naturalHeight * sc);
                  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
                  const g = cv.getContext('2d', { willReadFrequently: true });
                  g.drawImage(img, 0, 0, W, H);
                  const imgData = g.getImageData(0, 0, W, H);

                  const probe = syReadModule(imgData);
                  if (probe.tiles >= 4) {
                    const next = [...buttons];
                    probe.buttons.forEach((k, i) => { if (k) next[i] = k; });
                    setButtons(next);
                    showToast(`MODULE READ: ${probe.buttons.filter(Boolean).length}/4 BUTTONS ✓`);
                  } else {
                    const r = syReadGrids(imgData);
                    if (r.cells > 0) {
                      setCounts(prev => {
                        const updated = { ...prev };
                        for (const [k, v] of Object.entries(r.counts)) {
                          updated[k] = (updated[k] || 0) + v;
                        }
                        return updated;
                      });
                      showToast(`GRID READ: ${r.cells} CELLS COUNTED ✓`);
                    } else {
                      showToast('COULD NOT DETECT SYMBOLS');
                    }
                  }
                } catch (e) {
                  showToast('IMAGE LOADED — SET SYMBOLS BELOW');
                }
              }}
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
        />
      }
      answers={
        <AnswerPanel
          label="SYMBOLS BUTTON PRESS ORDER"
          stats={stampStats}
          answers={order.length === 4 ? order.map(r => `Button ${r.n}`) : []}
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
  sub: 'Select the 4 symbols on the module keypad. Automatically sorts by occurrence counts across reference grids to determine the <b>exact button press order</b> and copy to clipboard!',
  Component: SymbolsModule
};
