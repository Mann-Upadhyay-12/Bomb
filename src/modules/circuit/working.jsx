import React from 'react';

const SWATCH = { red: '#dc2626', orange: '#ea580c', yellow: '#eab308', green: '#16a34a', blue: '#2563eb', violet: '#7c3aed', white: '#f3f4f6', gray: '#6b7280' };

export function CircuitWorking({ shot, circuit, colors, values, colorNames, onColor }) {
  if (!shot || !circuit) {
    return (
      <div className="shared-empty-state">
        <span className="shared-empty-text">No circuit yet — paste the Circuit screenshot</span>
      </div>
    );
  }
  const P = circuit.panel || { x0: 0, y0: 0, x1: shot.W, y1: shot.H };
  const vb = `${P.x0} ${P.y0} ${P.x1 - P.x0} ${P.y1 - P.y0}`;
  return (
    <div className="cir-working">
      <svg className="cir-overlay" viewBox={vb} role="img" aria-label="Circuit as read">
        <image href={shot.uri} x="0" y="0" width={shot.W} height={shot.H} />
        {(circuit.resistors || []).map((r, i) => (
          <g key={i}>
            <rect x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} rx="5" className="cir-box" />
            <text x={r.x + r.w / 2} y={r.y - 6} className="cir-tag">{values[i] != null ? `${values[i]}Ω` : '?'}</text>
          </g>
        ))}
        {(circuit.terminals || []).map((t, i) => (
          <text key={i} x={t.x} y={t.y - 12} className="cir-term">{i ? 'B' : 'A'}</text>
        ))}
      </svg>
      <table className="cir-table">
        <thead><tr><th>#</th><th>Colour</th><th>Ω</th><th>Between</th></tr></thead>
        <tbody>
          {(circuit.resistors || []).map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <span className="cir-swatch" style={{ background: SWATCH[colors[i]] || '#888' }} />
                <select value={colors[i]} onChange={(e) => onColor(i, e.target.value)}>
                  {colorNames.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td>{values[i] != null ? values[i] : '—'}</td>
              <td>{r.a == null || r.b == null ? '⚠ loose end' : `node ${r.a} ↔ ${r.b}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
