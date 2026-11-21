import React, { createContext, useContext, useState } from 'react';
import { useInstance } from '../InstanceContext.jsx';

// When a copy is laid out in two columns, ModuleInput's buttons (clear, sample …) are shown on the
// answer side: this is the DOM node they're portalled into (null = render them in place).
const ControlsSlot = createContext(null);
export const useControlsSlot = () => useContext(ControlsSlot);

/**
 * ModuleLayout enforces the strict top-to-bottom layout:
 * 1. Input Area (dropzone/controls)
 * 2. Answer Section (AnswerPanel)
 * 3. Copy-Paste Section (CopyLines)
 * 4. Working Section (WorkingPanel)
 *
 * One of several stacked copies (Password ×4 …) is laid out like Wire Sequences instead:
 * paste area on the left, answer + copy lines + buttons on the right, the working panel
 * (collapsed) full width underneath.
 */
export function ModuleLayout({
  input = null,
  answers = null,
  copylines = null,
  working = null,
  children = null
}) {
  const inst = useInstance();
  const [slot, setSlot] = useState(null);

  if (inst && inst.multi) {
    return (
      <div className="module-layout-container split">
        <div className="module-layout-split">
          <div className="module-layout-left">
            <ControlsSlot.Provider value={slot}>
              {input && <div className="module-layout-input">{input}</div>}
            </ControlsSlot.Provider>
          </div>
          <div className="module-layout-right">
            {answers && <div className="module-layout-answers">{answers}</div>}
            {copylines && <div className="module-layout-copylines">{copylines}</div>}
            <div className="module-layout-controls" ref={setSlot} />
          </div>
        </div>
        {working && <div className="module-layout-working">{working}</div>}
        {children}
      </div>
    );
  }

  return (
    <div className="module-layout-container">
      {/* 1. Input area */}
      {input && <div className="module-layout-input">{input}</div>}

      {/* 2. Answer section */}
      {answers && <div className="module-layout-answers">{answers}</div>}

      {/* 3. Copy-paste section */}
      {copylines && <div className="module-layout-copylines">{copylines}</div>}

      {/* 4. Working section */}
      {working && <div className="module-layout-working">{working}</div>}

      {/* Custom slots / additional module-specific children if needed */}
      {children}
    </div>
  );
}
