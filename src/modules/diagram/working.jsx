import React, { useRef, useEffect } from 'react';
import { VennCore } from './diagramCore.js';
import { useTheme } from '../../core/ThemeContext.jsx';

const DG_CW = 360, DG_CH = 330, DG_RX = 8, DG_RY = 8, DG_RW = 344, DG_RH = 314;

export const DG_LAYOUTS = {
  c3: {
    n: 3, slots: ['T', 'L', 'R'], r: 74,
    names: { T: 'Top', L: 'Bottom-left', R: 'Bottom-right' },
    centers: { T: [180, 116], L: [142, 198], R: [218, 198] },
    labelPos: { T: [180, 90], L: [114, 212], R: [246, 212] },
    defaults: { T: 'A', L: 'B', R: 'C' }
  },
  c2h: {
    n: 2, slots: ['L', 'R'], r: 88,
    names: { L: 'Left', R: 'Right' },
    centers: { L: [134, 166], R: [226, 166] },
    labelPos: { L: [92, 166], R: [268, 166] },
    defaults: { L: 'A', R: 'B' }
  },
  c2v: {
    n: 2, slots: ['T', 'B'], r: 86,
    names: { T: 'Top', B: 'Bottom' },
    centers: { T: [180, 118], B: [180, 212] },
    labelPos: { T: [180, 72], B: [180, 258] },
    defaults: { T: 'A', B: 'B' }
  }
};

const dgGridCache = {};

function dgMaskAt(lk, x, y) {
  if (x < DG_RX || x > DG_RX + DG_RW || y < DG_RY || y > DG_RY + DG_RH) return -1;
  const L = DG_LAYOUTS[lk];
  let m = 0;
  L.slots.forEach((s, i) => {
    const c = L.centers[s];
    if ((x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1]) <= L.r * L.r) m |= 1 << i;
  });
  return m;
}

function dgGetGrid(lk, w, h) {
  const key = lk + w + 'x' + h;
  if (dgGridCache[key]) return dgGridCache[key];
  const g = new Int8Array(w * h), sx = DG_CW / w, sy = DG_CH / h;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      g[py * w + px] = dgMaskAt(lk, (px + 0.5) * sx, (py + 0.5) * sy);
    }
  }
  dgGridCache[key] = g;
  return g;
}

function dgRoundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function DiagramWorking({
  layoutKey = 'c3',
  letters = { T: 'A', L: 'B', R: 'C' },
  selectedSlots = new Set(),
  onToggleSlot = () => {},
  shots = []
}) {
  const canvasRef = useRef(null);
  const { isDark } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const L = DG_LAYOUTS[layoutKey];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(DG_CW * dpr);
    const h = Math.round(DG_CH * dpr);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.scale(w / DG_CW, h / DG_CH);

    // Universe rectangle
    dgRoundRectPath(ctx, DG_RX, DG_RY, DG_RW, DG_RH, 10);
    ctx.fillStyle = isDark ? '#1B1E26' : '#E8E1CE';
    ctx.fill();

    // Region fills
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    const id = octx.createImageData(w, h);
    const d = id.data;
    const grid = dgGetGrid(layoutKey, w, h);

    for (let i = 0; i < grid.length; i++) {
      const m = grid[i];
      if (m < 0) continue;
      if (selectedSlots.has(m)) {
        const p = i * 4;
        d[p] = 173;
        d[p + 1] = 122;
        d[p + 2] = 46;
        d[p + 3] = 140;
      }
    }
    octx.putImageData(id, 0, 0);

    ctx.save();
    dgRoundRectPath(ctx, DG_RX, DG_RY, DG_RW, DG_RH, 10);
    ctx.clip();
    ctx.drawImage(off, 0, 0, DG_CW, DG_CH);
    ctx.restore();

    // Outlines
    dgRoundRectPath(ctx, DG_RX, DG_RY, DG_RW, DG_RH, 10);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(33,29,23,0.25)';
    ctx.stroke();

    ctx.lineWidth = 2.4;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.72)' : 'rgba(33,29,23,0.75)';
    L.slots.forEach(s => {
      const c = L.centers[s];
      ctx.beginPath();
      ctx.arc(c[0], c[1], L.r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 19px ui-monospace, "Cascadia Code", Consolas, monospace';
    ctx.fillStyle = isDark ? '#F1F3F7' : '#211D17';
    L.slots.forEach(s => {
      const p = L.labelPos[s];
      ctx.fillText(letters[s] || s, p[0], p[1]);
    });

    ctx.font = '600 12px ui-monospace, "Cascadia Code", Consolas, monospace';
    ctx.fillStyle = isDark ? 'rgba(142,149,165,0.9)' : 'rgba(108,98,85,0.9)';
    ctx.textAlign = 'left';
    ctx.fillText('S', DG_RX + 12, DG_RY + 16);
  }, [layoutKey, letters, selectedSlots, isDark]);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * DG_CW;
    const y = ((e.clientY - rect.top) / rect.height) * DG_CH;
    const mask = dgMaskAt(layoutKey, x, y);
    if (mask >= 0) {
      onToggleSlot(mask);
    }
  };

  return (
    <div className="diagram-working-container">
      {shots.length > 0 && (
        <div className="shots" style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {shots.map((sh, idx) => (
            <div key={idx} className={`shot-card ${sh.type === 'bad' ? 'bad' : ''}`}>
              <img src={sh.url} alt={`shot ${idx + 1}`} />
              <div className="shot-card-tag">
                {sh.type === 'labels' ? 'LABELS' : sh.type === 'shade' ? 'SHADING' : sh.type === 'both' ? 'LABELS + SHADING' : sh.type === 'bad' ? 'NOT RECOGNISED' : 'SCREENSHOT'}
              </div>
              {sh.meta && <div className="shot-card-meta">{sh.meta}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="dg-main" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <canvas
          ref={canvasRef}
          width={DG_CW}
          height={DG_CH}
          onClick={handleCanvasClick}
          style={{ cursor: 'pointer', width: `${DG_CW}px`, maxWidth: '100%', height: 'auto', borderRadius: '10px' }}
        />
        <div className="dg-hover" style={{ marginTop: '8px', fontSize: '11px', color: 'var(--ink-soft)' }}>
          Click a region to toggle shading (inside circles or outside universe)
        </div>
      </div>
    </div>
  );
}
