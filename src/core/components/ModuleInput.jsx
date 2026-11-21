import React from 'react';
import { createPortal } from 'react-dom';
import { useAppState } from '../AppStateContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import { useInstance } from '../InstanceContext.jsx';
import { useControlsSlot } from './ModuleLayout.jsx';

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
  // one of several stacked copies: the buttons sit on the answer side (see ModuleLayout)
  const slot = useControlsSlot();
  if (inGroup) {
    return (
      <div className="module-input-wrap">
        {controls && slot && createPortal(<div className="controls">{controls}</div>, slot)}
        {dropzone}
        {preview}
        {children}
      </div>
    );
  }

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
