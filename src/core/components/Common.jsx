import React from 'react';

export function Section({ title, extra, children, className = '' }) {
  return (
    <div className={`shared-section ${className}`}>
      {(title || extra) && (
        <div className="shared-section-header">
          {title && <span className="shared-section-title">{title}</span>}
          {extra && <div className="shared-section-extra">{extra}</div>}
        </div>
      )}
      <div className="shared-section-body">{children}</div>
    </div>
  );
}

export function EmptyState({ message = 'No data available yet — upload or paste input' }) {
  return (
    <div className="shared-empty-state">
      <span className="shared-empty-text">{message}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="shared-error-state">
      <span className="shared-error-icon">⚠️</span>
      <span className="shared-error-text">{error}</span>
      {onRetry && (
        <button type="button" className="bg-btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function ResultCard({ title, value, subtitle, highlight = false }) {
  return (
    <div className={`shared-result-card ${highlight ? 'highlight' : ''}`}>
      {title && <div className="src-title">{title}</div>}
      <div className="src-val">{value}</div>
      {subtitle && <div className="src-sub">{subtitle}</div>}
    </div>
  );
}
