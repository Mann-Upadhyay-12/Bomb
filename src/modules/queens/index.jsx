import React, { useState } from 'react';
import { solveQueensPuzzle } from './queensSolver.js';
import { parseQueensRegionsFromImage } from './queensVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { QueensWorking } from './working.jsx';

export function QueensModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [regionGrid, setRegionGrid] = useState([]);
  const [queensMap, setQueensMap] = useState([]);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    const parsedRegions = parseQueensRegionsFromImage(img);
    setRegionGrid(parsedRegions);

    const solutions = solveQueensPuzzle(parsedRegions);
    const newMap = Array.from({ length: 8 }, () => Array(8).fill(false));
    if (solutions && solutions.length > 0) {
      const sol = solutions[0];
      for (let r = 0; r < 8; r++) {
        newMap[r][sol[r]] = true;
      }
    }
    setQueensMap(newMap);

    const coords = [];
    for (let c = 0; c < 8; c++) {
      for (let r = 0; r < 8; r++) {
        if (newMap[r][c]) coords.push(String.fromCharCode(65 + c) + (r + 1));
      }
    }
    const lastCopy = coords.join(' ');

    if (isActive) {
      setLastCopyString(lastCopy);

      if (copyOnDecode && coords.length === 8) {
        copy(lastCopy);
      }
    }
  };

  const handleSample = () => {
    const sampleRegions = [
      [0, 0, 1, 1, 1, 2, 2, 2],
      [0, 0, 0, 1, 1, 2, 2, 2],
      [3, 0, 0, 1, 4, 4, 2, 5],
      [3, 3, 0, 4, 4, 4, 5, 5],
      [3, 3, 6, 6, 4, 4, 5, 5],
      [3, 6, 6, 6, 6, 7, 7, 5],
      [6, 6, 6, 6, 7, 7, 7, 7],
      [6, 6, 6, 7, 7, 7, 7, 7]
    ];
    setRegionGrid(sampleRegions);
    const solutions = solveQueensPuzzle(sampleRegions);
    const newMap = Array.from({ length: 8 }, () => Array(8).fill(false));
    if (solutions && solutions.length > 0) {
      const sol = solutions[0];
      for (let r = 0; r < 8; r++) {
        newMap[r][sol[r]] = true;
      }
    }
    setQueensMap(newMap);
    const resolvedCoords = [];
    for (let c = 0; c < 8; c++) {
      for (let r = 0; r < 8; r++) {
        if (newMap[r][c]) resolvedCoords.push(String.fromCharCode(65 + c) + (r + 1));
      }
    }
    const lastCopy = resolvedCoords.join(' ');
    setLastCopyString(lastCopy);
    if (copyOnDecode && resolvedCoords.length === 8) copy(lastCopy);
    showToast('SAMPLE QUEENS BOARD LOADED ✓');
  };

  const handleReset = () => {
    setRegionGrid([]);
    setQueensMap([]);
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('QUEENS CLEARED ✓');
  };

  const handleCellToggle = (r, c) => {
    const updatedMap = queensMap.map((row, ri) =>
      row.map((cell, ci) => (ri === r && ci === c ? !cell : cell))
    );
    setQueensMap(updatedMap);

    const coords = [];
    for (let col = 0; col < 8; col++) {
      for (let row = 0; row < 8; row++) {
        if (updatedMap[row][col]) coords.push(String.fromCharCode(65 + col) + (row + 1));
      }
    }
    const lastCopy = coords.join(' ');
    setLastCopyString(lastCopy);
  };

  const coords = [];
  if (queensMap.length) {
    for (let c = 0; c < 8; c++) {
      for (let r = 0; r < 8; r++) {
        if (queensMap[r][c]) coords.push(String.fromCharCode(65 + c) + (r + 1));
      }
    }
  }

  const copyItems = [];
  if (coords.length > 0) {
    copyItems.push({
      label: `COPY ALL QUEENS (${coords.length})`,
      value: coords.join(' ')
    });
    coords.forEach(coord => {
      copyItems.push({ label: `👑 ${coord}`, value: coord });
    });
  }

  const stampStats = `QUEENS: ${coords.length} / 8`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="👑 🟧 🟩 🟪 🟦"
              title="Click here, then paste a Queens board screenshot"
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
              <button className="reset-btn" type="button" onClick={handleReset}>
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
          label="SOLVED QUEEN COORDINATES"
          stats={stampStats}
          answers={coords.length ? coords.map(c => `👑 ${c}`) : []}
          copyValue={coords.join(' ')}
          placeholder={regionGrid.length ? 'NO QUEENS PLACED' : '— — —'}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="QUEENS BOARD — 8 detected regions; click cell to toggle queen"
        >
          <QueensWorking
            regionGrid={regionGrid}
            queensMap={queensMap}
            onCellToggle={handleCellToggle}
          />
        </WorkingPanel>
      }
    />
  );
}

export const queensModule = {
  id: 'queens',
  tabId: 'tabQueens',
  tabLabel: '👑 QUEENS (8×8)',
  eyebrow: 'QUEENS REGION SOLVER',
  title: 'Queens Vision',
  sub: 'Upload or paste an image of the 8×8 Queens board with colored regions. It automatically detects the 8 regions, solves 8-Queens placement, and copies coordinates to your clipboard!',
  Component: QueensModule
};
