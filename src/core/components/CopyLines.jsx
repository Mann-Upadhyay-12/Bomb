import React from 'react';
import { useClipboard } from '../useClipboard.js';

export function CopyLines({ items = [] }) {
  const { copy } = useClipboard();

  if (!items || items.length === 0) return null;

  return (
    <div className="copy-lines-row">
      {items.map((item, idx) => {
        const label = item.label || item.value;
        const val = item.value;
        const toast = item.toast || 'COPIED ✓';
        return (
          <button
            key={idx}
            type="button"
            className="copy-line-btn"
            onClick={() => copy(val, toast)}
            title={`Copy ${label}`}
          >
            <span className="copy-line-icon">📋</span>
            <span className="copy-line-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
