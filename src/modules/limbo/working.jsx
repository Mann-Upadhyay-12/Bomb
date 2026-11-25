import React from 'react';
import { SLOT_NAMES } from './limboSolver.js';

export const LIMBO_SWATCH = {
  red: '#ef4444', orange: '#f97316', yellow: '#facc15', green: '#22c55e', blue: '#3b82f6', purple: '#a855f7'
};

/**
 * The six slots as on the module, coloured as revealed. START ring = the followed key's first slot,
 * END = where it finished. Tap a slot to make it the start key (when the glow was missed).
 */
export function LimboBoard({ result, onPickStart }) {
  const { slots, start, end, colors } = result;
  const xs = slots.map(s => s.x), ys = slots.map(s => s.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const P = (s) => ({ x: 100 + ((s.x - cx) / span) * 130, y: 100 + ((s.y - cy) / span) * 130 });
  return (
    <div className="limbo-board">
      <svg viewBox="0 0 200 200" role="img" aria-label="Limbo key slots">
        {slots.map((s, k) => {
          const p = P(s);
          const col = colors && colors[k] ? LIMBO_SWATCH[colors[k]] : 'var(--ink-soft)';
          return (
            <g key={k} className="limbo-slot" onClick={() => onPickStart(k)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickStart(k); } }}>
              <title>{`${SLOT_NAMES[k]}${colors && colors[k] ? ` · ${colors[k]}` : ''} — tap to make this the start key`}</title>
              {k === end && <circle cx={p.x} cy={p.y} r="25" className="limbo-end-ring" />}
              {k === start && <circle cx={p.x} cy={p.y} r="20" className="limbo-start-ring" />}
              <circle cx={p.x} cy={p.y} r="14" fill={col} stroke="rgba(0,0,0,.35)" strokeWidth="2" />
              {k === start && <text x={p.x} y={p.y - 30} className="limbo-tag">START</text>}
              {k === end && <text x={p.x} y={p.y + (k === start ? 40 : 38)} className="limbo-tag end">END</text>}
            </g>
          );
        })}
      </svg>
      <div className="limbo-board-note">tap a key to change the start</div>
    </div>
  );
}

/** Every move: which slots swapped, where the followed key was after it, and how clear the read was. */
export function LimboWorking({ result, thumbs, meta }) {
  if (!result) return <div className="limbo-status">Nothing yet — paste the Limbo GIF.</div>;
  if (!result.ok) return <div className="limbo-status warn">{result.reason}</div>;
  const short = (k) => SLOT_NAMES[k].replace('upper ', 'U-').replace('lower ', 'L-');
  return (
    <div className="limbo-working">
      <div className="limbo-thumbs">
        {thumbs.start && <figure><img src={thumbs.start} alt="start frame" /><figcaption>start</figcaption></figure>}
        {thumbs.end && <figure><img src={thumbs.end} alt="last frame" /><figcaption>end</figcaption></figure>}
        <div className="limbo-status">{meta}</div>
      </div>
      <table className="limbo-moves">
        <thead><tr><th>#</th><th>frames</th><th>swaps</th><th>key now</th><th>fit</th></tr></thead>
        <tbody>
          {result.moves.map((m, i) => {
            const moved = m.pairs.some(p => p.includes(i === 0 ? result.start : result.path[i - 1]));
            const unsure = m.warn || m.margin < 0.01;
            return (
              <tr key={i} className={`${moved ? 'moved' : ''} ${unsure ? 'unsure' : ''}`}>
                <td>{i + 1}</td>
                <td>{m.frames[0]}–{m.frames[1]}</td>
                <td>{m.warn || m.pairs.map(([a, b]) => `${short(a)} ↔ ${short(b)}`).join(', ')}</td>
                <td>{result.path[i] !== undefined && result.path[i] !== null ? short(result.path[i]) : '—'}</td>
                <td>{unsure ? '⚠' : '✓'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
