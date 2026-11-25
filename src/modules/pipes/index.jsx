import React, { useState } from 'react';
import { readPipes } from './pipesVision.js';
import { solvePipes, pressText } from './pipesSolver.js';
import { imageToData } from '../../core/level/levelVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { PipesBoard, PIPE_SWATCH } from './working.jsx';

const ORDER = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const TURNS = [
  { dir: 1, key: 'cw', icon: '↻', name: 'CLOCKWISE' },
  { dir: -1, key: 'ccw', icon: '↺', name: 'ANTICLOCKWISE' }
];
const sameBoard = (a, b) => Boolean(a && b) && a.masks.join(',') === b.masks.join(',');

export function PipesModule({ isActive = true }) {
  const inst = useInstance();
  const multi = Boolean(inst && inst.multi);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  const [helper, setHelper] = useState(null);   // coloured picture: { cols, rows, cells }
  const [defuser, setDefuser] = useState(null); // grey picture (shapes only), to cross-check
  const [status, setStatus] = useState({ text: '', ok: null });
  const [focus, setFocus] = useState(null);     // colour to highlight on the boards

  // the same final board either way; only the press counts differ (1 one way = 3 the other)
  const results = React.useMemo(() => (helper
    ? { cw: solvePipes(helper.cells, helper.cols, helper.rows, 1), ccw: solvePipes(helper.cells, helper.cols, helper.rows, -1) }
    : null), [helper]);
  const result = results && results.cw;
  const colors = result ? ORDER.filter(c => result.colors.includes(c)).concat(result.colors.filter(c => !ORDER.includes(c))) : [];
  const best = result && result.solutions[0];
  const bestOf = { cw: best, ccw: results && results.ccw.solutions[0] };
  const answerOf = { cw: best ? pressText(best.presses, colors) : '', ccw: bestOf.ccw ? pressText(bestOf.ccw.presses, colors) : '' };
  // copied straight away only when both directions need the same presses; otherwise click the one the bomb uses
  const answer = answerOf.cw === answerOf.ccw ? answerOf.cw : '';
  const summary = answerOf.cw ? (answer || `↻ ${answerOf.cw}  ↺ ${answerOf.ccw}`) : '';

  // the grey picture must show the same pieces as the coloured one
  const mismatch = helper && defuser && (helper.cols !== defuser.cols || helper.rows !== defuser.rows
    || helper.cells.some((c, i) => c.mask !== defuser.cells[i].mask));

  React.useEffect(() => {
    const fresh = answerChanged(summary);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [summary, isActive]);
  React.useEffect(() => { if (inst && inst.report) inst.report(summary); }, [summary]);

  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    try {
      const d = imageToData(img);
      const r = readPipes(d.data, d.width, d.height);
      if (!r.ok) { setStatus({ text: `${r.reason} — is this a Pipes picture?`, ok: false }); return; }
      const board = { cols: r.cols, rows: r.rows, cells: r.cells.map(c => ({ mask: c.mask, color: c.color })) };
      if (r.colored) {
        setHelper(board);
        const s = solvePipes(board.cells, board.cols, board.rows, 1);
        const missing = board.cells.filter(c => !c.color).length;
        setStatus({
          text: `Helper picture: ${r.cols}×${r.rows}, ${s.colors.length} colours${missing ? ` · ${missing} tile(s) without a colour — tap them` : ''} · ${s.solutions.length ? 'solved ✓' : 'no solution — a tile was misread'}`,
          ok: s.solutions.length > 0 && !missing
        });
        if (s.solutions.length) showToast('PIPES SOLVED ✓');
      } else {
        setDefuser(board);
        setStatus({ text: `Defuser picture: ${r.cols}×${r.rows} pieces read. Now paste the helper’s coloured picture — the colours decide the buttons.`, ok: null });
      }
    } catch (e) {
      setStatus({ text: `Could not read that image (${e.message || e}).`, ok: false });
    }
  };

  // Tap a tile on the helper board to change its colour (fixes a misread)
  const cycleColor = (i) => {
    if (!helper) return;
    const pal = colors.length ? colors : ORDER.slice(0, 5);
    setHelper(h => ({
      ...h,
      cells: h.cells.map((c, j) => (j === i ? { ...c, color: pal[(pal.indexOf(c.color) + 1) % pal.length] } : c))
    }));
  };

  const handleClear = () => {
    setHelper(null); setDefuser(null); setFocus(null);
    setStatus({ text: '', ok: null });
    setLastImage(null, null);
    setLastCopyString('');
  };

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🟥🟩🟦"
              title={multi ? 'Drop / paste this Pipes picture' : 'Click here, then paste the helper’s coloured Pipes picture'}
              sub={<>the <b>helper’s</b> picture has the colours · the defuser’s grey one is optional (cross-check)</>}
            />
          }
          controls={<button className="reset-btn" type="button" onClick={handleClear}>clear</button>}
        >
          {status.text && <div className={`pipes-status ${status.ok === false ? 'warn' : ''}`}>{status.text}</div>}
          {mismatch && <div className="pipes-status warn">⚠ The defuser’s picture shows different pieces from the helper’s — check both are from this bomb.</div>}
        </ModuleInput>
      }
      answers={
        <>
          <div className="pipes-stamps">
            {TURNS.map(t => (
              <AnswerPanel
                key={t.key}
                report={false}
                label={`${t.icon} ${t.name}`}
                answers={answerOf[t.key]}
                placeholder="— — —"
                stats={bestOf[t.key] && bestOf[t.key].total ? `${bestOf[t.key].total} presses` : null}
              />
            ))}
          </div>
          {best && !answer && <div className="pipes-status">Press each colour that many times, in any order — use the side that matches which way the bomb turns the pipes. Click it to copy.</div>}
          {helper && result && !best && (
            <div className="pipes-status warn">⚠ No combination of presses joins every pipe — a piece or a colour was misread. Tap a tile below to change its colour.</div>
          )}
          {best && result.solutions.length > 1 && (
            <div className="pipes-status warn">⚠ {result.solutions.length} different solutions — showing the one with the fewest presses.</div>
          )}
          {best && (
            <div className="pipes-presses">
              {colors.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`pipes-press ${focus === c ? 'on' : ''}`}
                  style={{ '--pc': PIPE_SWATCH[c] || '#94a3b8' }}
                  onClick={() => setFocus(f => (f === c ? null : c))}
                  title="Highlight this colour's pipes"
                >
                  <span className="pipes-dot" /> {cap(c)} <b>↻{best.presses[c]}</b>{bestOf.ccw && <b className="pipes-ccw">↺{bestOf.ccw.presses[c]}</b>}
                </button>
              ))}
            </div>
          )}
          {helper && (
            <div className="pipes-boards">
              <PipesBoard cols={helper.cols} rows={helper.rows} masks={helper.cells.map(c => c.mask)} colors={helper.cells.map(c => c.color)} onTap={cycleColor} highlight={focus} label="now · tap a tile to fix its colour" />
              {best && <PipesBoard cols={helper.cols} rows={helper.rows} masks={best.masks} colors={helper.cells.map(c => c.color)} highlight={focus} label={sameBoard(best, bestOf.ccw) ? 'after the presses (either way)' : 'after the ↻ presses'} />}
              {best && bestOf.ccw && !sameBoard(best, bestOf.ccw) && <PipesBoard cols={helper.cols} rows={helper.rows} masks={bestOf.ccw.masks} colors={helper.cells.map(c => c.color)} highlight={focus} label="after the ↺ presses" />}
            </div>
          )}
        </>
      }
      working={
        <WorkingPanel title="HOW IT'S SOLVED" defaultExpanded={false}>
          <div className="pipes-status">
            Each colour button turns all pipes of that colour 90° (clockwise on some bombs, anticlockwise on others), so only the number of presses per colour matters (0–3). Both directions reach the same finished board: a colour pressed n times one way is pressed (4 − n) times the other way, except that pieces which look the same after a half turn can need fewer.
            All {colors.length ? `4^${colors.length} = ${4 ** colors.length}` : ''} combinations are tried; a combination solves it when every opening meets
            an opening, nothing points off the board, every tile is joined and there are exactly (tiles − 1) joints (no loops).
            {defuser && !mismatch && ' The defuser’s grey picture matches the helper’s pieces ✓.'}
          </div>
        </WorkingPanel>
      }
    />
  );
}

export const pipesModule = {
  id: 'pipes',
  tabId: 'tabPipes',
  tabLabel: '🟩 PIPES',
  eyebrow: 'PIPES SOLVER',
  title: 'Pipes Vision',
  sub: 'Paste the <b>helper’s coloured</b> Pipes picture. Every colour button turns all pipes of that colour 90°; the answer is how many times to press each colour so all pipes form <b>one network with no loops and no open ends</b>. Shown for both turning directions — <b>↻ clockwise</b> left, <b>↺ anticlockwise</b> right. The defuser’s picture never changes, so press the counts and don’t re-check.',
  Component: PipesModule
};
