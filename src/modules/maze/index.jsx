import React, { useState, useEffect } from 'react';
import { MAZE_SIZE, solveMazeBFS } from './mazeSolver.js';
import { detectMazeWalls, detectMazeDots, isDotsImage } from './mazeVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { MazeWorking } from './working.jsx';

export const SAMPLE_MAZE_WALLS = [
  [{u:true,d:true,l:true,r:false},{u:true,d:true,l:false,r:false},{u:true,d:true,l:false,r:false},{u:true,d:false,l:false,r:true},{u:true,d:false,l:false,r:false},{u:true,d:false,l:false,r:false},{u:true,d:false,l:false,r:true},{u:true,d:false,l:false,r:true}],
  [{u:false,d:false,l:true,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:true},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:true},{u:false,d:false,l:false,r:true},{u:false,d:true,l:false,r:false},{u:false,d:false,l:false,r:true}],
  [{u:false,d:false,l:true,r:true},{u:false,d:true,l:false,r:false},{u:false,d:false,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:true},{u:false,d:false,l:false,r:false},{u:false,d:true,l:false,r:true}],
  [{u:false,d:true,l:true,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:true},{u:false,d:false,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:false,l:false,r:true},{u:false,d:true,l:false,r:false},{u:false,d:false,l:false,r:true}],
  [{u:false,d:false,l:true,r:false},{u:false,d:true,l:false,r:false},{u:false,d:false,l:false,r:true},{u:false,d:false,l:false,r:true},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:true},{u:false,d:false,l:false,r:true}],
  [{u:false,d:false,l:true,r:false},{u:false,d:false,l:false,r:true},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:true},{u:false,d:false,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:true}],
  [{u:false,d:false,l:true,r:true},{u:false,d:false,l:false,r:true},{u:false,d:false,l:false,r:false},{u:false,d:false,l:false,r:true},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:false,l:false,r:true}],
  [{u:false,d:true,l:true,r:true},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:true},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:false},{u:false,d:true,l:false,r:true}]
];

