// Stockfish web worker controller & FEN utilities
//
// One engine worker, shared by every chess solver (Chess and the 5-Chess batch of level 6.4):
// public/stockfish.js, "Stockfish 2019-08-15 Multi-Variant" (the stockfish.js 10.0.2 build).
// How it answers over UCI, measured in the browser (tests/chessEngine.test.js fakes the same):
//  - 'isready' is answered at once, even in the middle of a search, so a 'readyok' does NOT mean a
//    stopped search is over: its 'bestmove' can still come after it;
//  - every 'go' ends with exactly one 'bestmove', also after a 'stop';
//  - a new 'position' sent before that 'bestmove' gets mixed into the old search's reply.
// The old code started the next search on 'readyok', so a search could be answered with the move
// of the search before it (another board or the other side). Now a search starts only once the
// previous search's own 'bestmove' is back, and a 'bestmove' only answers the search whose 'go' is out.
import { INLINE_ENGINE, loadStockfishSource } from './stockfishSource.js';

export const ENGINE_URLS = [
  INLINE_ENGINE,
  '/stockfish.js',
  'stockfish.js',
  'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js',
  'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js'
];

let worker = null;
let engineReady = null;
let lastStatus = 'Engine offline';
const statusListeners = new Set();

let busy = false;      // a 'go' is out and its 'bestmove' hasn't come back yet
let active = null;     // { onLine, onBest } of the search whose 'go' is out; null once that search was dropped
let idleWaiters = [];  // called when the engine has no search running

function emitStatus(text) {
  lastStatus = text;
  statusListeners.forEach(fn => { try { fn(text); } catch (e) {} });
}

function onEngineLine(line) {
  if (line.startsWith('bestmove')) {
    busy = false;
    const a = active;
    active = null;
    const waiters = idleWaiters;
    idleWaiters = [];
    if (a) a.onBest(line.split(' ')[1]);
    waiters.forEach(f => f());
    return;
  }
  if (active) active.onLine(line);
}

/** Resolves true once no search is running, false if the engine hasn't finished within `ms`. */
function whenIdle(ms) {
  if (!busy) return Promise.resolve(true);
  return new Promise(resolve => {
    const f = () => { clearTimeout(t); resolve(true); };
    const t = setTimeout(() => { idleWaiters = idleWaiters.filter(x => x !== f); resolve(false); }, ms);
    idleWaiters.push(f);
  });
}

