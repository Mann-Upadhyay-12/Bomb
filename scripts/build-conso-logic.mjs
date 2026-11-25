// node scripts/build-conso-logic.mjs
// Bundles this app's module logic (image readers + solvers, no React) into one plain script for
// conso's app: conso/bomb2.0/bomb-logic.js, loaded before its module scripts. It defines
// window.BombLogic = { mines: {...}, queens: {...}, ... }: each module's exports, solver and reader
// together. Conso's modules call these instead of keeping their own copies, so re-running this
// after a logic change here is the whole sync.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'conso/bomb2.0/bomb-logic.js');

// module → its logic files (src/modules/<dir>/<file>.js); only files without React
const MODULES = {
  mines: ['mines/minesSolver', 'mines/minesVision'],
  queens: ['queens/queensConstants', 'queens/queensSolver', 'queens/queensVision'],
  search: ['search/searchGlyphs', 'search/searchOCR', 'search/searchSolver', 'search/searchWords'],
  password: ['password/passwordSolver', 'password/passwordVision'],
  switches: ['switches/switchesSolver', 'switches/switchesVision'],
  diagram: ['diagram/diagramCore'],
  wof: ['wof/wofSolver', 'wof/wofOCR'],
  logic: ['logic/logicSolver'],
  complexwires: ['complexwires/complexwiresConstants', 'complexwires/complexwiresVision'],
  symbols: ['symbols/symbolsConstants', 'symbols/symbolsVision'],
  button: ['button/buttonSolver', 'button/buttonVision'],
  piano: ['piano/pianoSolver', 'piano/pianoVision'],
  morse: ['morse/morseDecoder', '../utils/gif'],
  maze: ['maze/mazeSolver', 'maze/mazeVision'],
  simons: ['simons/simonsSolver', '../utils/gif'],
  knobs: ['knob/knobManual', 'knob/knobSolver', 'knob/knobVision'],
  wireseq: ['wireseq/wireseqManual', 'wireseq/wireseqRules'],
  limbo: ['../utils/gif', 'limbo/limboSolver'],
  pipes: ['pipes/pipesSolver', 'pipes/pipesVision'],
  hangman: ['hangman/hangmanSolver', 'hangman/hangmanVision', 'hangman/hangmanShot'],
  astrology: ['astrology/astroRefs', 'astrology/astrologyVision', 'astrology/astrologySolver'],
  cube: ['cube/cubeSolver', 'cube/cubeVision'],
  circuit: ['../utils/glyph', 'circuit/circuitDigits', 'circuit/circuitVision', 'circuit/circuitLegend', 'circuit/circuitSolver'],
  chess: ['chess/chessVision', 'chess/chessEngine'], // the reader + the Stockfish controller (one search at a time)
  // did the player leave the page since their last action? (an automatic copy then waits for a click)
  page: ['../core/leftPage'],
  // Discord markdown → the text Discord shows (a phone copies **P**: T with its markup)
  text: ['../utils/discordText'],
  // the modules added 2026-11-24 (Balance stays out)
  blackjack: ['blackjack/blackjackSolver', 'blackjack/blackjackVision'],
  batteries: ['../core/sectionsData', 'batteries/batteriesSolver', 'batteries/batteriesVision', 'batteries/batteriesOCR'],
  wireplace: ['wireplace/wireplaceSolver', 'wireplace/wireplaceVision'],
  laundry: ['laundry/laundrySolver', 'laundry/laundryVision', 'laundry/laundryOCR', 'laundry/laundrySprite'],
  battleship: ['battleship/battleshipSolver']
};

let entry = '';
const parts = [];
for (const [name, files] of Object.entries(MODULES)) {
  const ids = files.map((f, i) => `${name}_${i}`);
  files.forEach((f, i) => { entry += `import * as ${ids[i]} from './src/modules/${f}.js';\n`; });
  parts.push(`  ${name}: Object.freeze({ ${ids.map(id => `...${id}`).join(', ')} })`);
}
entry += `export default {\n${parts.join(',\n')}\n};\n`;

// This app builds Stockfish into its page (stockfishSource.js imports public/stockfish.js as text).
// Conso's page has no copy of it: there the engine's first source is the same build from jsdelivr,
// where conso's chess loaded it before.
const consoStockfish = {
  name: 'conso-stockfish',
  setup(b) {
    b.onResolve({ filter: /(^|[\\/])stockfishSource\.js$/ }, () => ({ path: 'conso-stockfish-source', namespace: 'conso' }));
    b.onLoad({ filter: /.*/, namespace: 'conso' }, () => ({
      loader: 'js',
      contents: `export const INLINE_ENGINE = 'inline:stockfish';
export const loadStockfishSource = () => fetch('https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js')
  .then(r => { if (!r.ok) throw new Error('stockfish.js ' + r.status); return r.text(); });`
    }));
  }
};

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
await build({
  stdin: { contents: entry, resolveDir: ROOT, sourcefile: 'conso-logic-entry.js', loader: 'js' },
  bundle: true,
  plugins: [consoStockfish],
  format: 'iife',
  globalName: '__BombLogic',
  footer: { js: 'window.BombLogic = __BombLogic.default;' },
  banner: {
    js: `// GENERATED from bomb_boomed (${stamp}) by scripts/build-conso-logic.mjs — do not edit here.\n` +
      `// window.BombLogic.<module>.<function>: the same image readers and solvers as bomb_boomed.`
  },
  target: ['es2020'], // BigInt (Circuit's exact fractions)
  legalComments: 'none',
  outfile: OUT,
  logLevel: 'warning'
});
console.log(`wrote ${path.relative(ROOT, OUT)}`);
