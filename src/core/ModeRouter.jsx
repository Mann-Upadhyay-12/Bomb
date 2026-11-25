import React from 'react';
import { useAppMode } from './AppStateContext.jsx';
import { KNOWN_MODULE_NAMES } from './sectionsData.js';

// The list lives in moduleRegistry.js (settings read it too); re-exported for the old imports
export { MODULE_REGISTRY } from './moduleRegistry.js';
import { MODULE_REGISTRY } from './moduleRegistry.js';
import { useSetting, shownModules } from './settings.js';

// Memoised: re-renders when the module, level or picker settings change, not with the sidebar or Settings
export const ModeRouter = React.memo(function ModeRouter({
  currentMode,
  onSelectMode,
  activeMission = null,
  activeSlotIndex = 0,
  onSelectSlot = null,
  onClearMission = null
}) {
  const [appMode, setAppMode] = useAppMode();
  const [hiddenValue] = useSetting('hiddenModules'); // Settings → modules in the picker (levels show theirs regardless)
  const activeMode = currentMode || appMode;

  const handleSelect = (id) => {
    if (onSelectMode) onSelectMode(id);
    else setAppMode(id);
  };

  // Determine which buttons to show
  // If activeMission is set, show the modules listed in that mission.
  // When a module is repeated (e.g. Piano, Piano), number them (#1, #2) so each window is distinct.
  let renderedTabs = [];

  if (activeMission && Array.isArray(activeMission.modules)) {
    const counts = {};
    activeMission.modules.forEach(m => {
      counts[m] = (counts[m] || 0) + 1;
    });
    const tracker = {};

    renderedTabs = activeMission.modules.map((modName, idx) => {
      tracker[modName] = (tracker[modName] || 0) + 1;
      const count = tracker[modName];
      const isRepeated = counts[modName] > 1;

      const known = KNOWN_MODULE_NAMES[modName];
      // repeated "same manual" modules share one grouped window → one tab, on the first copy
      if (known && known.shared && isRepeated && count > 1) return null;
      const reg = known && known.isImplemented ? MODULE_REGISTRY.find(m => m.id === known.id) : null;
      const baseLabel = reg ? reg.label : `⚠️ ${modName.toUpperCase()} (N/A)`;
      const displayLabel = !isRepeated ? baseLabel
        : known && known.shared ? `${baseLabel} ×${counts[modName]}`
        : `${baseLabel} #${count}`;

      return {
        key: `${modName}-${idx}`,
        slotIndex: idx,
        id: reg ? reg.id : `unimplemented-${modName}`,
        label: displayLabel,
        isImplemented: Boolean(reg),
        name: modName
      };
    }).filter(Boolean);
  } else {
    renderedTabs = shownModules(hiddenValue).map(m => ({
      key: m.id,
      slotIndex: null,
      id: m.id,
      label: m.label,
      isImplemented: true,
      name: m.name
    }));
  }

  return (
    <div className="mode-toggle-wrapper">
      {activeMission && (
        <div className="active-mission-banner">
          <span className="active-mission-title">
            {activeMission.custom ? activeMission.label.toUpperCase() : `MISSION ${activeMission.id}`} ({activeMission.modules.length} MODULES)
          </span>
          {onClearMission && (
            <button
              type="button"
              className="clear-mission-btn"
              onClick={onClearMission}
              title="Show all modules"
            >
              SHOW ALL (RESET) ✕
            </button>
          )}
        </div>
      )}
      {/* Phones: one dropdown instead of the wrapping row of tabs */}
      <select
        className="mode-select"
        aria-label="Module"
        value={(() => {
          const t = renderedTabs.find(tab => (activeMission
            ? tab.isImplemented && tab.slotIndex === activeSlotIndex
            : tab.isImplemented && activeMode === tab.id));
          return t ? t.key : '';
        })()}
        onChange={(e) => {
          const tab = renderedTabs.find(t => t.key === e.target.value);
          if (!tab || !tab.isImplemented) return;
          if (activeMission && onSelectSlot) onSelectSlot(tab.slotIndex, tab.id);
          else handleSelect(tab.id);
        }}
      >
        {renderedTabs.map(tab => (
          <option key={tab.key} value={tab.key} disabled={!tab.isImplemented}>{tab.label}</option>
        ))}
      </select>
      <div className="mode-toggle-main">
        {renderedTabs.map(tab => {
          const isActive = activeMission
            ? tab.isImplemented && tab.slotIndex === activeSlotIndex
            : tab.isImplemented && activeMode === tab.id;

          return (
            <button
              key={tab.key}
              className={`mode-btn-main ${isActive ? 'active' : ''} ${!tab.isImplemented ? 'unimplemented' : ''}`}
              id={tab.id.startsWith('unimplemented') ? undefined : `tab-${tab.id}-${tab.slotIndex ?? 'main'}`}
              type="button"
              disabled={!tab.isImplemented}
              onClick={() => {
                if (tab.isImplemented) {
                  if (activeMission && onSelectSlot) {
                    onSelectSlot(tab.slotIndex, tab.id);
                  } else {
                    handleSelect(tab.id);
                  }
                }
              }}
              title={!tab.isImplemented ? `${tab.name} is not implemented yet` : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
