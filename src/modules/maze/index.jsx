import React, { useState, useEffect } from 'react';
import { MAZE_SIZE, solveMazeBFS } from './mazeSolver.js';
import { detectMazeDots, isDotsImage } from './mazeVision.js';
import { loadMazeManual, mazeManualStore, useMazeManual } from './mazeStrip.js';
import { useInstance } from '../../core/InstanceContext.jsx';
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

const BLANK_WALLS = Array.from({ length: 8 }, () =>
  Array.from({ length: 8 }, () => ({ u: false, d: false, l: false, r: false }))
);

export function MazeModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  // Several Maze cards share one manual strip: card #n solves on maze #n of it
  const inst = useInstance();
  const myIndex = inst ? inst.index : 0;
  const { mazes } = useMazeManual();
  const myMaze = mazes[myIndex] || null;
  const wallsGrid = myMaze ? myMaze.grid : BLANK_WALLS;
  const wallsLoaded = Boolean(myMaze);

  const [startPos, setStartPos] = useState({ r: 0, c: 0 });
  const [goalPos, setGoalPos] = useState({ r: 7, c: 7 });
  const [dotsLoaded, setDotsLoaded] = useState(false);
  const [tapSets, setTapSets] = useState('start'); // what a tap / left-click on the board moves
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Solve BFS
  // Only solve once both the walls and the start/goal dots are known (matches original behaviour)
  const ready = wallsLoaded && dotsLoaded;
  const rawPath = ready ? solveMazeBFS(wallsGrid, startPos, goalPos) : null;
  const path = rawPath || [];
  const moves = path.map(p => p.move).join('');
  // The game is played with W A S D, so that is the answer that gets copied
  const WASD = { U: 'W', L: 'A', D: 'S', R: 'D' };
  const wasd = moves.split('').map(m => WASD[m] || m).join('');
  const placeholder = !wallsLoaded && !dotsLoaded
    ? 'PASTE MANUAL STRIP & SCREENSHOT'
    : !wallsLoaded
    ? `NEED MANUAL (MAZE #${myIndex + 1})`
    : !dotsLoaded
    ? 'NEED DEFUSER SCREENSHOT'
    : (startPos.r === goalPos.r && startPos.c === goalPos.c)
    ? 'START = GOAL'
    : 'NO PATH FOUND — CHECK WALLS';

  useEffect(() => {
    const fresh = answerChanged(wasd); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(wasd);
    if (copyOnDecode && fresh && wasd) {
      copy(wasd);
    }
  }, [wasd, isActive]);

  const readDots = (img) => {
    const dots = detectMazeDots(img);
    if (dots.startPos) setStartPos(dots.startPos);
    if (dots.goalPos) setGoalPos(dots.goalPos);
    setDotsLoaded(true);
  };

  // The defuser's screenshot (red/yellow dots) is this card's; anything else is the manual —
  // a strip fills every card (maze #n → card #n), a single maze fills this card.
  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    if (isDotsImage(img)) {
      setPreviewUri(dataUri);
      setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
      readDots(img);
      showToast(`MAZE #${myIndex + 1}: DOTS DETECTED ✓`);
      return;
    }
    let n = 0;
    try { n = loadMazeManual(img, myIndex); } catch (e) { n = 0; }
    if (!n) { showToast('COULD NOT READ THAT MAZE IMAGE'); return; }
    if (n === 1) { showToast(`MAZE #${myIndex + 1}: WALLS LOADED ✓`); return; }
    const room = inst && inst.grow ? inst.grow(n) : (inst ? inst.count : 1);
    showToast(n > room
      ? `MANUAL: ${n} MAZES — ONLY ${room} CARD${room > 1 ? 'S' : ''} HERE`
      : `MANUAL: ${n} MAZES — ONE PER CARD ✓`);
  };

  const handleSample = () => {
    mazeManualStore.setOne(myIndex, { grid: SAMPLE_MAZE_WALLS, count: 0, fallback: false, thumb: null });
    setStartPos({ r: 0, c: 0 });
    setGoalPos({ r: 7, c: 7 });
    setDotsLoaded(true);
    showToast('SAMPLE MAZE LOADED ✓');
  };

  // Clears this card's screenshot; the manual strip is shared (cleared from the bar on top)
  const handleClear = () => {
    setStartPos({ r: 0, c: 0 });
    setGoalPos({ r: 7, c: 7 });
    setDotsLoaded(false);
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('MAZE SCREENSHOT CLEARED ✓');
  };

  const copyItems = [];
  if (moves) {
    copyItems.push({ label: `WASD (${wasd})`, value: wasd });
    copyItems.push({ label: `U/D/L/R (${moves})`, value: moves });
    const arrowMoves = moves.split('').map(m => (m === 'U' ? '↑' : m === 'D' ? '↓' : m === 'L' ? '←' : '→')).join(' ');
    copyItems.push({ label: `ARROWS (${arrowMoves})`, value: arrowMoves });
  }

  const stampStats = `STEPS: ${path.length} | START: (${startPos.r + 1},${startPos.c + 1}) | GOAL: (${goalPos.r + 1},${goalPos.c + 1})`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🧩 🔴 🟡"
              title="Click here, then paste the defuser's screenshot"
              sub={<>red dot = start, yellow dot = goal · the manual strip can be pasted or dropped <b>anywhere</b> — maze #n goes to card #n</>}
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
          <div className="maze-status-row">
            <span className={`maze-status-tag ${wallsLoaded ? 'ok' : ''}`}>
              {wallsLoaded ? `WALLS: MANUAL MAZE #${myIndex + 1} ✓` : `WALLS: waiting for the manual (maze #${myIndex + 1})`}
            </span>
            <span className={`maze-status-tag ${dotsLoaded ? 'ok' : ''}`}>
              {dotsLoaded ? 'DOTS ✓' : 'DOTS: waiting for the defuser screenshot'}
            </span>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="SOLVED MAZE (WASD)"
          stats={stampStats}
          answers={wasd ? wasd.split('') : []}
          copyValue={wasd}
          placeholder={placeholder}
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
            tapSets={tapSets}
            onTapSets={setTapSets}
            onCellLeftClick={(r, c) => { (tapSets === 'goal' ? setGoalPos : setStartPos)({ r, c }); setDotsLoaded(true); }}
            onCellRightClick={(r, c) => { setGoalPos({ r, c }); setDotsLoaded(true); }}
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
  sub: 'Paste or drop the <b>manual strip</b> anywhere — one image for every maze, any number stacked; maze #n is solved on card #n. Then paste the <b>defuser\'s screenshot</b> (red dot = start, yellow = goal) on each card. Shortest path by BFS, copied as directions (e.g. <code>DSSDW</code>).',
  Component: MazeModule
};
