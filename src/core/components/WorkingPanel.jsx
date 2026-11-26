import React, { useEffect, useRef, useState } from 'react';
import { useInstance } from '../InstanceContext.jsx';
import { useSetting } from '../settings.js';

// Settings → working panels: 'module' (each module's own choice), 'open' or 'closed' for all
const startOpen = (panels, inst, defaultExpanded) => (panels === 'open' ? true : panels === 'closed' ? false
  : inst && inst.multi ? false : defaultExpanded);

export function WorkingPanel({
  title = 'WORKING / SOLUTION LOGIC',
  legend = null,
  collapsible = true,
  defaultExpanded = true,
  children
}) {
  // Several copies side by side: start collapsed so every card's answer fits on one screen
  const inst = useInstance();
  const [panels] = useSetting('workingPanels');
  const [expanded, setExpanded] = useState(() => startOpen(panels, inst, defaultExpanded));
  // a change in Settings applies to the panels already on screen too
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setExpanded(startOpen(panels, inst, defaultExpanded));
  }, [panels]);

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
