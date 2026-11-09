import React from 'react';

const SHOWN = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

const CYCLE = ['', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];

export function ChessWorking({
  merged = Array(64).fill(''),
  onSquareClick = () => {}
}) {
  return (
    <div className="chess-working-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      <div
        className="chess-board-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 44px)',
          gridTemplateRows: 'repeat(8, 44px)',
          border: '2px solid var(--line)',
          borderRadius: '8px',
          overflow: 'hidden'
        }}
      >
        {Array.from({ length: 64 }, (_, i) => {
          const r = Math.floor(i / 8);
          const c = i % 8;
          const isDarkSquare = (r + c) % 2 === 1;
          const piece = merged[i] || '';
          const symbol = SHOWN[piece] || '';
          const isWhitePiece = piece && piece === piece.toUpperCase();

          return (
            <div
              key={i}
              onClick={() => {
                const curIdx = CYCLE.indexOf(piece);
                const nextPiece = CYCLE[(curIdx + 1) % CYCLE.length];
                onSquareClick(i, nextPiece);
              }}
              style={{
                width: '44px',
                height: '44px',
                background: isDarkSquare ? '#769656' : '#eeeed2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                color: isWhitePiece ? '#FFFFFF' : '#12141A',
                filter: isWhitePiece ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' : 'none',
                cursor: 'pointer',
                userSelect: 'none'
              }}
              title={`Square ${String.fromCharCode(97 + c)}${8 - r}: ${piece || 'empty'} (click to cycle)`}
            >
              {symbol}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
        Click any square to cycle pieces (White Pawn → King → Black Pawn → King → Empty)
      </div>
    </div>
  );
}
