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
  './styles/modules/circuit.css'
];

function addStyle(text, id) {
  const el = document.createElement('style');
  el.id = id; el.textContent = text;
  document.head.appendChild(el);
}

const rootEl = document.getElementById('root');
const game = currentGame();
// A hash edited by hand (#play=bomb ↔ #play=heist) doesn't reload the page on its own: do it, so
// only one game's code and CSS are ever live.
window.addEventListener('hashchange', () => { if (currentGame() !== game) location.reload(); });
addStyle(chooserCss, 'css-chooser');

async function boot() {
  if (!rootEl) return;
  const root = createRoot(rootEl);
  if (game === 'heist') {
    const [{ HeistApp }, { default: heistCss }] = await Promise.all([
      import('./heist/HeistApp.jsx'),
      import('./heist/heist.css?inline')
    ]);
    addStyle(heistCss, 'css-heist');
    root.render(<HeistApp />);
    return;
  }
  if (game === 'bomb') {
    BOMB_CSS_ORDER.forEach((f, i) => addStyle(BOMB_CSS[f] || '', 'css-bomb-' + i));
    root.render(
      <React.StrictMode>
        <AppStateProvider>
          <ThemeProvider>
            <ToastProvider>
              <App />
              <SwitchGameLink />
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
boot();
