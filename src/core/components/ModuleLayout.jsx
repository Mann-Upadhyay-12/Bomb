import React from 'react';

/**
 * ModuleLayout enforces the strict top-to-bottom layout:
 * 1. Input Area (dropzone/controls)
 * 2. Answer Section (AnswerPanel)
 * 3. Copy-Paste Section (CopyLines)
 * 4. Working Section (WorkingPanel)
 */
export function ModuleLayout({
  input = null,
  answers = null,
  copylines = null,
  working = null,
  children = null
}) {
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
