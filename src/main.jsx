import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppStateProvider } from './core/AppStateContext.jsx';
import { ThemeProvider } from './core/ThemeContext.jsx';
import { ToastProvider } from './core/ToastContext.jsx';
import { App } from './App.jsx';

// Import all styling
import './styles/main.css';
import './styles/components/modulelayout.css';
import './styles/components/moduleinput.css';
import './styles/components/answerpanel.css';
import './styles/components/copylines.css';
import './styles/components/workingpanel.css';
import './styles/components/common.css';
import './styles/components/sidebar.css';

import './styles/modules/mines.css';
import './styles/modules/queens.css';
import './styles/modules/morse.css';
import './styles/modules/search.css';
import './styles/modules/maze.css';
import './styles/modules/password.css';
import './styles/modules/diagram.css';
import './styles/modules/piano.css';
import './styles/modules/switches.css';
import './styles/modules/wof.css';
import './styles/modules/knob.css';
import './styles/modules/cube.css';
import './styles/modules/logic.css';
import './styles/modules/chess.css';
import './styles/modules/simons.css';
import './styles/modules/wireseq.css';
import './styles/modules/complexwires.css';
import './styles/modules/symbols.css';
import './styles/modules/button.css';
import './styles/modules/balance.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <AppStateProvider>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </AppStateProvider>
    </React.StrictMode>
  );
}
