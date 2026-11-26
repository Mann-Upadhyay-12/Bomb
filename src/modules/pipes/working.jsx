import React from 'react';
import { N, E, S, W } from './pipesSolver.js';

export const PIPE_SWATCH = {
  red: '#ef4444', orange: '#f97316', yellow: '#facc15', green: '#22c55e', cyan: '#06b6d4',
  blue: '#3b82f6', purple: '#a855f7', pink: '#ec4899'
};
const GREY = '#94a3b8';

/** One tile: arms to each open side, a cap disc on dead ends. */
function Tile({ x, y, size, mask, color, onClick, dim }) {
  const c = color ? PIPE_SWATCH[color] || GREY : GREY;
  const h = size / 2, w = size * 0.3, cx = x + h, cy = y + h;
  const arms = [];
  if (mask & N) arms.push(<rect key="n" x={cx - w / 2} y={y} width={w} height={h} />);
  if (mask & E) arms.push(<rect key="e" x={cx} y={cy - w / 2} width={h} height={w} />);
  if (mask & S) arms.push(<rect key="s" x={cx - w / 2} y={cy} width={w} height={h} />);
  if (mask & W) arms.push(<rect key="w" x={x} y={cy - w / 2} width={h} height={w} />);
  const ends = [N, E, S, W].filter(b => mask & b).length;
  return (
    <g onClick={onClick} className={`pipe-tile ${onClick ? 'tap' : ''}`} opacity={dim ? 0.35 : 1}>
      <rect x={x + 1} y={y + 1} width={size - 2} height={size - 2} rx={size * 0.12} className="pipe-bg" />
      <g fill={c}>
        {arms}
        {ends === 1 ? <circle cx={cx} cy={cy} r={size * 0.28} /> : <rect x={cx - w / 2} y={cy - w / 2} width={w} height={w} />}
      </g>
    </g>
  );
}

/** The board as drawn by the solver. masks/colors are row-major. */
export function PipesBoard({ cols, rows, masks, colors, onTap, highlight = null, label }) {
  const size = 40;
  return (
    <figure className="pipes-board">
      <svg viewBox={`0 0 ${cols * size} ${rows * size}`} role="img" aria-label={label}>
        {masks.map((m, i) => (
          <Tile
            key={i}
            x={(i % cols) * size}
            y={Math.floor(i / cols) * size}
            size={size}
            mask={m}
            color={colors[i]}
            dim={highlight && colors[i] !== highlight}
            onClick={onTap ? () => onTap(i) : null}
          />
        ))}
      </svg>
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}
