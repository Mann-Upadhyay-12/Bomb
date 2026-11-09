import React, { useState, useRef } from 'react';
import { searchCube } from './cubeSolver.js';
import { detectCubeStickers, POS, sampleMedianRGB, cls } from './cubeVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { CubeWorking } from './working.jsx';

export function CubeModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [cells, setCells] = useState({
    U: Array(9).fill('W'),
    F: Array(9).fill('G'),
    R: Array(9).fill('R')
  });
  const [solution, setSolution] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Each solve gets a token; results from an older (superseded) solve are ignored
  const solveToken = useRef(0);

  const solve = async (currentCells = cells) => {
    const token = ++solveToken.current;
    setSolution('');
    setStatusMsg('Searching solution…');
    const obs = Array(54).fill(null);
    for (let i = 0; i < 9; i++) {
      obs[i] = currentCells.U[i];
      obs[9 + i] = currentCells.R[i];
      obs[18 + i] = currentCells.F[i];
    }

    try {
      const res = await searchCube(obs, 10, () => token === solveToken.current);
      if (token !== solveToken.current || (res && res.cancelled)) return;
      if (res && res.timeout) {
        setSolution('');
        setStatusMsg('SEARCH TIMED OUT — check the sticker colours');
        if (isActive) setLastCopyString('');
        return;
      }
      if (res && res.sols && res.sols.length > 0) {
        const movesStr = res.sols[0];
        setSolution(movesStr);
        setStatusMsg(res.len === 0 ? 'ALREADY SOLVED ✓' : `SOLVED (${res.len} moves)`);
        if (isActive) {
          setLastCopyString(movesStr);
          if (copyOnDecode && movesStr) copy(movesStr);
        }
      } else {
        setSolution('');
        setStatusMsg('NO SOLUTION FOUND (Check face colors)');
        if (isActive) {
          setLastCopyString('');
        }
      }
    } catch (err) {
      if (token !== solveToken.current) return;
      setSolution('');
      setStatusMsg('Error: ' + err.message);
      if (isActive) {
        setLastCopyString('');
      }
    }
  };

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, W, H);

    const b = detectCubeStickers(img, data);
    let geo;
    if (b) {
      const w = b.x1 - b.x0, h = b.y1 - b.y0, V = [(b.x0 + b.x1) / 2, b.y0 + 0.465 * h];
      geo = [V, [V[0] - w / 2, V[1] - 0.233 * h], [V[0] + w / 2, V[1] - 0.233 * h], [V[0], V[1] + 0.52 * h]];
    } else {
      const s = W / 394;
      geo = [[183, 355], [90, 308], [278, 308], [183, 459]].map(p => [p[0] * s, p[1] * s]);
    }

    const [V, L, R, B] = geo;
    const g = {
      V,
      p: [L[0] - V[0], L[1] - V[1]],
      q: [R[0] - V[0], R[1] - V[1]],
      d: [B[0] - V[0], B[1] - V[1]]
    };

    const sampledCells = { U: [], F: [], R: [] };
    const sc = Math.max(W, H) / 300;
    for (const f of ['U', 'F', 'R']) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const [x, y] = POS[f](g, r, c);
          const rgb = sampleMedianRGB(img, data, x, y, sc);
          sampledCells[f].push(cls(...rgb));
        }
      }
    }

    setCells(sampledCells);
    solve(sampledCells);
    showToast('CUBE STICKERS READ ✓');
  };

  const handleCellColorCycle = (face, idx, nextColor) => {
    const nextFace = [...cells[face]];
    nextFace[idx] = nextColor;
    const nextCells = { ...cells, [face]: nextFace };
    setCells(nextCells);
    solve(nextCells);
  };

  const handleSample = () => {
    const sampleCells = {
      U: ['W', 'G', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
      F: ['G', 'R', 'G', 'G', 'G', 'G', 'G', 'G', 'G'],
      R: ['R', 'W', 'R', 'R', 'R', 'R', 'R', 'R', 'R']
    };
    setCells(sampleCells);
    solve(sampleCells);
    showToast('SAMPLE CUBE LOADED & SOLVING ✓');
  };

  const handleClear = () => {
    solveToken.current++;
    const def = {
      U: Array(9).fill('W'),
      F: Array(9).fill('G'),
      R: Array(9).fill('R')
    };
    setCells(def);
    setSolution('');
    setStatusMsg('');
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    if (isActive) {
      setLastCopyString('');
    }
    showToast('CUBE RESET ✓');
  };

  const copyItems = [];
  if (solution) {
    copyItems.push({ label: `COPY MOVES (${solution})`, value: solution });
    solution.split(' ').forEach(m => {
      copyItems.push({ label: m, value: m });
    });
  }

  const movesCount = solution ? solution.split(' ').filter(Boolean).length : 0;
  const stampStats = solution ? `MOVES: ${movesCount} | ALGORITHM: ${solution}` : 'READY';

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🧊 🟩 🟥 ⬜"
              title="Click here, then paste a screenshot of the Rubik's cube"
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
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              className="bg-btn"
              style={{ borderColor: 'var(--brass)', color: 'var(--brass)', fontWeight: 700 }}
              onClick={() => solve(cells)}
            >
              ▶ SOLVE CUBE
            </button>
            <button type="button" className="bg-btn" onClick={handleClear}>
              🗑️ RESET CUBE
            </button>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="RUBIK'S CUBE SOLUTION ALGORITHM"
          stats={stampStats}
          answers={solution ? solution.split(' ') : []}
          copyValue={solution}
          placeholder={statusMsg || 'PRESS SOLVE ▶'}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="CUBE STICKER NET (TOP, FRONT-LEFT, FRONT-RIGHT FACES)"
        >
          <CubeWorking
            cells={cells}
            onCellColorCycle={handleCellColorCycle}
          />
        </WorkingPanel>
      }
    />
  );
}

export const cubeModule = {
  id: 'cube',
  tabId: 'tabCube',
  tabLabel: '🧊 RUBIK\'S CUBE',
  eyebrow: 'RUBIK\'S CUBE SOLVER',
  title: 'Cube Vision',
  sub: 'Upload a screenshot of the Rubik\'s Cube or click the squares to adjust colors. Finds the <b>optimal move sequence</b> to solve the puzzle and copies moves to your clipboard!',
  Component: CubeModule
};