/** An engine that never sent its 'bestmove' is thrown away; the next search loads a fresh one. */
function dropEngine() {
  if (worker) { try { worker.terminate(); } catch (e) {} }
  worker = null;
  engineReady = null;
  busy = false;
  active = null;
  const waiters = idleWaiters;
  idleWaiters = [];
  waiters.forEach(f => f());
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
          source = url === INLINE_ENGINE ? await loadStockfishSource() : await (await fetch(url)).text();
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
        busy = false;
        active = null;
        worker.onmessage = event => onEngineLine(String(event.data));
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

/** Tests: use this worker (a fake engine) instead of loading Stockfish. */
export function attachEngineForTests(w) {
  worker = w;
  busy = false;
  active = null;
  idleWaiters = [];
  current = null;
  worker.onmessage = event => onEngineLine(String(event.data));
  engineReady = Promise.resolve(true);
}

export function stopEngineListener(onStatusChange) {
  statusListeners.delete(onStatusChange);
}

/**
 * Searches share one engine and run one at a time. A new search from the same owner (e.g. the same
 * Chess window) stops that owner's running search, whose promise resolves to SUPERSEDED; a search
 * from another owner waits its turn instead, so several Chess windows in one mission don't cancel
 * each other.
 */
export const SUPERSEDED = Symbol('superseded');
let current = null; // { owner, done: Promise, cancel(value) }

/** One search: every engine line goes to onLine(line, stop); resolves to the bestmove (uci), null or SUPERSEDED. */
async function search(fen, milliseconds, owner, multiPV, onLine) {
  if (!worker) await startEngine();
  if (!worker) return null;
  while (current && current.owner !== owner) await current.done;
  if (current) current.cancel(SUPERSEDED); // this owner's older search: answered SUPERSEDED, its search stopped

  let markDone;
  const me = { owner, done: new Promise(r => { markDone = r; }) };
  current = me;

  return new Promise(resolve => {
    let settled = false;
    let timer = 0;
    let mine = null;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // dropped before its answer: stop it; its 'bestmove' still comes (the engine stays busy until
      // then) and answers nobody
      if (mine && active === mine) {
        active = null;
        try { worker.postMessage('stop'); } catch (e) {}
      }
      if (current === me) current = null;
      markDone();
      resolve(val);
    };
    me.cancel = finish;

    (async () => {
      // the search before this one must have sent its own 'bestmove' first
      if (!(await whenIdle(5000))) {
        dropEngine();
        await startEngine();
      }
      if (settled) return; // replaced while waiting
      if (!worker) { finish(null); return; }
      let stopSent = false;
      const stop = () => {
        if (!stopSent && active === mine) { stopSent = true; worker.postMessage('stop'); }
      };
      mine = { onLine: (line) => { if (onLine) onLine(line, stop); }, onBest: (uci) => finish(uci) };
      active = mine;
      busy = true;
      worker.postMessage('ucinewgame');
      worker.postMessage(`setoption name MultiPV value ${multiPV}`);
      worker.postMessage('position fen ' + fen);
      worker.postMessage('go movetime ' + milliseconds);
      timer = setTimeout(() => finish(null), milliseconds + 4000);
    })();
  });
}

/** Drop this owner's search (a window closing): it resolves to SUPERSEDED and the engine is stopped. */
export function cancelSearch(owner) {
  if (current && current.owner === owner && current.cancel) current.cancel(SUPERSEDED);
}

/**
 * Ask Stockfish for the best move (uci), null when there's no engine, or SUPERSEDED.
 * settle: also stop once the best move has stayed the same for a while from depth 14 (the 5-Chess
 * batch solver, which has 10 positions to get through).
 */
export function askEngine(fen, milliseconds, onInfo, owner = 'default', { settle = false } = {}) {
  let lastPv = '';
  let stable = 0;
  return search(fen, milliseconds, owner, 1, (line, stop) => {
    if (!line.startsWith('info') || !line.includes(' score ')) return;
    const depth = (line.match(/ depth (\d+)/) || [])[1] || '';
    const cp = (line.match(/score cp (-?\d+)/) || [])[1] || '';
    const mate = (line.match(/score mate (-?\d+)/) || [])[1] || '';
    if (onInfo) onInfo({ depth, cp, mate });
    // A forced mate proven at a depth well past its length can't be beaten by thinking longer
    // (any shorter mate would have shown up at a lower depth): answer now instead of after the
    // full movetime.
    if (mate && +mate > 0 && +depth >= Math.min(12, +mate * 2 + 2)) { stop(); return; }
    if (settle) {
      const pv = (line.match(/ pv (\S+)/) || [])[1] || '';
      if (pv) { stable = pv === lastPv ? stable + 1 : 0; lastPv = pv; }
      if (+depth >= 14 && stable >= 6) stop();
    }
  });
}

/**
 * The engine's move checked against the board it was asked about, with chess.js (loaded from the
 * page): its SAN, or null when the move isn't legal there (an answer that belongs to another search
 * must never be shown). Without chess.js the uci text is returned unchecked.
 */
export function legalSan(fen, uci) {
  if (!uci) return null;
  if (typeof window === 'undefined' || typeof window.Chess === 'undefined') return uci;
  try {
    const m = new window.Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return m ? m.san : null;
  } catch (e) {
    return null;
  }
}

/**
 * A move's score as one number, from the side that plays it: centipawns, or ±(100000 − moves) for a
 * forced mate — so walking into a mate in 1 (−99999) is worse than a mate in 3 (−99997).
 */
