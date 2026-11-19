import React, { useState } from 'react';
import { useInstance } from '../InstanceContext.jsx';

export function WorkingPanel({
  title = 'WORKING / SOLUTION LOGIC',
  legend = null,
  collapsible = true,
  defaultExpanded = true,
  children
}) {
  // Several copies side by side: start collapsed so every card's answer fits on one screen
  const inst = useInstance();
  const [expanded, setExpanded] = useState(inst && inst.multi ? false : defaultExpanded);

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
