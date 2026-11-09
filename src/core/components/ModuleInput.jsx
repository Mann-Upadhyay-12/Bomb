import React from 'react';
import { useAppState } from '../AppStateContext.jsx';
import { useTheme } from '../ThemeContext.jsx';

export function ModuleInput({
  dropzone = null,
  preview = null,
  controls = null,
  children = null
}) {
  const { copyOnDecode, setCopyOnDecode } = useAppState();
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="module-input-wrap">
      <div className="controls">
        <button
          className={`copy-btn ${copyOnDecode ? 'on' : ''}`}
          type="button"
          aria-pressed={copyOnDecode}
          onClick={() => setCopyOnDecode(!copyOnDecode)}
        >
          <span className="swatch"></span> COPY ON DECODE
        </button>
        <button
          className="reset-btn"
          type="button"
          title="Switch between Dark and Parchment theme"
          onClick={toggleTheme}
        >
          {isDark ? '📜 PARCHMENT' : '🌙 DARK'}
        </button>
        {controls}
      </div>

      {dropzone}

      {preview}

      {children}
    </div>
  );
}
