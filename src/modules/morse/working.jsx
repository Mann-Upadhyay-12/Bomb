import React, { useRef, useEffect } from 'react';
import { useTheme } from '../../core/ThemeContext.jsx';

export function MorseWorking({ rle = [], decoded = null, frameCount = 0 }) {
  const canvasRef = useRef(null);
  const { isDark } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rle || rle.length === 0) return;

    const parent = canvas.parentElement;
    const W = parent ? Math.max(parent.offsetWidth - 2, 300) : 700;
    canvas.width = W;
    const H = 70;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = isDark ? '#161920' : '#E6DEC9';
    ctx.fillRect(0, 0, W, H);

    const totalDur = rle.reduce((s, x) => s + x.duration, 0);
    const unit = (decoded && decoded.unit) || 100;
    let x = 0;

    for (const { is_on, duration } of rle) {
      const w = (duration / totalDur) * W;
      if (is_on) {
        const isDash = duration > unit * 2;
        const col = isDash ? (isDark ? '#E5B84B' : '#AD7A2E') : (isDark ? '#4CAF50' : '#3E7C4A');
        const glow = isDash ? 'rgba(173,122,46,0.2)' : 'rgba(62,124,74,0.2)';
        ctx.fillStyle = glow;
        ctx.fillRect(x, H * 0.08, Math.max(w - 1, 1), H * 0.65);
        ctx.fillStyle = col;
        ctx.fillRect(x + 1, H * 0.15, Math.max(w - 2, 1), H * 0.5);
      } else if (duration > unit * 2) {
        const isWord = duration > unit * 5;
        ctx.strokeStyle = isWord ? 'rgba(173,122,46,0.6)' : (isDark ? 'rgba(255,255,255,0.13)' : 'rgba(33,29,23,0.18)');
        ctx.lineWidth = isWord ? 1.5 : 1;
        ctx.setLineDash(isWord ? [4, 4] : [2, 5]);
        ctx.beginPath();
        ctx.moveTo(x, 2);
        ctx.lineTo(x, H - 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      x += w;
    }

    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(33,29,23,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.65);
    ctx.lineTo(W, H * 0.65);
    ctx.stroke();
  }, [rle, decoded, isDark]);

  if (!rle || rle.length === 0) {
    return (
      <div className="shared-empty-state">
        <span className="shared-empty-text">No Morse code decoded yet — upload or paste an animated Morse GIF</span>
      </div>
    );
  }

  const letters = (decoded && decoded.letters) || [];

  return (
    <div className="morse-working-container">
      <div className="morse-wave-wrap">
        <canvas ref={canvasRef} height="70" style={{ width: '100%', display: 'block' }} />
      </div>

      <div className="morse-letter-section-label" style={{ marginTop: '14px', marginBottom: '8px' }}>
        LETTER BREAKDOWN
      </div>

      <div className="morse-letter-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {letters.map((l, i) => {
          if (l.char === ' ') {
            return <div key={i} className="morse-word-sep" />;
          }
          return (
            <div key={i} className="morse-letter-card">
              <div className="mlc-char">{l.char}</div>
              <div className="mlc-code">
                {l.code.split('').map((s, si) => (
                  <span key={si} style={{ color: s === '-' ? '#E5B84B' : '#4CAF50' }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