export function MazeModule({ isActive = true }) {
  const uid = React.useId();
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [wallsGrid, setWallsGrid] = useState(() =>
    Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => ({ u: false, d: false, l: false, r: false }))
    )
  );
  const [startPos, setStartPos] = useState({ r: 0, c: 0 });
  const [goalPos, setGoalPos] = useState({ r: 7, c: 7 });
  const [wallsLoaded, setWallsLoaded] = useState(false);
  const [dotsLoaded, setDotsLoaded] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Solve BFS
  const path = solveMazeBFS(wallsGrid, startPos, goalPos) || [];
  const moves = path.map(p => p.move).join('');

  useEffect(() => {
    if (!isActive) return;
    setLastCopyString(moves);
    if (copyOnDecode && moves) {
      copy(moves);
    }
  }, [moves, isActive]);

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    const isDots = isDotsImage(img);
    if (isDots) {
      const dots = detectMazeDots(img);
      if (dots.startPos) setStartPos(dots.startPos);
      if (dots.goalPos) setGoalPos(dots.goalPos);
      setDotsLoaded(true);
      showToast('MAZE DOTS DETECTED ✓');
    } else {
      const walls = detectMazeWalls(img);
      setWallsGrid(walls);
      setWallsLoaded(true);
      showToast('MAZE WALLS DETECTED ✓');
    }
  };

  const loadUpload = (e, kind) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (kind === 'walls') {
        setWallsGrid(detectMazeWalls(img));
        setWallsLoaded(true);
        showToast('MAZE WALLS DETECTED ✓');
      } else {
        const dots = detectMazeDots(img);
        if (dots.startPos) setStartPos(dots.startPos);
        if (dots.goalPos) setGoalPos(dots.goalPos);
        setDotsLoaded(true);
        showToast(dots.startPos || dots.goalPos ? 'MAZE DOTS DETECTED ✓' : 'NO DOTS FOUND — CLICK CELLS TO SET');
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); showToast('COULD NOT LOAD IMAGE'); };
    img.src = url;
  };
  const handleWallsUpload = (e) => loadUpload(e, 'walls');
  const handleDotsUpload = (e) => loadUpload(e, 'dots');

  const handleSample = () => {
    setWallsGrid(SAMPLE_MAZE_WALLS);
    setStartPos({ r: 0, c: 0 });
    setGoalPos({ r: 7, c: 7 });
    setWallsLoaded(true);
    setDotsLoaded(true);
    showToast('SAMPLE MAZE LOADED ✓');
  };

  const handleClear = () => {
    setWallsGrid(Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => ({ u: false, d: false, l: false, r: false }))
    ));
    setStartPos({ r: 0, c: 0 });
    setGoalPos({ r: 7, c: 7 });
    setWallsLoaded(false);
    setDotsLoaded(false);
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('MAZE CLEARED ✓');
  };

  const copyItems = [];
  if (moves) {
    copyItems.push({ label: `COPY FULL PATH (${moves})`, value: moves });
    const arrowMoves = moves.split('').map(m => (m === 'U' ? '↑' : m === 'D' ? '↓' : m === 'L' ? '←' : '→')).join(' ');
    copyItems.push({ label: `ARROWS (${arrowMoves})`, value: moves });
  }

  const stampStats = `STEPS: ${path.length} | START: (${startPos.r + 1},${startPos.c + 1}) | GOAL: (${goalPos.r + 1},${goalPos.c + 1})`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🧩 ⬆ ➡ ⬇ ⬅"
              title="Click here, then paste Walls or Dots image"
              sub="Drag & drop or paste maze walls screenshot, then dots screenshot"
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
                ⚡ LOAD SAMPLE MAZE
              </button>
            </>
          }
        >
          <div className="maze-config" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            <div className="maze-upload-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div className="maze-upload-card" style={{ flex: 1, minWidth: '220px' }}>
                <span className="maze-upload-card-title">1. MAZE WALLS IMAGE:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <label className="upload-btn" htmlFor={`${uid}-walls`}>UPLOAD WALLS</label>
                  <input type="file" id={`${uid}-walls`} accept="image/*" style={{ display: 'none' }} onChange={handleWallsUpload} />
                  <span className="maze-status-tag">{wallsLoaded ? 'Walls Loaded ✓' : 'No walls image'}</span>
                </div>
              </div>
              <div className="maze-upload-card" style={{ flex: 1, minWidth: '220px' }}>
                <span className="maze-upload-card-title">2. DOTS / POSITIONS IMAGE:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <label className="upload-btn" htmlFor={`${uid}-dots`}>UPLOAD DOTS</label>
                  <input type="file" id={`${uid}-dots`} accept="image/*" style={{ display: 'none' }} onChange={handleDotsUpload} />
                  <span className="maze-status-tag">{dotsLoaded ? 'Dots Loaded ✓' : 'No dots image'}</span>
                </div>
              </div>
            </div>
                    </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="SOLVED MAZE DIRECTIONS"
          stats={stampStats}
          answers={moves ? moves.split('') : []}
          copyValue={moves}
          placeholder={wallsLoaded ? 'NO PATH — CHECK WALLS / START / GOAL' : 'UPLOAD WALLS & DOTS'}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title={`MAZE BOARD (8×8) — Red=Start (${startPos.r + 1},${startPos.c + 1}), Yellow=Goal (${goalPos.r + 1},${goalPos.c + 1})`}
        >
          <MazeWorking
            wallsGrid={wallsGrid}
            startPos={startPos}
            goalPos={goalPos}
            foundPath={path}
            onCellLeftClick={(r, c) => setStartPos({ r, c })}
            onCellRightClick={(r, c) => setGoalPos({ r, c })}
          />
        </WorkingPanel>
      }
    />
  );
}

export const mazeModule = {
  id: 'maze',
  tabId: 'tabMaze',
  tabLabel: '🧩 MAZE (8×8)',
  eyebrow: 'MAZE SOLVER',
  title: 'Maze Vision',
  sub: 'Upload 1 or 2 screenshots: the <b>Maze walls</b> image and the <b>Dots / positions</b> image. Solves shortest path via BFS and automatically copies directions (e.g. <code>R D D R U</code>) to your clipboard!',
  Component: MazeModule
};
