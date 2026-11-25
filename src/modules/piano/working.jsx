import React, { useState } from 'react';

// The staff as read, editable like public/manual_piano_solver.html: tap the left half to put note 1
// there, the right half for note 2, the clef to switch treble / bass; ♭ ♮ ♯ ✕ under each note.
// pos 0 = bottom staff line, +1 per line / space; drawn from pos −6 (three ledgers below) to 14.
const W = 400, H = 230;
const LINE0 = 150;            // y of the bottom line (pos 0)
const STEP = 10;              // half a staff space
const POS_MIN = -6, POS_MAX = 14;
const X = [165, 285];         // note 1, note 2
const CLEF_X = 95;            // left of this = the clef (tap to switch)
const yOf = pos => LINE0 - pos * STEP;
const ACC_SIGN = { 1: '♯', '-1': '♭', n: '♮' };
const ACCS = [[-1, '♭', 'Flat drawn'], ['n', '♮', 'Natural drawn (cancels the key)'], [1, '♯', 'Sharp drawn'], [0, '✕', 'Nothing drawn (the key decides)']];

function Note({ x, pos, acc, ghost = false }) {
  const y = yOf(pos);
  const ledgers = [];
  for (let p = -2; p >= pos; p -= 2) ledgers.push(p);
  for (let p = 10; p <= pos; p += 2) ledgers.push(p);
  const stemUp = pos < 4; // below the middle line: stem up on the right
  return (
    <g className={`pnst-note${ghost ? ' ghost' : ''}`}>
      {ledgers.map(p => <line key={p} x1={x - 18} x2={x + 18} y1={yOf(p)} y2={yOf(p)} className="pnst-line" />)}
      <ellipse cx={x} cy={y} rx={9} ry={7} transform={`rotate(-20 ${x} ${y})`} className="pnst-head" />
      <line x1={stemUp ? x + 8 : x - 8} x2={stemUp ? x + 8 : x - 8} y1={y} y2={stemUp ? y - 32 : y + 32} className="pnst-stem" />
      {!ghost && acc !== 0 && ACC_SIGN[acc] && <text x={x - 15} y={y + 7} className="pnst-acc" textAnchor="end">{ACC_SIGN[acc]}</text>}
    </g>
  );
}

export function PianoWorking({
  clef = 'treble',
  notes = [{ pos: 0, acc: 0 }, { pos: 0, acc: 0 }],
  noteNames = ['', ''],
  fromKey = [false, false],
  shown = [true, true],       // per note: false until a picture / tap / sample placed it
  picture = '',
  onSetPos = () => {},
  onPosChange = () => {},
  onAccChange = () => {},
  onToggleClef = () => {}
}) {
  const [hover, setHover] = useState(null); // { i, pos } under the pointer

  const at = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    if (x < CLEF_X) return { clef: true };
    const pos = Math.max(POS_MIN, Math.min(POS_MAX, Math.round((LINE0 - y) / STEP)));
    return { i: x < (X[0] + X[1]) / 2 ? 0 : 1, pos };
  };
  const onMove = (e) => { const p = at(e); setHover(p.clef ? null : p); };
  const onUp = (e) => {
    const p = at(e);
    if (p.clef) onToggleClef(); else onSetPos(p.i, p.pos);
    if (e.pointerType !== 'mouse') setHover(null);
  };

  return (
    <div className="pnst">
      <div className="pnst-row">
        <svg
          className="pnst-staff"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${clef} clef staff: tap to move a note`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerUp={onUp}
        >
          <rect x={0} y={0} width={W} height={H} className="pnst-bg" />
          <line x1={(X[0] + X[1]) / 2} x2={(X[0] + X[1]) / 2} y1={yOf(10)} y2={yOf(-2)} className="pnst-split" />
          {[0, 2, 4, 6, 8].map(p => <line key={p} x1={30} x2={W - 30} y1={yOf(p)} y2={yOf(p)} className="pnst-line" />)}
          <g className="pnst-clef">
            {clef === 'treble'
              ? <text x={62} y={yOf(1) + 14} textAnchor="middle" fontSize="74">𝄞</text>
              : <text x={62} y={yOf(5) + 18} textAnchor="middle" fontSize="54">𝄢</text>}
            <text x={62} y={yOf(-4.6)} textAnchor="middle" className="pnst-clef-lbl">{clef.toUpperCase()} ⇄</text>
          </g>
          {notes.map((n, i) => shown[i] && <Note key={i} x={X[i]} pos={n.pos} acc={n.acc} />)}
          {hover && (!shown[hover.i] || hover.pos !== notes[hover.i].pos) && <Note x={X[hover.i]} pos={hover.pos} acc={0} ghost />}
        </svg>
        {picture && (
          <figure className="pnst-pic">
            <img src={picture} alt="the pasted staff picture" />
            <figcaption>your picture</figcaption>
          </figure>
        )}
      </div>

      <div className="pnst-notes">
        {notes.map((n, i) => (
          <div key={i} className="pnst-notebox">
            <div className="pnst-notehead">
              <span className="search-config-label">NOTE {i + 1}</span>
              <span className="pn-name">{shown[i] ? noteNames[i] || '—' : '—'}</span>
              {shown[i] && fromKey[i] && <span className="pnst-key">from the key</span>}
              <span className="pnst-nudge">
                <button type="button" className="bg-btn" onClick={() => onPosChange(i, -1)} title="Move down a step">▼</button>
                <button type="button" className="bg-btn" onClick={() => onPosChange(i, 1)} title="Move up a step">▲</button>
              </span>
            </div>
            <div className="pnst-accs">
              {ACCS.map(([v, sym, title]) => (
                <button key={String(v)} type="button" title={title}
                  className={`pnst-acc-btn${String(n.acc) === String(v) ? ' on' : ''}`}
                  onClick={() => onAccChange(i, v)}>{sym}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="pnst-tip">Tap the staff: left half = note 1, right half = note 2 · tap the clef to switch · ✕ = nothing drawn (the key decides), ♮ cancels the key</div>
    </div>
  );
}