export const moveValue = (m) => (m.mate != null ? (m.mate > 0 ? 100000 - m.mate : -100000 - m.mate) : m.cp);

/**
 * Collect MultiPV lines: the last line printed for each slot. Stockfish prints every slot at the
 * end of each iteration (slots not yet searched at the new depth keep the previous depth's score).
 */
export function multiPvCollector() {
  const slots = new Map();
  return {
    line(text) {
      if (!text.startsWith('info') || !text.includes(' multipv ')) return null;
      const idx = +((text.match(/ multipv (\d+)/) || [])[1] || 0);
      const uci = (text.match(/ pv (\S+)/) || [])[1];
      const cp = text.match(/score cp (-?\d+)/), mate = text.match(/score mate (-?\d+)/);
      if (!idx || !uci || (!cp && !mate)) return null;
      const m = { uci, depth: +((text.match(/ depth (\d+)/) || [])[1] || 0), cp: cp ? +cp[1] : null, mate: mate ? +mate[1] : null };
      slots.set(idx, m);
      return m;
    },
    /** every move once, worst first */
    moves() {
      const byMove = new Map();
      [...slots.keys()].sort((a, b) => a - b).forEach(k => { const m = slots.get(k); byMove.set(m.uci, { ...m, value: moveValue(m) }); });
      return [...byMove.values()].sort((a, b) => a.value - b.value);
    }
  };
}

/**
 * Score EVERY legal move (MultiPV) so the worst one — the blunder — can be picked.
 * → [{ uci, cp, mate, depth, value }] worst first ([] when there's no legal move), null, or SUPERSEDED.
 */
export async function scoreAllMoves(fen, milliseconds, onInfo, owner = 'default') {
  const col = multiPvCollector();
  const best = await search(fen, milliseconds, owner, 256, (line) => {
    const m = col.line(line);
    if (m && onInfo) onInfo({ depth: m.depth });
  });
  if (best === SUPERSEDED || best === null) return best;
  return col.moves();
}

/** Board (64 squares, a8 first) → FEN. side: 'w' or 'b' — the puzzle says whose move it is. */
export function toFen(boardState, side = 'w') {
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
  return ranks.join('/') + (side === 'b' ? ' b' : ' w') + ' - - 0 1';
}

/**
 * Is the king of `color` ('w' or 'b') attacked? Used to rule out an impossible side to move: the
 * side NOT to move can never be in check, so if Black is in check it must be Black's move.
 */
export function kingInCheck(board, color) {
  const white = color === 'w';
  const kingSq = board.indexOf(white ? 'K' : 'k');
  if (kingSq < 0) return false;
  const kr = Math.floor(kingSq / 8), kc = kingSq % 8;
  const enemy = (ch) => Boolean(ch) && (white ? ch === ch.toLowerCase() : ch === ch.toUpperCase());
  const at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? board[r * 8 + c] : null);
  const is = (ch, type) => enemy(ch) && ch.toLowerCase() === type;
  // pawns: a white king is attacked by black pawns one rank above it (row - 1), and vice versa
  const pr = white ? kr - 1 : kr + 1;
  if (is(at(pr, kc - 1), 'p') || is(at(pr, kc + 1), 'p')) return true;
  for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
    if (is(at(kr + dr, kc + dc), 'n')) return true;
  }
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if ((dr || dc) && is(at(kr + dr, kc + dc), 'k')) return true;
    }
  }
  const slide = (dirs, types) => dirs.some(([dr, dc]) => {
    for (let r = kr + dr, c = kc + dc; r >= 0 && r < 8 && c >= 0 && c < 8; r += dr, c += dc) {
      const ch = board[r * 8 + c];
      if (!ch) continue;
      return enemy(ch) && types.includes(ch.toLowerCase());
    }
    return false;
  });
  return slide([[1, 0], [-1, 0], [0, 1], [0, -1]], 'rq') || slide([[1, 1], [1, -1], [-1, 1], [-1, -1]], 'bq');
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
