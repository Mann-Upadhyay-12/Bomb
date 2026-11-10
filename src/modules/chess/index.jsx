import React, { useState, useEffect } from 'react';
import {
  startEngine,
  stopEngineListener,
  askEngine,
  SUPERSEDED,
  toFen,
  parseFen
} from './chessEngine.js';
import {
  imageToData,
  findBoards,
  readBoard,
  detectBoardColor
} from './chessVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { ChessWorking } from './working.jsx';

export function ChessModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [merged, setMerged] = useState(() => Array(64).fill(''));
  const [whiteBoard, setWhiteBoard] = useState(() => Array(64).fill(''));
  const [blackBoard, setBlackBoard] = useState(() => Array(64).fill(''));
  const [bestMove, setBestMove] = useState('');
  const [engineStatus, setEngineStatus] = useState('Engine offline');
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  const [activeTarget, setActiveTarget] = useState('white');
  const engineOwner = React.useId(); // this window's searches only replace each other
  // the engine answers asynchronously, so read the latest tab state rather than the one captured at call time
  const activeRef = React.useRef(isActive);
  activeRef.current = isActive;

  useEffect(() => {
    const onStatus = statusText => setEngineStatus(statusText);
    startEngine(onStatus);
    return () => stopEngineListener(onStatus);
  }, []);

  const solvePosition = async (positionArray = merged) => {
    const wKings = positionArray.filter(p => p === 'K').length;
    const bKings = positionArray.filter(p => p === 'k').length;
    if (wKings !== 1 || bKings !== 1) {
      const msg = (wKings !== 1 ? 'White King (♔) missing.' : '') + (bKings !== 1 ? ' Black King (♚) missing.' : '');
      setEngineStatus(`⚠️ ${msg}`);
      setBestMove('');
      return;
    }

    const fen = toFen(positionArray);
    if (!fen) return;
    setEngineStatus('Thinking…');
    try {
      const uci = await askEngine(fen, 3000, ({ depth, cp, mate }) => {
        const e = mate ? `Mate in ${mate}` : `Eval ${(Number(cp) / 100).toFixed(2)}`;
        setEngineStatus(`Thinking… depth ${depth} (${e})`);
      }, engineOwner);
      if (uci === SUPERSEDED) return; // a newer search replaced this one
      if (uci && uci !== '(none)') {
        let san = uci;
        if (typeof window !== 'undefined' && typeof window.Chess !== 'undefined') {
          try {
            const game = new window.Chess(fen);
            const m = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
            if (m) san = m.san;
          } catch (e) {}
        }
        setBestMove(san);
        setEngineStatus('Ready ✓');
        if (activeRef.current) {
          setLastCopyString(san);
          if (copyOnDecode) copy(san);
        }
      } else {
        setBestMove('');
        setEngineStatus(uci === null ? 'Engine unavailable / timed out' : 'No legal move found');
      }
    } catch (err) {
      setBestMove('');
      setEngineStatus('Engine error');
    }
  };

  const mergeAndSolve = (wb, bb) => {
    const nextMerged = Array(64).fill('');
    for (let i = 0; i < 64; i++) {
      nextMerged[i] = wb[i] || bb[i] || '';
    }
    setMerged(nextMerged);
    solvePosition(nextMerged);
  };

  const handleSquareClick = (index, newPiece) => {
    const next = [...merged];
    next[index] = newPiece;
    setMerged(next);
    solvePosition(next);
  };

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    try {
      const { data, W, H } = imageToData(img);
      const found = findBoards(data, W, H);
      if (found && found.length >= 2) {
        // Boards may come in either order — detect which one holds the white pieces
        const firstIsWhite = detectBoardColor(data, W, found[0]) === 'white';
        const bWhite = firstIsWhite ? found[0] : found[1];
        const bBlack = firstIsWhite ? found[1] : found[0];
        const resW = readBoard(data, W, bWhite, 'white');
        const resB = readBoard(data, W, bBlack, 'black');
        setWhiteBoard(resW.pieces);
        setBlackBoard(resB.pieces);
        mergeAndSolve(resW.pieces, resB.pieces);
        showToast('DUAL BOARDS DETECTED ✓');
      } else if (found && found.length === 1) {
        const targetColor = detectBoardColor(data, W, found[0]) || activeTarget;
        const res = readBoard(data, W, found[0], targetColor);
        if (targetColor === 'white') {
          setWhiteBoard(res.pieces);
          mergeAndSolve(res.pieces, blackBoard);
          setActiveTarget('black');
        } else {
          setBlackBoard(res.pieces);
          mergeAndSolve(whiteBoard, res.pieces);
          setActiveTarget('white');
        }
        showToast(`${targetColor.toUpperCase()} BOARD DETECTED ✓`);
      } else {
        const fullRect = { x: 0, y: 0, w: W, h: H };
        const res = readBoard(data, W, fullRect, activeTarget);
        if (activeTarget === 'white') {
          setWhiteBoard(res.pieces);
          mergeAndSolve(res.pieces, blackBoard);
          setActiveTarget('black');
        } else {
          setBlackBoard(res.pieces);
          mergeAndSolve(whiteBoard, res.pieces);
          setActiveTarget('white');
        }
        showToast('BOARD READ (FULL IMAGE) ✓');
      }
    } catch (e) {
      showToast('COULD NOT READ CHESS IMAGE — TWEAK PIECES MANUALLY');
    }
  };

  const handleSamplePuzzle = () => {
    // Scholar's Mate in 1: Qxf7#
    const parsed = parseFen('r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1');
    if (parsed) {
      setMerged(parsed.merged);
      setWhiteBoard(parsed.white);
      setBlackBoard(parsed.black);
      solvePosition(parsed.merged);
      showToast('SAMPLE PUZZLE (MATE IN 1) LOADED ✓');
    }
  };

  const handleSwapColors = () => {
    const swapped = merged.map(p => {
      if (!p) return '';
      return p === p.toUpperCase() ? p.toLowerCase() : p.toUpperCase();
    });
    setMerged(swapped);
    solvePosition(swapped);
    showToast('⇄ SWAPPED WHITE & BLACK ✓');
  };

  const handleClear = () => {
    setMerged(Array(64).fill(''));
    setWhiteBoard(Array(64).fill(''));
    setBlackBoard(Array(64).fill(''));
    setBestMove('');
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('CHESS CLEARED ✓');
  };

  const copyItems = [];
  if (bestMove) {
    copyItems.push({ label: `COPY BEST MOVE (${bestMove})`, value: bestMove });
    const fen = toFen(merged);
    if (fen) copyItems.push({ label: 'COPY FEN', value: fen });
  }

  const stampStats = `ENGINE: ${engineStatus} | PIECES: ${merged.filter(Boolean).length}`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="♔ ♚ ♙ ♟"
              title={`Click here to paste ${activeTarget.toUpperCase()} chessboard screenshot`}
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
                onClick={handleSamplePuzzle}
              >
                ⚡ SAMPLE PUZZLE (Mate in 1)
              </button>
              <button
                className="reset-btn"
                type="button"
                onClick={handleSwapColors}
              >
                ⇄ SWAP COLORS
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="bg-btn"
              style={{ borderColor: 'var(--brass)', color: 'var(--brass)', fontWeight: 700 }}
              onClick={() => solvePosition(merged)}
            >
              ▶ SOLVE BEST MOVE
            </button>
            <button
              type="button"
              className="bg-btn"
              onClick={() => {
                const target = activeTarget === 'white' ? 'black' : 'white';
                setActiveTarget(target);
                showToast(`TARGET: ${target.toUpperCase()} BOARD`);
              }}
            >
              NEXT DROP TARGET: {activeTarget.toUpperCase()} BOARD
            </button>
            <button type="button" className="bg-btn" onClick={handleClear}>
              🗑️ CLEAR BOARD
            </button>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="WHITE'S BEST MOVE (STOCKFISH)"
          stats={stampStats}
          answers={bestMove ? [`♔ ${bestMove}`] : []}
          copyValue={bestMove}
          placeholder="UPLOAD BOARDS OR PLACE PIECES"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="INTERACTIVE 8×8 CHESSBOARD — Click square to adjust piece placement"
        >
          <ChessWorking
            merged={merged}
            onSquareClick={handleSquareClick}
          />
        </WorkingPanel>
      }
    />
  );
}

export const chessModule = {
  id: 'chess',
  tabId: 'tabChess',
  tabLabel: '♔ CHESS (8×8)',
  eyebrow: 'CHESS MODULE SOLVER',
  title: 'Chess Vision',
  sub: 'Upload White board and Black board screenshots or set pieces manually. Automatically combines positions, solves with <b>Stockfish chess engine</b>, and copies the best move!',
  Component: ChessModule
};
