import React from 'react';

export function KnobWorking({
  knobState = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  onLedToggle = () => {},
  direction = '—',
  arrow = '—'
}) {
  const rotMap = { 'UP': 0, 'RIGHT': 90, 'DOWN': 180, 'LEFT': 270 };
  const rot = rotMap[direction] !== undefined ? rotMap[direction] : 0;

  return (
    <div className="knob-working-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      {/* 12 LED grid (Top 6, Bottom 6) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[0, 1, 2, 3, 4, 5].map(i => {
            const on = knobState[i] === 1;
            return (
              <button
                key={i}
                type="button"
                className={`knob-led-btn ${on ? 'is-on' : 'is-off'}`}
                onClick={() => onLedToggle(i)}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '8px',
                  border: on ? '2px solid #F6AD55' : '1px solid var(--line)',
                  background: on ? 'rgba(246,173,85,0.25)' : 'var(--paper)',
                  color: on ? '#F6AD55' : 'var(--ink-soft)',
                  fontWeight: 700,
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                {on ? 'X' : 'O'}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {[6, 7, 8, 9, 10, 11].map(i => {
            const on = knobState[i] === 1;
            return (
              <button
                key={i}
                type="button"
                className={`knob-led-btn ${on ? 'is-on' : 'is-off'}`}
                onClick={() => onLedToggle(i)}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '8px',
                  border: on ? '2px solid #F6AD55' : '1px solid var(--line)',
                  background: on ? 'rgba(246,173,85,0.25)' : 'var(--paper)',
                  color: on ? '#F6AD55' : 'var(--ink-soft)',
                  fontWeight: 700,
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                {on ? 'X' : 'O'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Visual Direction Dial */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: '3px solid var(--brass)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `rotate(${rot}deg)`,
            transition: 'transform 0.25s ease'
          }}
        >
          <div style={{ fontSize: '32px' }}>⬆</div>
        </div>
        <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--brass)' }}>
          {arrow} {direction}
        </div>
      </div>
    </div>
  );
}
