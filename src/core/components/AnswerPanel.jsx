import React from 'react';
import { useClipboard } from '../useClipboard.js';
import { useToast } from '../ToastContext.jsx';

export function AnswerPanel({
  label = 'GUARANTEED SAFE SQUARES',
  stats = null,
  hint = 'CLICK TO COPY',
  answers = [],
  placeholder = '— — —',
  copyValue = null
}) {
  const { copy } = useClipboard();
  const { flash } = useToast();

  const handleCopy = () => {
    if (copyValue) {
      copy(copyValue);
    } else if (Array.isArray(answers) && answers.length > 0) {
      copy(answers.join(' '));
    } else if (typeof answers === 'string' && answers) {
      copy(answers);
    }
  };

  return (
    <div
      className={`stamp ${flash ? 'flash' : ''}`}
      role="button"
      tabIndex={0}
      title="Click to copy answer to clipboard"
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCopy();
        }
      }}
    >
      <div className="stamp-label-row">
        <div className="stamp-label">{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {stats && <span className="stamp-stats">{stats}</span>}
          <span className="stamp-hint">{hint}</span>
        </div>
      </div>
      <div className="stamp-word">
        {(!answers || (Array.isArray(answers) && answers.length === 0)) ? (
          <span className="ph">{placeholder}</span>
        ) : Array.isArray(answers) ? (
          answers.map((ans, idx) => (
            <span key={idx} className="safe-tag">{ans}</span>
          ))
        ) : (
          <span className="safe-tag">{answers}</span>
        )}
      </div>
    </div>
  );
}
