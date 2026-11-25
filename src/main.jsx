import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppStateProvider } from './core/AppStateContext.jsx';
import { ThemeProvider } from './core/ThemeContext.jsx';
import { ToastProvider } from './core/ToastContext.jsx';
import { App } from './App.jsx';

import { GameChooser, SwitchGameLink, currentGame, chooserCss } from './core/GameChooser.jsx';

// Each game's CSS is added only when that game is chosen (both style body / :root differently).
const BOMB_CSS = import.meta.glob('./styles/**/*.css', { query: '?inline', import: 'default', eager: true });
const BOMB_CSS_ORDER = [
  './styles/main.css',
  './styles/components/modulelayout.css',
  './styles/components/moduleinput.css',
  './styles/components/answerpanel.css',
  './styles/components/copylines.css',
  './styles/components/workingpanel.css',
  './styles/components/common.css',
  './styles/components/sidebar.css',
  './styles/modules/mines.css',
  './styles/modules/queens.css',
  './styles/modules/morse.css',
  './styles/modules/search.css',
  './styles/modules/maze.css',
  './styles/modules/password.css',
  './styles/modules/diagram.css',
  './styles/modules/piano.css',
  './styles/modules/switches.css',
  './styles/modules/wof.css',
  './styles/modules/knob.css',
  './styles/modules/cube.css',
  './styles/modules/logic.css',
  './styles/modules/chess.css',
  './styles/modules/simons.css',
  './styles/modules/wireseq.css',
  './styles/modules/complexwires.css',
  './styles/modules/symbols.css',
  './styles/modules/button.css',
  './styles/modules/balance.css',
  './styles/modules/chess63.css',
  './styles/modules/circuit.css',
  './styles/modules/limbo.css',
  './styles/modules/astrology.css',
  './styles/modules/pipes.css',
  './styles/modules/hangman.css',
  './styles/modules/blackjack.css',
  './styles/modules/batteries.css',
  './styles/modules/wireplace.css',
  './styles/modules/battleship.css',
  './styles/modules/laundry.css',
  './styles/modules/bluescreen.css',
  './styles/modules/wires.css',
  './styles/modules/memory.css',
  './styles/skins/cyberpunk.css', // the Cyberpunk 2077 theme (only while <html data-skin="cyberpunk">)
  './styles/skins/friends.css', // the Yuza and Dixie themes (data-skin="yuza" / "dixie"); Heist uses it too
  './styles/components/touch.css' // last: phone sizes override the modules' own
];

function addStyle(text, id) {
  const el = document.createElement('style');
  el.id = id; el.textContent = text;
  document.head.appendChild(el);
}

const rootEl = document.getElementById('root');
const root = rootEl ? createRoot(rootEl) : null;
let shown; // the game on screen: 'bomb', 'heist', or null for the chooser

// Games switch inside this page, never by reloading it. A phone opens a downloaded .html as a
// content:// address that the browser may not be allowed to read a second time, so the old reload
// on every choice ended in "File couldn't be accessed". Only one game is ever live: the one being
// left is unmounted (the heist takes its page-wide listeners with it, see HeistApp) and its CSS removed.
// bomb.html is built with __BOMB_ONLY__ = true: no chooser, and the heist code is left out of the file.
if (!__BOMB_ONLY__) {
  // the chooser's links, the ⇄ link, the back button and a hash typed by hand all land here
  window.addEventListener('hashchange', () => show(currentGame()));
  addStyle(chooserCss, 'css-chooser');
}

// Only the shown game's CSS is in the page: both style body / :root differently.
function keepCssOf(g) {
  if (g !== 'bomb') document.querySelectorAll('style[id^="css-bomb-"]').forEach(s => s.remove());
  if (g !== 'heist') document.getElementById('css-heist')?.remove();
}

async function show(g) {
  if (!root || g === shown) return;
  shown = g;
  if (!__BOMB_ONLY__ && g === 'heist') {
    const [{ HeistApp }, { default: heistCss }] = await Promise.all([
      import('./heist/HeistApp.jsx'),
      import('./heist/heist.css?inline')
    ]);
    if (shown !== 'heist') return; // another choice was made while it loaded
    keepCssOf('heist');
    // + the Yuza and Dixie themes, shared with the bomb app (Heist's Cyberpunk one is in heist.css)
    if (!document.getElementById('css-heist')) addStyle(heistCss + '\n' + (BOMB_CSS['./styles/skins/friends.css'] || ''), 'css-heist');
    root.render(<HeistApp />);
    return;
  }
  keepCssOf(g);
  if (g === 'bomb') {
    if (!document.getElementById('css-bomb-0')) BOMB_CSS_ORDER.forEach((f, i) => addStyle(BOMB_CSS[f] || '', 'css-bomb-' + i));
    root.render(
      <React.StrictMode>
        <AppStateProvider>
          <ThemeProvider>
            <ToastProvider>
              <App />
              {!__BOMB_ONLY__ && <SwitchGameLink />}
            </ToastProvider>
          </ThemeProvider>
        </AppStateProvider>
      </React.StrictMode>
    );
    return;
  }
  document.title = 'Heist or Bombs?';
  root.render(<GameChooser />);
}
show(__BOMB_ONLY__ ? 'bomb' : currentGame());
