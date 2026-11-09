import React, { useState } from 'react';

export function WorkingPanel({
  title = 'WORKING / SOLUTION LOGIC',
  legend = null,
  collapsible = true,
  defaultExpanded = true,
  children
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!children) return null;

  return (
    <div className={`working-panel ${expanded ? 'expanded' : 'collapsed'}`}>
      <div
        className="working-panel-header"
        onClick={() => collapsible && setExpanded(!expanded)}
        style={{ cursor: collapsible ? 'pointer' : 'default' }}
      >
        <div className="working-panel-title-wrap">
          {collapsible && (
            <span className="working-panel-toggle">{expanded ? '▼' : '▶'}</span>
          )}
          <span className="working-panel-title">{title}</span>
        </div>
        {legend && <div className="working-panel-legend">{legend}</div>}
      </div>
      {expanded && (
        <div className="working-panel-content">
          {children}
        </div>
      )}
    </div>
  );
}
