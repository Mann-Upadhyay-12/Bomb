import React from 'react';

export function PianoWorking({
  notes = [{ pos: 0, acc: 0 }, { pos: 0, acc: 0 }],
  noteNames = ['', ''],
  onPosChange = () => {},
  onAccChange = () => {}
}) {
  return (
    <div className="piano-working-container">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {notes.map((n, i) => (
          <div key={i} className="bg-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="bg-label" style={{ width: '80px', fontWeight: 700 }}>Note {i + 1}</span>
            <button
              type="button"
              className="bg-btn"
              onClick={() => onPosChange(i, -1)}
              title="Move pitch down"
            >
              ▼
            </button>
            <button
              type="button"
              className="bg-btn"
              onClick={() => onPosChange(i, 1)}
              title="Move pitch up"
            >
              ▲
            </button>
            <select
              className="bg-hex"
              style={{ width: '80px', padding: '4px' }}
              value={String(n.acc)}
              onChange={(e) => onAccChange(i, Number(e.target.value))}
            >
              <option value="0">♮ Natural</option>
              <option value="1">♯ Sharp</option>
              <option value="-1">♭ Flat</option>
            </select>
            <span className="pn-name" style={{ fontWeight: 700, fontSize: '16px', color: 'var(--brass)' }}>
              {noteNames[i] || '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
