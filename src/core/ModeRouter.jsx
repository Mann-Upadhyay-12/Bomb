import React from 'react';
import { useAppState } from './AppStateContext.jsx';
import { KNOWN_MODULE_NAMES } from './sectionsData.js';

export const MODULE_REGISTRY = [
  { id: 'mines', tabId: 'tabMines', label: '💣 MINES (8×10)', name: 'Mines' },
  { id: 'queens', tabId: 'tabQueens', label: '👑 QUEENS (8×8)', name: 'Queens' },
  { id: 'morse', tabId: 'tabMorse', label: '📡 MORSE (GIF)', name: 'Morse Code' },
  { id: 'search', tabId: 'tabSearch', label: '🔍 SEARCH (5×5)', name: 'Search' },
  { id: 'maze', tabId: 'tabMaze', label: '🧩 MAZE (8×8)', name: 'Maze' },
  { id: 'password', tabId: 'tabPassword', label: '🔑 PASSWORD', name: 'Password' },
  { id: 'switches', tabId: 'tabSwitches', label: '🎚️ SWITCHES', name: 'Switches' },
  { id: 'diagram', tabId: 'tabDiagram', label: '🔵 DIAGRAM', name: 'Diagram' },
  { id: 'piano', tabId: 'tabPiano', label: '🎹 PIANO', name: 'Piano' },
  { id: 'wof', tabId: 'tabWof', label: '🥊 WHO\'S ON FIRST', name: 'Who\'s On First' },
  { id: 'knob', tabId: 'tabKnob', label: '🎛️ KNOBS', name: 'Knobs' },
  { id: 'cube', tabId: 'tabCube', label: '🧊 RUBIK\'S CUBE', name: 'Rubik\'s Cube' },
  { id: 'logic', tabId: 'tabLogic', label: '🔣 LOGIC', name: 'Logic' },
  { id: 'chess', tabId: 'tabChess', label: '♔ CHESS (8×8)', name: 'Chess' },
  { id: 'simons', tabId: 'tabSimons', label: '🔴 SIMON SAYS', name: 'Simon Says' },
  { id: 'wireseq', tabId: 'tabWireSeq', label: '🔌 WIRE SEQ', name: 'Wire Sequences' },
  { id: 'complexwires', tabId: 'tabComplexWires', label: '⚡ COMPLEX WIRES', name: 'Complex Wires' },
  { id: 'symbols', tabId: 'tabSymbols', label: '🔣 SYMBOLS', name: 'Symbols' },
  { id: 'button', tabId: 'tabButton', label: '🔘 THE BUTTON', name: 'The Button' },
  { id: 'balance', tabId: 'tabBalance', label: '⚖️ BALANCE', name: 'Balance' }
];

export function ModeRouter({
  currentMode,
  onSelectMode,
  activeMission = null,
  activeSlotIndex = 0,
  onSelectSlot = null,
  onClearMission = null
}) {
  const { appMode, setAppMode } = useAppState();
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
      const reg = known && known.isImplemented ? MODULE_REGISTRY.find(m => m.id === known.id) : null;
      const baseLabel = reg ? reg.label : `⚠️ ${modName.toUpperCase()} (N/A)`;
      const displayLabel = isRepeated ? `${baseLabel} #${count}` : baseLabel;

      return {
        key: `${modName}-${idx}`,
        slotIndex: idx,
        id: reg ? reg.id : `unimplemented-${modName}`,
        label: displayLabel,
        isImplemented: Boolean(reg),
        name: modName
      };
    });
  } else {
    renderedTabs = MODULE_REGISTRY.map(m => ({
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
}
