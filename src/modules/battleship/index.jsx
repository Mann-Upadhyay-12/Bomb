import React, { useMemo, useState } from 'react';
import { analyzeBattleship, parseBattleshipText, cellName, colLetter, parseCell, SAMPLE_MANUAL } from './battleshipSolver.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';

const WAIT = 20; // seconds between shots
const BOARD = { cols: 6, rows: 6 };
const STATUS_NEXT = { afloat: 'sunk', sunk: null, null: 'afloat' };
const pct = p => (p >= 0.995 ? '100' : p < 0.005 ? '0' : String(Math.round(p * 100)));

export function BattleshipModule({ isActive = true }) {
  const uid = React.useId();
  const { copyOnDecode, setLastCopyString } = useAppState();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  const [text, setText] = useState('');
  const [fleet, setFleet] = useState([]); // [{ len, status }]
  const [fleetHits, setFleetHits] = useState(0); // hits marked when the fleet list was last pasted
  const size = BOARD; // the bomb's 6×6 module grid (A–F × 1–6)
  const [shots, setShots] = useState([]); // [{ i, result }] in the order fired
  const [lastShotAt, setLastShotAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const shotMap = useMemo(() => Object.fromEntries(shots.map(s => [s.i, s.result])), [shots]);
  const hits = shots.filter(s => s.result === 'hit').length;
  // "afloat" in the list is only trusted while no hit has come in since it was pasted
  const trustAfloat = fleet.some(s => s.status) && hits === fleetHits;
  const res = useMemo(
    () => analyzeBattleship({ cols: size.cols, rows: size.rows, ships: fleet, shots: shotMap, trustAfloat }),
    [size, fleet, shotMap, trustAfloat]
  );
  const target = res.ok && !res.done && res.best.length ? res.best[0] : -1;
  const targetName = target >= 0 ? cellName(target, size.cols) : '';
  const answer = res.done ? 'ALL SUNK' : targetName ? `Fire ${targetName}` : '';

  React.useEffect(() => {
    const fresh = answerChanged(answer);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer && !res.done) copy(answer);
  }, [answer, isActive]);

  // the 20-second wait after a shot
  const waitLeft = lastShotAt ? Math.max(0, WAIT - Math.floor((now - lastShotAt) / 1000)) : 0;
  React.useEffect(() => {
    if (!lastShotAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    const stop = setTimeout(() => clearInterval(id), (WAIT + 1) * 1000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [lastShotAt]);

  const handleText = (t) => {
    setText(t);
    const p = parseBattleshipText(t);
    if (p.ships.length) { setFleet(p.ships); setFleetHits(hits); }
    if (p.shots.length) {
      const { cols, rows } = size;
      setShots(prev => {
        const next = [...prev];
        for (const s of p.shots) {
          const i = parseCell(s.cell, cols, rows);
          if (i < 0) continue;
          const at = next.findIndex(x => x.i === i);
          if (at >= 0) next[at] = { i, result: s.result }; else next.push({ i, result: s.result });
        }
        return next;
      });
    }
  };

  const mark = (i, result) => {
    setShots(prev => {
      const at = prev.findIndex(s => s.i === i);
      if (!result) return prev.filter(s => s.i !== i);
      if (at >= 0) return prev.map(s => (s.i === i ? { i, result } : s));
      return [...prev, { i, result }];
    });
    if (result && !shotMap[i]) { setLastShotAt(Date.now()); setNow(Date.now()); }
  };
  // click a cell: untried → miss → hit → untried
  const cycle = (i) => mark(i, !shotMap[i] ? 'miss' : shotMap[i] === 'miss' ? 'hit' : null);
  const undo = () => setShots(prev => prev.slice(0, -1));
  const newBoard = () => { setShots([]); setLastShotAt(0); setFleetHits(0); };
  const clearAll = () => { newBoard(); setText(''); setFleet([]); setLastCopyString(''); };
  const sample = () => { newBoard(); handleText(SAMPLE_MANUAL); };

  const setStatus = (k) => setFleet(f => f.map((s, j) => (j === k ? { ...s, status: STATUS_NEXT[s.status] ?? 'afloat' } : s)));
  const removeShip = (k) => setFleet(f => f.filter((_, j) => j !== k));
  const addShip = (len) => setFleet(f => [...f, { len, status: null }]);

  const fleetCells = fleet.reduce((a, s) => a + s.len, 0);
  const placeholder = !fleet.length ? 'PASTE THE MANUAL TEXT (THE ENEMY FLEET)' : res.ok ? '— — —' : res.reason.toUpperCase();
  const answers = res.done ? ['ALL SHIPS SUNK'] : targetName ? [`FIRE ${targetName}`] : [];
  const stats = !res.ok ? 'FLEET + YOUR HIT / MISS MARKS → BEST CELL'
    : res.done ? `${shots.length} SHOTS · DONE`
    : `${res.mode === 'target' ? 'FINISH THE HIT SHIP' : 'SEARCH'} · ${pct(res.bestP)}% HIT CHANCE · SHOT ${shots.length + 1}`;

  const tieNames = res.ties.filter(i => i !== target).map(i => cellName(i, size.cols));
  const copyItems = [];
  if (answer && !res.done) copyItems.push({ label: `COPY (${answer})`, value: answer });
  tieNames.slice(0, 4).forEach(n => copyItems.push({ label: `Fire ${n} (just as good)`, value: `Fire ${n}` }));

  const cells = [];
  for (let r = 0; r < size.rows; r++) for (let c = 0; c < size.cols; c++) cells.push(r * size.cols + c);

  return (
    <ModuleLayout
      input={
        <ModuleInput
          controls={
            <>
              <button className="reset-btn" type="button" onClick={undo} disabled={!shots.length}>↶ undo shot</button>
              <button className="reset-btn" type="button" onClick={newBoard} disabled={!shots.length}>new board</button>
              <button className="reset-btn" type="button" onClick={clearAll}>clear</button>
              <button className="reset-btn" type="button" style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }} onClick={sample}>⚡ SAMPLE</button>
            </>
          }
        >
          <div className="bs-config">
            <label className="search-config-label" htmlFor={`${uid}-man`}>MANUAL TEXT (the "Enemy fleet" list — paste it again when a ship sinks):</label>
            <textarea
              id={`${uid}-man`}
              className="search-words-field bs-text"
              spellCheck={false}
              placeholder={'Enemy fleet:\n• 3-cell ship, afloat\n• 2-cell ship, afloat'}
              value={text}
              onChange={(e) => handleText(e.target.value)}
            />
            <div className="bs-fleet">
              <span className="search-config-label">FLEET:</span>
              {fleet.map((s, k) => (
                <span key={k} className={`bs-ship ${s.status || 'unknown'}`}>
                  <button type="button" onClick={() => setStatus(k)} title="Click: afloat → sunk → unknown">
                    {'▮'.repeat(s.len)} {s.len}-cell · {s.status || '?'}
                  </button>
                  <button type="button" className="bs-x" onClick={() => removeShip(k)} title="Remove">✕</button>
                </span>
              ))}
              <select className="bs-add" value="" onChange={(e) => e.target.value && addShip(Number(e.target.value))} title="Add a ship">
                <option value="">+ ship</option>
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}-cell</option>)}
              </select>
            </div>
            {fleet.length > 0 && fleet.some(s => s.status === 'afloat') && !trustAfloat && hits > 0 && (
              <div className="bs-dim">Hit marked: if a ship sank, paste the new fleet list or click its chip to mark it sunk.</div>
            )}
          </div>
        </ModuleInput>
      }
      answers={
        <>
          <AnswerPanel label="FIRE AT" stats={stats} answers={answers} copyValue={answer && !res.done ? answer : null} placeholder={placeholder} />
          {res.ok && !res.done && target >= 0 && (
            <div className="bs-report">
              <span>{targetName} was a</span>
              <button type="button" className="bs-hit-btn" onClick={() => mark(target, 'hit')}>💥 HIT</button>
              <button type="button" className="bs-miss-btn" onClick={() => mark(target, 'miss')}>🌊 MISS</button>
              <span className={`bs-wait ${waitLeft ? 'busy' : ''}`}>
                {waitLeft ? `⏳ wait ${waitLeft}s before the next shot` : lastShotAt ? '✓ the defuser can fire' : ''}
              </span>
            </div>
          )}
          {tieNames.length > 0 && !res.done && (
            <div className="bs-note">Just as good: <b>{tieNames.join(', ')}</b> — a shot knocks that slot's module offline for 20 s, so pick one whose module isn't being worked on.</div>
          )}
          {fleet.length > 0 && (
            <div className="bs-board" style={{ gridTemplateColumns: `22px repeat(${size.cols}, minmax(0, 1fr))` }}>
              <span />
              {Array.from({ length: size.cols }, (_, c) => <span key={c} className="bs-lbl">{colLetter(c)}</span>)}
              {cells.map(i => {
                const c = i % size.cols;
                const s = shotMap[i];
                const p = res.prob[i] || 0;
                const isTarget = i === target, isTie = res.ties.includes(i) && !isTarget;
                const sure = res.certain.includes(i);
                return (
                  <React.Fragment key={i}>
                    {c === 0 && <span className="bs-lbl">{Math.floor(i / size.cols) + 1}</span>}
                    <button
                      type="button"
                      className={`bs-cell ${s || 'open'} ${isTarget ? 'target' : ''} ${isTie ? 'tie' : ''} ${sure ? 'sure' : ''} ${!s && res.ok && p === 0 && !res.done ? 'empty' : ''}`}
                      style={!s ? { '--heat': res.done ? 0 : Math.min(1, p / Math.max(0.01, res.bestP || 1)) } : undefined}
                      onClick={() => cycle(i)}
                      title={`${cellName(i, size.cols)}: ${s || `${pct(p)}% chance of a ship`} — click: miss → hit → clear`}
                    >
                      {s === 'hit' ? '✕' : s === 'miss' ? '•' : isTarget ? '🎯' : res.ok && !res.done ? pct(p) : ''}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}
          {fleet.length > 0 && (
            <div className="bs-note">
              Click a cell to mark it: once = <b>miss</b> •, twice = <b>hit</b> ✕, three times = clear. Numbers are each cell's chance (%) of holding a ship.
              {' '}{shots.length} shot{shots.length === 1 ? '' : 's'} · {hits} hit{hits === 1 ? '' : 's'} of {fleetCells} ship cells.
            </div>
          )}
        </>
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel title="HOW IT PICKS THE CELL" defaultExpanded={false}>
          <div className="bs-work">
            <div>It counts every way the fleet ({fleet.map(s => s.len).join(' + ') || '—'} cells) could still lie on the {size.cols}×{size.rows} board: straight, not overlapping, covering every hit and no miss{fleet.some(s => s.status === 'sunk') ? ', with each sunk ship lying wholly on hits' : ''}{trustAfloat ? ', and no afloat ship lying wholly on hits' : ''}.</div>
            {res.ok && !res.done && <div>{res.exact ? `${res.total.toLocaleString()} layouts fit.` : 'Too many layouts to count one by one — each ship is counted on its own instead.'} A cell's number is the share of them with a ship there; the highest is fired at.</div>}
            <div>No hit yet → it spreads shots over the middle, where the most layouts pass. After a hit → it follows the line the ship can still lie on, until the list says it sank.</div>
            <div className="bs-dim">With a 3-cell and a 2-cell ship on 6×6, simulated games took about 15 shots on average (worst 25) — about 5 minutes at 20 s a shot. Random shots take about 30.</div>
          </div>
        </WorkingPanel>
      }
    />
  );
}

export const battleshipModule = {
  id: 'battleship',
  tabId: 'tabBattleship',
  tabLabel: '🚢 BATTLESHIP',
  eyebrow: 'FLEET HUNTER',
  title: 'Battleship',
  sub: 'Paste the manual text (the <b>Enemy fleet</b> list), then mark each shot as <b>hit</b> or <b>miss</b>. It counts every way the ships could still lie and names the cell most likely to hold one — the fewest shots, at <b>20 s</b> a shot.',
  Component: BattleshipModule
};
