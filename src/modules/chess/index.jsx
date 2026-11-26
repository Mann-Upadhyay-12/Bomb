import React, { useState, useEffect } from 'react';
import {
  startEngine,
  stopEngineListener,
  askEngine,
  scoreAllMoves,
  SUPERSEDED,
  cancelSearch,
  legalSan,
  toFen,
  parseFen,
  kingInCheck
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
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { ChessWorking } from './working.jsx';
import { useTouchScreen, tapWord } from '../../utils/touch.js';

const SIDE_NAME = { w: 'White', b: 'Black' };
const SIDE_ICON = { w: '♔', b: '♚' };

/** A score as words, from the side that moves: "+1.5", "gets mated in 1". */
const describe = (m) => (m.mate != null
  ? (m.mate < 0 ? `gets mated in ${-m.mate}` : `mates in ${m.mate}`)
  : `${m.cp >= 0 ? '+' : ''}${(m.cp / 100).toFixed(1)}`);

// Never shown: a move that isn't legal on the board that was asked about
const MISFIT = (uci) => `engine answer ${uci} doesn't fit this board — press ▶ SOLVE BEST MOVE again`;

/** Every move scored (worst first) → the blunder: the worst move, plus any scored exactly as badly. */
function blunderOf(fen, list) {
  if (list === null) return { bad: 'engine unavailable / timed out' };
  if (!list.length) return { bad: 'no legal move' };
  const worst = list[0], best = list[list.length - 1];
  const ties = list.filter(m => m.value === worst.value);
  const san = legalSan(fen, worst.uci);
  if (!san) return { bad: MISFIT(worst.uci) };
  return {
    san, uci: worst.uci,
    also: ties.slice(1).map(m => legalSan(fen, m.uci)).filter(Boolean),
    what: describe(worst), bestWhat: describe(best), count: list.length
  };
}

export function ChessModule({ isActive = true }) {
  const touch = useTouchScreen();
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [merged, setMerged] = useState(() => Array(64).fill(''));
  const [whiteBoard, setWhiteBoard] = useState(() => Array(64).fill(''));
  const [blackBoard, setBlackBoard] = useState(() => Array(64).fill(''));
  const [engineStatus, setEngineStatus] = useState('Engine offline');
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  const [activeTarget, setActiveTarget] = useState('white');
  // The module asks for White's OR Black's move: both are solved and shown side by side
  const [moves, setMoves] = useState({}); // { w: { san } | { bad, impossible? }, b: … }
  // …or for White's OR Black's blunder (the worst move): every move is scored, the worst kept
  const [blunders, setBlunders] = useState({}); // { w: { san, uci, also, what, bestWhat, count } | { bad, impossible? }, b: … }
  const inst = useInstance();
  const engineOwner = React.useId(); // this window's searches only replace each other
  // the engine answers asynchronously, so read the latest tab state rather than the one captured at call time
  const activeRef = React.useRef(isActive);
  activeRef.current = isActive;

  useEffect(() => {
    const onStatus = statusText => setEngineStatus(statusText);
    startEngine(onStatus);
    return () => { stopEngineListener(onStatus); cancelSearch(engineOwner); };
  }, []);

  const solvePosition = async (positionArray = merged) => {
    const wKings = positionArray.filter(p => p === 'K').length;
    const bKings = positionArray.filter(p => p === 'k').length;
    if (wKings !== 1 || bKings !== 1) {
      const msg = (wKings !== 1 ? 'White King (♔) missing.' : '') + (bKings !== 1 ? ' Black King (♚) missing.' : '');
      setEngineStatus(`⚠️ ${msg}`);
      setMoves({});
      setBlunders({});
      return;
    }

    const sides = ['w', 'b'];
    const out = {};
    // the side that is NOT to move can't be in check, so a check rules out the other side's move
    for (const s of sides) {
      const other = s === 'w' ? 'b' : 'w';
      if (kingInCheck(positionArray, other)) {
        out[s] = { bad: `${SIDE_NAME[other]} is in check, so it can't be ${SIDE_NAME[s]}'s move`, impossible: true };
      }
    }
    setMoves({ ...out });
    setBlunders({ ...out });
    const todo = sides.filter(s => !out[s]);
    if (!todo.length) {
      setEngineStatus('⚠️ Both kings are in check — a piece was misread, check the board');
      return;
    }

    try {
      for (const s of todo) {
        const fen = toFen(positionArray, s);
        setEngineStatus(`Thinking (${SIDE_NAME[s]} to move)…`);
        const uci = await askEngine(fen, 2500, ({ depth, cp, mate }) => {
          const e = mate ? `Mate in ${mate}` : `Eval ${(Number(cp) / 100).toFixed(2)}`;
          setEngineStatus(`Thinking (${SIDE_NAME[s]} to move)… depth ${depth} (${e})`);
        }, engineOwner);
        if (uci === SUPERSEDED) return; // a newer search replaced this one
        const san = uci && uci !== '(none)' ? legalSan(fen, uci) : null;
        out[s] = san
          ? { san }
          : { bad: uci === null ? 'engine unavailable / timed out' : uci === '(none)' ? 'no legal move' : MISFIT(uci) };
        setMoves({ ...out });
      }
    } catch (err) {
      setEngineStatus('Engine error');
      return;
    }

    // Copied straight away only when one side can be the one to move; otherwise click the side asked for
    const possible = sides.filter(s => !out[s].impossible);
    const one = possible.length === 1 ? possible[0] : null;
    const san = one && out[one].san ? out[one].san : '';
    const ready = san ? `Ready ✓ — only ${SIDE_NAME[one]} can be to move` : one ? `⚠️ ${out[one].bad}` : 'Ready ✓ — click the answer the module asks for to copy it';
    if (activeRef.current) {
      setLastCopyString(san);
      if (san && copyOnDecode) copy(san);
    }

    // then the blunders: score every legal move and take the worst
    const bl = {};
    sides.filter(s => out[s].impossible).forEach(s => { bl[s] = out[s]; });
    try {
      for (const s of todo) {
        const fen = toFen(positionArray, s);
        setEngineStatus(`Scoring every ${SIDE_NAME[s]} move for the blunder…`);
        const list = await scoreAllMoves(fen, 2000, ({ depth }) => {
          setEngineStatus(`Scoring every ${SIDE_NAME[s]} move for the blunder… depth ${depth}`);
        }, engineOwner);
        if (list === SUPERSEDED) return;
        bl[s] = blunderOf(fen, list);
        setBlunders({ ...bl });
      }
    } catch (err) {
      setEngineStatus('Engine error (blunder search)');
      return;
    }
    setEngineStatus(ready);
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
    setMoves({});
    setBlunders({});
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('CHESS CLEARED ✓');
  };

  const copyItems = [];
  if (moves.w || moves.b) {
    for (const s of ['w', 'b']) {
      if (moves[s] && moves[s].san) copyItems.push({ label: `COPY ${SIDE_NAME[s].toUpperCase()}'S MOVE (${moves[s].san})`, value: moves[s].san });
    }
    for (const s of ['w', 'b']) {
      const b = blunders[s];
      if (b && b.san) copyItems.push({ label: `COPY ${SIDE_NAME[s].toUpperCase()}'S BLUNDER (${b.san}${b.uci !== b.san ? ` / ${b.uci}` : ''})`, value: b.san });
    }
    for (const s of ['w', 'b']) copyItems.push({ label: `COPY FEN (${SIDE_NAME[s]} to move)`, value: toFen(merged, s) });
  }

  const stampStats = `ENGINE: ${engineStatus} | PIECES: ${merged.filter(Boolean).length}`;
  // one line for this card's box when several Chess modules are grouped
  const summary = ['w', 'b'].filter(s => moves[s] && moves[s].san)
    .map(s => `${SIDE_ICON[s]} ${moves[s].san}${blunders[s] && blunders[s].san ? ` ✗${blunders[s].san}` : ''}`).join('  ');
  React.useEffect(() => { if (inst && inst.report) inst.report(summary); }, [summary]);
  const sidePanel = (s) => {
    const m = moves[s];
    return (
      <AnswerPanel
        report={false}
        label={`${SIDE_ICON[s]} ${SIDE_NAME[s].toUpperCase()} TO MOVE`}
        answers={m && m.san ? [m.san] : []}
        copyValue={m && m.san ? m.san : null}
        placeholder={!m ? (merged.some(Boolean) ? '…' : '— — —') : m.impossible ? 'NOT POSSIBLE' : '—'}
        stats={m && !m.san ? (m.impossible ? `${SIDE_NAME[s === 'w' ? 'b' : 'w']} is in check` : m.bad) : null}
      />
    );
  };
  const blunderPanel = (s) => {
    const b = blunders[s];
    return (
      <AnswerPanel
        report={false}
        label={`${SIDE_ICON[s]} ${SIDE_NAME[s].toUpperCase()}'S BLUNDER`}
        answers={b && b.san ? [b.san] : []}
        copyValue={b && b.san ? b.san : null}
        placeholder={!b ? (merged.some(Boolean) ? '…' : '— — —') : b.impossible ? 'NOT POSSIBLE' : '—'}
        stats={b ? (b.san ? `${b.what} · best move ${b.bestWhat}` : b.impossible ? `${SIDE_NAME[s === 'w' ? 'b' : 'w']} is in check` : b.bad) : null}
      />
    );
  };
  const ties = ['w', 'b'].filter(s => blunders[s] && blunders[s].also && blunders[s].also.length);

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
              <button className="reset-btn" type="button" onClick={handleClear} data-card-clear>
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
              NEXT PICTURE GOES TO: {activeTarget.toUpperCase()} BOARD
            </button>
            <button type="button" className="bg-btn" onClick={handleClear} data-card-clear>
              🗑️ CLEAR BOARD
            </button>
          </div>
        </ModuleInput>
      }
      answers={
        <>
          <div className="chess-stamps">
            {sidePanel('w')}
            {sidePanel('b')}
          </div>
          <div className="chess-stamps chess-blunders">
            {blunderPanel('w')}
            {blunderPanel('b')}
          </div>
          {ties.map(s => (
            <div key={s} className="chess-engine-line chess-ties">
              {SIDE_ICON[s]} just as bad by the engine ({blunders[s].what}): {blunders[s].also.slice(0, 8).join(', ')}{blunders[s].also.length > 8 ? ` +${blunders[s].also.length - 8} more` : ''}
            </div>
          ))}
          <div className="chess-engine-line">{stampStats}</div>
        </>
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title={`INTERACTIVE 8×8 CHESSBOARD — ${tapWord(touch)} a square to adjust piece placement`}
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
  sub: 'Upload White board and Black board screenshots or set pieces manually. <b>Stockfish</b> solves the position for <b>both sides</b> — White’s best move on the left, Black’s on the right — so click the one the module asks for to copy it.',
  Component: ChessModule
};
