// Stockfish web worker controller & FEN utilities

export const ENGINE_URLS = [
  '/stockfish.js',
  'stockfish.js',
  'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js',
  'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js'
];

let worker = null;
let engineReady = null;
let lastStatus = 'Engine offline';
const statusListeners = new Set();
let searchSeq = 0;

function emitStatus(text) {
  lastStatus = text;
  statusListeners.forEach(fn => { try { fn(text); } catch (e) {} });
}

// Every caller (e.g. several Chess windows in one mission) gets status updates,
// not only the first one that happened to start the engine.
export function startEngine(onStatusChange) {
  if (onStatusChange) {
    statusListeners.add(onStatusChange);
    onStatusChange(lastStatus);
  }
  if (engineReady) return engineReady;
  const onStatus = emitStatus;
  engineReady = (async () => {
    onStatus('Loading Stockfish…');
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
        onStatus('Stockfish ready ✓');
        return true;
      } catch (error) {
        if (worker) { try { worker.terminate(); } catch (e) {} }
        worker = null;
      }
    }
    onStatus('⚠ Engine load failed (check network/stockfish.js)');
    return false;
  })();
  return engineReady;
}

export function stopEngineListener(onStatusChange) {
  statusListeners.delete(onStatusChange);
}

/**
 * Ask Stockfish for the best move. Only one search runs at a time. A new search from the
 * same owner (e.g. the same Chess window) stops that owner's running search, whose promise
 * resolves to SUPERSEDED; a search from another owner waits its turn instead, so several
 * Chess windows in one mission don't cancel each other.
 */
export const SUPERSEDED = Symbol('superseded');
let pendingResolve = null;
let current = null; // { owner, done: Promise }

export async function askEngine(fen, milliseconds, onInfo, owner = 'default') {
  if (!worker && engineReady) await engineReady;
  if (!worker) return null;
  while (current && current.owner !== owner) await current.done;

  const mySeq = ++searchSeq;
  let stoppedPrevious = false;
  if (pendingResolve) {
    const prev = pendingResolve;
    pendingResolve = null;
    prev(SUPERSEDED);
    worker.postMessage('stop');
    stoppedPrevious = true;
  }

  let markDone;
  const me = { owner, done: new Promise(r => { markDone = r; }) };
  current = me;

  return new Promise(resolve => {
    // After 'stop' the old search still prints its bestmove; UCI processes commands in
    // order, so everything before the 'readyok' answering our 'isready' belongs to it.
    let waitingForBarrier = stoppedPrevious;
    const finish = (val) => {
      clearTimeout(timer);
      if (pendingResolve === finish) pendingResolve = null;
      if (current === me) current = null;
      markDone();
      resolve(val);
    };
    pendingResolve = finish;
    const timer = setTimeout(() => finish(null), milliseconds + 2000);

    worker.onmessage = event => {
      if (mySeq !== searchSeq) return;
      const line = String(event.data);
      if (waitingForBarrier) {
        if (line.includes('readyok')) waitingForBarrier = false;
        return;
      }
      if (line.startsWith('info') && line.includes(' score ') && onInfo) {
        const depth = (line.match(/ depth (\d+)/) || [])[1] || '';
        const cp = (line.match(/score cp (-?\d+)/) || [])[1] || '';
        const mate = (line.match(/score mate (-?\d+)/) || [])[1] || '';
        onInfo({ depth, cp, mate });
      }
      if (line.startsWith('bestmove')) {
        finish(line.split(' ')[1]);
      }
    };
    if (stoppedPrevious) worker.postMessage('isready');
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
