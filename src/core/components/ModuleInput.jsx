import React from 'react';
import { useAppState } from '../AppStateContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import { useInstance } from '../InstanceContext.jsx';

export function ModuleInput({
  dropzone = null,
  preview = null,
  controls = null,
  children = null
}) {
  const { copyOnDecode, setCopyOnDecode } = useAppState();
  const { isDark, toggleTheme } = useTheme();
  // in a group of several cards these app-wide toggles are shown once, at the top of the group
  const inst = useInstance();
  const inGroup = Boolean(inst && inst.multi);

  return (
    <div className="module-input-wrap">
      <div className="controls">
        {!inGroup && <>
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
        </>}
        {controls}
      </div>

      {dropzone}

      {preview}

      {children}
    </div>
  );
}
