import React, { useState, useEffect, useRef } from 'react';
import { MINES_ROWS, MINES_COLS, solveMinesGrid } from './minesSolver.js';
import { parseMinesBoardFromImage } from './minesVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { MinesWorking } from './working.jsx';

export function MinesModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, lastImg, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [gridData, setGridData] = useState([]);
  const [iteration, setIteration] = useState(0);
  const [prevSafeSet, setPrevSafeSet] = useState(new Set());
  const [currentSafeSet, setCurrentSafeSet] = useState(new Set());
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Process image when supplied
  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    let nextPrev = new Set(prevSafeSet);
    let nextIter = iteration;

    if (nextIter === 0) {
      nextIter = 1;
      nextPrev.clear();
    } else {
      currentSafeSet.forEach(s => nextPrev.add(s));
      nextIter++;
    }

    const parsedGrid = parseMinesBoardFromImage(img);
    runSolve(parsedGrid, nextPrev, nextIter);
  };

  const runSolve = (grid, prevSet, currentIter) => {
    if (!grid || !grid.length) return;
    const { safeList, mineList } = solveMinesGrid(grid);

    const newSafeList = safeList.filter(n => !prevSet.has(n));
    newSafeList.sort((a, b) => {
      const ca = a[0], cb = b[0], ra = parseInt(a.slice(1)), rb = parseInt(b.slice(1));
      return ca !== cb ? ca.localeCompare(cb) : ra - rb;
    });

    const newSet = new Set(newSafeList);
    setGridData([...grid]);
    setPrevSafeSet(prevSet);
    setCurrentSafeSet(newSet);
    setIteration(currentIter);

    if (isActive) {
      const copyString = newSafeList.join(' ');
      setLastCopyString(copyString);

      if (copyOnDecode && copyString) {
        copy(copyString);
      }
    }
  };

  // Reset actions
  const resetRound = (clearBoard = false) => {
    if (clearBoard) {
      setGridData([]);
      setIteration(0);
      setPrevSafeSet(new Set());
      setCurrentSafeSet(new Set());
      setPreviewUri('');
      setPreviewMeta('');
      setLastImage(null, null);
      setLastCopyString('');
      showToast('BOARD & HISTORY CLEARED ✓');
    } else {
      if (gridData.length > 0) {
        const clearedPrev = new Set();
        setIteration(1);
        runSolve(gridData, clearedPrev, 1);
        showToast('ROUND RESET — HISTORY CLEARED ✓');
      } else {
        setIteration(0);
        setPrevSafeSet(new Set());
        setCurrentSafeSet(new Set());
        setLastCopyString('');
        showToast('HISTORY CLEARED ✓');
      }
    }
  };

  // Sample Mines board
  const handleSample = () => {
    const sampleBoard = Array.from({ length: MINES_ROWS }, (_, r) =>
      Array.from({ length: MINES_COLS }, (_, c) => ({
        r,
        c,
        name: String.fromCharCode(65 + c) + (r + 1),
        state: '#',
        isSafe: false,
        isMine: false
      }))
    );
    sampleBoard[3][3].state = 0;
    sampleBoard[3][4].state = 1;
    sampleBoard[3][5].state = 1;
    sampleBoard[4][3].state = 1;
    sampleBoard[4][4].state = 1;
    sampleBoard[4][5].state = 2;
    sampleBoard[2][3].state = 0;
    sampleBoard[2][4].state = 0;
    sampleBoard[2][5].state = 1;
    setIteration(1);
    runSolve(sampleBoard, new Set(), 1);
    showToast('SAMPLE MINES GRID LOADED ✓');
  };

  // Cell cycling
  const handleCellClick = (r, c) => {
    const cycle = ['#', 'F', 0, 1, 2, 3, 4, 5, 6, 7, 8];
    const newGrid = gridData.map(row => row.map(cell => ({ ...cell })));
    const cell = newGrid[r][c];
    cell.state = cycle[(cycle.indexOf(cell.state) + 1) % cycle.length];
    runSolve(newGrid, prevSafeSet, iteration || 1);
  };

  // Copy all current safe
  const copyAllCurrentSafe = () => {
    if (!gridData.length) return;
    const allSafe = [];
    for (let r = 0; r < MINES_ROWS; r++) {
      for (let c = 0; c < MINES_COLS; c++) {
        if (gridData[r][c].isSafe) allSafe.push(gridData[r][c].name);
      }
    }
    allSafe.sort((a, b) => {
      const ca = a[0], cb = b[0], ra = parseInt(a.slice(1)), rb = parseInt(b.slice(1));
      return ca !== cb ? ca.localeCompare(cb) : ra - rb;
    });
    if (allSafe.length) {
      copy(allSafe.join(' '));
      showToast('ALL SAFE COPIED ✓');
    } else {
      showToast('NO SAFE SQUARES FOUND');
    }
  };

  const newSafeArray = Array.from(currentSafeSet);
  const allKnownSet = new Set([...prevSafeSet, ...currentSafeSet]);
  const sortedAllKnown = Array.from(allKnownSet).sort((a, b) => {
    const ca = a[0], cb = b[0], ra = parseInt(a.slice(1)), rb = parseInt(b.slice(1));
    return ca !== cb ? ca.localeCompare(cb) : ra - rb;
  });

  const curRound = iteration || 1;
  const stampTitle = curRound > 1 ? `NEW SAFE SQUARES (ROUND #${curRound})` : 'GUARANTEED SAFE SQUARES';
  const stampStats = `NEW: ${newSafeArray.length} SAFE | TOTAL: ${allKnownSet.size} | MINES: ${
    gridData.flat().filter(c => c.isMine).length
  } (ROUND #${curRound})`;

  // Build copy lines items
  const copyItems = [];
  if (newSafeArray.length > 0) {
    copyItems.push({
      label: `COPY NEW SAFE (${newSafeArray.length})`,
      value: newSafeArray.join(' ')
    });
    newSafeArray.forEach(sq => {
      copyItems.push({ label: sq, value: sq });
    });
  }
  if (sortedAllKnown.length > 0) {
    copyItems.push({
      label: `COPY ALL KNOWN (${sortedAllKnown.length})`,
      value: sortedAllKnown.join(' ')
    });
  }

  const legend = (
    <div className="legend" style={{ display: 'flex' }}>
      <div className="legend-item"><div className="legend-box new-safe"></div> New Safe</div>
      <div className="legend-item"><div className="legend-box prev-safe"></div> Known Safe</div>
      <div className="legend-item"><div className="legend-box mine"></div> Mine</div>
      <div className="legend-item"><div className="legend-box cov"></div> Covered</div>
    </div>
  );

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="💣 🚩 1 2 3"
              title="Click here, then paste an image"
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
              <button className="reset-btn" type="button" onClick={() => resetRound(true)}>
                clear
              </button>
              <button
                className="reset-btn"
                type="button"
                style={{ borderColor: 'var(--brass)', color: 'var(--brass)', fontWeight: 600 }}
                title="Reset Mines round history for new puzzle"
                onClick={() => resetRound(false)}
              >
                ↺ new round
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
          {/* Mines round config & history stats */}
          <div className="mines-config">
            <div className="mines-stats-row">
              <div className="mines-stat-pill">
                <span className="mines-stat-lbl">STAGE / ITERATION</span>
                <span className="mines-stat-val">ROUND #{curRound}</span>
              </div>
              <div className="mines-stat-pill">
                <span className="mines-stat-lbl">NEW SAFE (THIS STEP)</span>
                <span className="mines-stat-val" style={{ color: '#81C784' }}>{newSafeArray.length}</span>
              </div>
              <div className="mines-stat-pill">
                <span className="mines-stat-lbl">TOTAL VISITED / KNOWN</span>
                <span className="mines-stat-val">{allKnownSet.size}</span>
              </div>
            </div>

            <div className="mines-history-wrap">
              <div className="search-config-label">SOLVED SQUARES HISTORY:</div>
              <div className="mines-history-tags">
                {sortedAllKnown.length === 0 ? (
                  <span className="mines-empty-lbl">No squares recorded yet — upload or paste screenshot</span>
                ) : (
                  sortedAllKnown.map(name => {
                    const isNew = currentSafeSet.has(name);
                    return (
                      <span key={name} className={`mines-tag ${isNew ? 'new' : 'past'}`}>
                        {name}{isNew ? ' ★' : ''}
                      </span>
                    );
                  })
                )}
              </div>
            </div>

            <div className="search-btn-row">
              <button
                type="button"
                className="bg-btn"
                style={{ borderColor: 'var(--brass)', color: 'var(--brass)', fontWeight: 700 }}
                onClick={() => resetRound(false)}
              >
                🔄 RESET ROUND (CLEAR HISTORY)
              </button>
              <button type="button" className="bg-btn" onClick={() => resetRound(true)}>
                🗑️ CLEAR BOARD
              </button>
              <button
                type="button"
                className="bg-btn"
                title="Copy all guaranteed safe squares on current board"
                onClick={copyAllCurrentSafe}
              >
                📋 COPY ALL CURRENT SAFE
              </button>
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label={stampTitle}
          stats={stampStats}
          answers={newSafeArray}
          copyValue={newSafeArray.join(' ')}
          placeholder={gridData.length ? 'NO NEW SAFE SQUARES' : '— — —'}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="DETECTED BOARD — click any cell to edit number/flag"
          legend={legend}
        >
          <MinesWorking
            gridData={gridData}
            prevSafeSet={prevSafeSet}
            onCellClick={handleCellClick}
          />
        </WorkingPanel>
      }
    />
  );
}

// Module descriptor for router
export const minesModule = {
  id: 'mines',
  tabId: 'tabMines',
  tabLabel: '💣 MINES (8×10)',
  eyebrow: 'MINESWEEPER LOGIC SOLVER',
  title: 'Bomb Vision',
  sub: 'Upload or paste an image of an 8×10 Minesweeper board (8 rows × 10 columns). It detects the grid, calculates <b>100% guaranteed safe squares</b>, and automatically copies the result (e.g. <code>A5 C4 H1 H2</code>) to your clipboard!',
  Component: MinesModule
};
