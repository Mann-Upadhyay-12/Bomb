// Stockfish web worker controller & FEN utilities

export const ENGINE_URLS = [
  '/stockfish.js',
  'stockfish.js',
  'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js',
  'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js'
];

let worker = null;
let engineReady = null;

export function startEngine(onStatusChange) {
  if (engineReady) return engineReady;
  engineReady = (async () => {
    if (onStatusChange) onStatusChange('Loading Stockfish…');
    for (const url of ENGINE_URLS) {
      try {
        let source = '';
        try {
          source = await (await fetch(url)).text();
        } catch (e) {}

        if (source) {
          const blobUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
          worker = new Worker(blobUrl);
        } else {
          worker = new Worker(url);
        }

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 5000);
          worker.onmessage = event => {
            if (String(event.data).includes('readyok')) {
              clearTimeout(timeout);
              resolve();
            }
          };
          worker.onerror = reject;
          worker.postMessage('uci');
          worker.postMessage('isready');
        });
        if (onStatusChange) onStatusChange('Stockfish ready ✓');
        return true;
      } catch (error) {}
    }
    if (onStatusChange) onStatusChange('⚠ Engine load failed (check network/stockfish.js)');
    return false;
  })();
  return engineReady;
}

export function askEngine(fen, milliseconds, onInfo) {
  return new Promise(resolve => {
    if (!worker) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => {
      resolve(null);
    }, milliseconds + 2000);

    worker.onmessage = event => {
      const line = String(event.data);
      if (line.startsWith('info') && line.includes(' score ') && onInfo) {
        const depth = (line.match(/ depth (\d+)/) || [])[1] || '';
        const cp = (line.match(/score cp (-?\d+)/) || [])[1] || '';
        const mate = (line.match(/score mate (-?\d+)/) || [])[1] || '';
        onInfo({ depth, cp, mate });
      }
      if (line.startsWith('bestmove')) {
        clearTimeout(timer);
        resolve(line.split(' ')[1]);
      }
    };
    worker.postMessage('ucinewgame');
    worker.postMessage('position fen ' + fen);
    worker.postMessage('go movetime ' + milliseconds);
  });
}

export function toFen(boardState) {
  const ranks = [];
  for (let row = 0; row < 8; row++) {
    let text = '';
    let empty = 0;
    for (let col = 0; col < 8; col++) {
      const piece = boardState[row * 8 + col];
      if (!piece) { empty++; continue; }
      if (empty) text += empty;
      empty = 0;
      text += piece;
    }
    if (empty) text += empty;
    ranks.push(text);
  }
  return ranks.join('/') + ' w - - 0 1';
}

export function parseFen(fen) {
  const placement = (fen || '').trim().split(/\s+/)[0] || '';
  const rows = placement.split('/');
  if (rows.length !== 8) return null;

  const newMerged = Array(64).fill('');
  const newWhite = Array(64).fill('');
  const newBlack = Array(64).fill('');
  rows.forEach((text, row) => {
    let col = 0;
    for (const ch of text) {
      if (/\d/.test(ch)) {
        col += Number(ch);
      } else if (col < 8) {
        const idx = row * 8 + col;
        newMerged[idx] = ch;
        if (ch === ch.toUpperCase()) newWhite[idx] = ch;
        else newBlack[idx] = ch;
        col++;
      }
    }
  });
  return { merged: newMerged, white: newWhite, black: newBlack };
}
