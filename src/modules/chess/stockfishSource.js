// Stockfish bundled into the build, so the single-file dist/index.html runs the chess solvers
// offline without a separate stockfish.js next to it. Lazy so plain-Node tests can import the engine.
export const INLINE_ENGINE = 'inline:stockfish';
export const loadStockfishSource = () => import('../../../public/stockfish.js?raw').then(m => m.default);
