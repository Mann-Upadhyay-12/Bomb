import React, { useState, useCallback, useMemo } from 'react';
import { useAppState, useAppMode } from './core/AppStateContext.jsx';
import { useToastState } from './core/ToastContext.jsx';
import { ModeRouter } from './core/ModeRouter.jsx';
import { MissionSidebar } from './core/components/MissionSidebar.jsx';
import { NeedyTimer, playBeep } from './core/components/NeedyTimer.jsx';
import { BombTimer } from './core/components/BombTimer.jsx';
import { SerialBar } from './core/components/SerialBar.jsx';
import { NewGameButton } from './core/components/NewGameButton.jsx';
import { RoomBar } from './core/room/RoomBar.jsx';
import { RoomCard } from './core/room/RoomCard.jsx';
import { useRoomCounts } from './core/room/roomCards.js';
import { setOpenModule } from './core/room/roomClient.js';
import { useRoomLevel } from './core/room/roomLevel.js';
import { ThemeSettings } from './core/components/ThemeSettings.jsx';
import { useGameEpoch, GAME_ITEMS } from './core/newGame.js';
import { useSetting, hiddenSet, shownModules, NEEDY_LEADS, needyLeadSeconds } from './core/settings.js';
import { BOMB_CHANGELOG } from './core/bombChangelog.js';
import { KNOWN_MODULE_NAMES } from './core/sectionsData.js';
import { LevelGenerator } from './core/level/LevelGenerator.jsx';
import { ModuleGroup } from './core/components/ModuleGroup.jsx';
import { ReportButton } from './core/components/ReportButton.jsx';
import { account } from './core/report.js';
import { Chess63Module } from './modules/chess63/index.jsx';
import { MODULE_REGISTRY } from './core/ModeRouter.jsx';

const CUSTOM_LEVELS_KEY = 'bomb_custom_levels';
// module ids whose copies all use the same manual (see sectionsData `shared`)
// Levels whose 5 Chess modules use the batch solver (public/chess63.html, ported)
const BATCH_CHESS_LEVELS = new Set(['6.4']);
const SHARED_IDS = new Set(Object.values(KNOWN_MODULE_NAMES).filter(k => k.shared && k.isImplemented).map(k => k.id));

// Import all puzzle modules
import { MinesModule, minesModule } from './modules/mines/index.jsx';
import { QueensModule, queensModule } from './modules/queens/index.jsx';
import { MorseModule, morseModule } from './modules/morse/index.jsx';
import { SearchModule, searchModule } from './modules/search/index.jsx';
import { MazeModule, mazeModule } from './modules/maze/index.jsx';
import { PasswordModule, passwordModule } from './modules/password/index.jsx';
import { SwitchesModule, switchesModule } from './modules/switches/index.jsx';
import { DiagramModule, diagramModule } from './modules/diagram/index.jsx';
import { PianoModule, pianoModule } from './modules/piano/index.jsx';
import { WofModule, wofModule } from './modules/wof/index.jsx';
import { KnobModule, knobModule } from './modules/knob/index.jsx';
import { CubeModule, cubeModule } from './modules/cube/index.jsx';
import { LogicModule, logicModule } from './modules/logic/index.jsx';
import { ChessModule, chessModule } from './modules/chess/index.jsx';
import { SimonsModule, simonsModule } from './modules/simons/index.jsx';
import { WireseqModule, wireseqModule } from './modules/wireseq/index.jsx';
import { ComplexWiresModule, complexwiresModule } from './modules/complexwires/index.jsx';
import { SymbolsModule, symbolsModule } from './modules/symbols/index.jsx';
import { ButtonModule, buttonModule } from './modules/button/index.jsx';
import { BalanceModule, balanceModule } from './modules/balance/index.jsx';
import { CircuitModule, circuitModule } from './modules/circuit/index.jsx';
import { LimboModule, limboModule } from './modules/limbo/index.jsx';
import { AstrologyModule, astrologyModule } from './modules/astrology/index.jsx';
import { PipesModule, pipesModule } from './modules/pipes/index.jsx';
import { HangmanModule, hangmanModule } from './modules/hangman/index.jsx';
import { BlackjackModule, blackjackModule } from './modules/blackjack/index.jsx';
import { BatteriesModule, batteriesModule } from './modules/batteries/index.jsx';
import { WirePlacementModule, wirePlacementModule } from './modules/wireplace/index.jsx';
import { LaundryModule, laundryModule } from './modules/laundry/index.jsx';
import { BattleshipModule, battleshipModule } from './modules/battleship/index.jsx';
import { BluescreenModule, bluescreenModule } from './modules/bluescreen/index.jsx';
import { WiresModule, wiresModule } from './modules/wires/index.jsx';
import { MemoryModule, memoryModule } from './modules/memory/index.jsx';
import { EchoModule, echoModule } from './modules/echo/index.jsx';
import { LevelContext } from './core/LevelContext.js';

// Each module's title, eyebrow and subtitle
const MODULE_META = {
  mines: minesModule,
  queens: queensModule,
  morse: morseModule,
  search: searchModule,
  maze: mazeModule,
  password: passwordModule,
  switches: switchesModule,
  diagram: diagramModule,
  piano: pianoModule,
  wof: wofModule,
  knob: knobModule,
  cube: cubeModule,
  logic: logicModule,
  chess: chessModule,
  simons: simonsModule,
  wireseq: wireseqModule,
  complexwires: complexwiresModule,
  symbols: symbolsModule,
  button: buttonModule,
  balance: balanceModule,
  circuit: circuitModule,
  limbo: limboModule,
  astrology: astrologyModule,
  pipes: pipesModule,
  hangman: hangmanModule,
  blackjack: blackjackModule,
  batteries: batteriesModule,
  wireplace: wirePlacementModule,
  laundry: laundryModule,
  battleship: battleshipModule,
  bluescreen: bluescreenModule,
  wires: wiresModule,
  memory: memoryModule,
  echo: echoModule
};


// One module's component by id (depends on its arguments only)
function renderModule(id, isActive = true, instance = 0, instanceCount = 1) {
  switch (id) {
    case 'mines':
      return <MinesModule isActive={isActive} />;
    case 'queens':
      return <QueensModule isActive={isActive} />;
    case 'morse':
      return <MorseModule isActive={isActive} />;
    case 'search':
      return <SearchModule isActive={isActive} />;
    case 'maze':
      return <MazeModule isActive={isActive} />;
    case 'password':
      return <PasswordModule isActive={isActive} />;
    case 'switches':
      return <SwitchesModule isActive={isActive} />;
    case 'diagram':
      return <DiagramModule isActive={isActive} />;
    case 'piano':
      return <PianoModule isActive={isActive} />;
    case 'wof':
      return <WofModule isActive={isActive} />;
    case 'knob':
      return <KnobModule isActive={isActive} />;
    case 'cube':
      return <CubeModule isActive={isActive} />;
    case 'logic':
      return <LogicModule isActive={isActive} />;
    case 'chess':
      return <ChessModule isActive={isActive} />;
    case 'simons':
      return <SimonsModule isActive={isActive} />;
    case 'wireseq':
      return <WireseqModule isActive={isActive} />;
    case 'complexwires':
      return <ComplexWiresModule isActive={isActive} />;
    case 'symbols':
      return <SymbolsModule isActive={isActive} instance={instance} instanceCount={instanceCount} />;
    case 'button':
      return <ButtonModule isActive={isActive} />;
    case 'balance':
      return <BalanceModule isActive={isActive} />;
    case 'circuit':
      return <CircuitModule isActive={isActive} />;
    case 'limbo':
      return <LimboModule isActive={isActive} />;
    case 'astrology':
      return <AstrologyModule isActive={isActive} />;
    case 'pipes':
      return <PipesModule isActive={isActive} />;
    case 'hangman':
      return <HangmanModule isActive={isActive} />;
    case 'blackjack':
      return <BlackjackModule isActive={isActive} />;
    case 'batteries':
      return <BatteriesModule isActive={isActive} />;
    case 'wireplace':
      return <WirePlacementModule isActive={isActive} />;
    case 'laundry':
      return <LaundryModule isActive={isActive} />;
    case 'battleship':
      return <BattleshipModule isActive={isActive} />;
    case 'bluescreen':
      return <BluescreenModule isActive={isActive} />;
    case 'wires':
      return <WiresModule isActive={isActive} />;
    case 'memory':
      return <MemoryModule isActive={isActive} />;
    case 'echo':
      return <EchoModule isActive={isActive} />;
    default:
      return <MinesModule isActive={isActive} />;
  }
}

// Every module window stays mounted (hidden) so its screenshots and answers survive. The windows
// are memoised: opening the sidebar or Settings re-renders none of them, and switching tabs only
// the one being left and the one being opened.
// data-module(-name): which module a ⚑ wrong-answer report is about (core/report.js)
const moduleName = (id) => (MODULE_META[id] && MODULE_META[id].tabLabel) || id;

// data-card: which copy this window is (a level with two of a module that isn't grouped); a room's
// pictures and CLEAR go by module + card (core/room/roomCards.js)
const ModuleWindow = React.memo(function ModuleWindow({ id, active, instance = 0, instanceCount = 1 }) {
  return (
    <div className="mission-module-window" data-module={id} data-card={instance} data-module-name={moduleName(id)} style={{ display: active ? 'block' : 'none' }}>
      <RoomCard module={id} card={instance}>{renderModule(id, active, instance, instanceCount)}</RoomCard>
    </div>
  );
});

// "Same manual" modules: every copy in one grouped window. With `setCounts` (all-modules mode) it
// shows the "modules to solve" bar; in a level the count is the level's.
const GroupWindow = React.memo(function GroupWindow({ id, label, count, active, setCounts = null }) {
  const onCountChange = useMemo(
    () => (setCounts ? (n) => setCounts(prev => ({ ...prev, [id]: n })) : null),
    [id, setCounts]
  );
  const renderInstance = useCallback((i, a) => <RoomCard module={id} card={i}>{renderModule(id, a, i, count)}</RoomCard>, [id, count]);
  return (
    <div className="mission-module-window" data-module={id} data-module-name={moduleName(id)} style={{ display: active ? 'block' : 'none' }}>
      <ModuleGroup
        id={id}
        label={label}
        count={count}
        onCountChange={onCountChange}
        isActive={active}
        renderInstance={renderInstance}
      />
    </div>
  );
});

// Level 6.4's five Chess modules: the batch solver from chess63.html in one window
const Chess63Window = React.memo(function Chess63Window({ active }) {
  return (
    <div className="mission-module-window" data-module="chess63" data-module-name="5-Chess (level 6.4)" style={{ display: active ? 'block' : 'none' }}>
      <Chess63Module />
      <ReportButton />
    </div>
  );
});

// The needy reminder's pop-up: its own component, so a toast doesn't re-render the whole app
function ToastBanner() {
  const { toastMsg, show } = useToastState();
  return (
    <div
      className={`copied-toast ${show ? 'show' : ''}`}
      id="copiedToast"
      role="status"
      aria-live="polite"
    >
      {toastMsg}
    </div>
  );
}

export function App() {
  const [appMode, setAppMode] = useAppMode();
  const { prefixHash, setPrefixHash, copyOnDecode, setCopyOnDecode } = useAppState();
  const [view, setView] = useState('main'); // 'main' | 'about' | 'generate'
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [customLevels, setCustomLevels] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_LEVELS_KEY) || '[]'); } catch (e) { return []; }
  });
  const saveCustomLevels = (next) => {
    setCustomLevels(next);
    try { localStorage.setItem(CUSTOM_LEVELS_KEY, JSON.stringify(next)); } catch (e) {}
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeMission, setActiveMission] = useState(null);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  // Modules opened in "all modules" mode stay mounted (hidden) so switching tabs keeps their data
  const [visitedModes, setVisitedModes] = useState(() => [appMode]);
  // "Same manual" modules (Password, Simon …) in all-modules mode: how many copies to solve at once
  const [groupCounts, setGroupCounts] = useState({});
  // in a room, the counts are the room's (core/room/roomCards.js)
  useRoomCounts(groupCounts, setGroupCounts);
  React.useEffect(() => {
    setVisitedModes(prev => (prev.includes(appMode) ? prev : [...prev, appMode]));
  }, [appMode]);

  // New game: every module window is remounted (its key holds the epoch), which drops each one's
  // screenshots and answers; the modules opened so far and the "modules to solve" counts start over.
  const gameEpoch = useGameEpoch();
  const firstEpoch = React.useRef(gameEpoch);
  React.useEffect(() => {
    if (gameEpoch === firstEpoch.current) return;
    setVisitedModes([appMode]);
    setGroupCounts({});
  }, [gameEpoch]);

  // Settings: remember the module in use (the app opens on it next time) …
  const [, setLastModule] = useSetting('lastModule');
  const [openLast, setOpenLast] = useSetting('openLast');
  React.useEffect(() => { setLastModule(appMode); setOpenModule(appMode); }, [appMode]);
  // … and the modules the picker shows: hiding the one on screen moves to the first one shown
  const [hiddenValue, setHiddenValue] = useSetting('hiddenModules');
  const hidden = hiddenSet(hiddenValue);
  React.useEffect(() => {
    if (!activeMission && hidden.has(appMode)) setAppMode(shownModules(hiddenValue)[0].id);
  }, [hiddenValue, activeMission]);
  const toggleShown = (id) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (next.size >= MODULE_REGISTRY.length) return; // at least one stays
    setHiddenValue([...next].join(','));
  };
  const [panels, setPanels] = useSetting('workingPanels');
  const [needyLead, setNeedyLead] = useSetting('needyLead');
  const [needyBeep, setNeedyBeep] = useSetting('needyBeep');

  // Stable handlers, so the memoised sidebar and module picker skip re-rendering when nothing they show changed
  const handleSelectMission = useCallback((mission) => {
    setView('main');
    setActiveMission(mission);
    setActiveSlotIndex(0);
    // Find first implemented module in this mission
    if (mission && Array.isArray(mission.modules)) {
      const firstImplIdx = mission.modules.findIndex(name => {
        const info = KNOWN_MODULE_NAMES[name];
        return info && info.isImplemented;
      });
      if (firstImplIdx >= 0) {
        setActiveSlotIndex(firstImplIdx);
        setAppMode(KNOWN_MODULE_NAMES[mission.modules[firstImplIdx]].id);
      }
    }
    setIsSidebarOpen(false);
  }, [setAppMode]);

  const handleSelectSlot = useCallback((slotIdx, modId) => {
    setActiveSlotIndex(slotIdx);
    setAppMode(modId);
  }, [setAppMode]);

  const handleSelectAll = useCallback(() => {
    setActiveMission(null);
    setActiveSlotIndex(0);
    setIsSidebarOpen(false);
  }, []);

  // In a room the host's level is the room's: everyone who joins opens it, and follows the host's next
  // pick (core/room/roomLevel.js). A room made in ALL MODULES opens all modules.
  useRoomLevel(activeMission, handleSelectMission, handleSelectAll);

  // The room's answers board opens a module card (core/room/roomBoard.js openCard): switch to the
  // module (its slot on a level), then bring the card into view with a short outline
  React.useEffect(() => {
    const open = (e) => {
      const { module, card = 0 } = (e && e.detail) || {};
      if (!module) return;
      setView('main');
      if (activeMission && Array.isArray(activeMission.modules)) {
        const slots = activeMission.modules
          .map((name, i) => ({ i, id: KNOWN_MODULE_NAMES[name] && KNOWN_MODULE_NAMES[name].id }))
          .filter((x) => x.id === module);
        if (slots.length) handleSelectSlot((slots[card] || slots[0]).i, module);
      } else setAppMode(module);
      setTimeout(() => {
        const wins = [...document.querySelectorAll(`[data-module="${module}"]`)].filter((w) => w.getClientRects().length);
        const target = wins.map((w) => (w.dataset.card === String(card) ? w : w.querySelector(`[data-card="${card}"]`))).find(Boolean) || wins[0];
        if (!target) return;
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.classList.add('card-flash');
        setTimeout(() => target.classList.remove('card-flash'), 1400);
      }, 80);
    };
    window.addEventListener('bb:open-card', open);
    return () => window.removeEventListener('bb:open-card', open);
  }, [activeMission, handleSelectSlot, setAppMode]);

  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const openGenerator = useCallback(() => { setView('generate'); setIsSidebarOpen(false); }, []);

  const currentMeta = MODULE_META[appMode] || minesModule;

  return (
    <div className="page">
      {/* Toast Notification */}
      <ToastBanner />

      {/* Closable Mission Sidebar */}
      <MissionSidebar
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        activeMission={activeMission}
        onSelectMission={handleSelectMission}
        onSelectAll={handleSelectAll}
        customLevels={customLevels}
        onGenerate={openGenerator}
      />

      {view === 'generate' && (
        <div className="view" id="generateView">
          <LevelGenerator
            isVisible={view === 'generate'}
            savedLevels={customLevels}
            onBack={() => setView('main')}
            onSave={(lvl) => saveCustomLevels([...customLevels, lvl])}
            onDelete={(id) => saveCustomLevels(customLevels.filter(l => l.id !== id))}
            onStart={(lvl) => handleSelectMission(lvl)}
          />
        </div>
      )}

      {/* Main view stays mounted (hidden) on other screens so module data survives */}
      <div className="view" id="mainView" style={{ display: view === 'main' ? undefined : 'none' }}>
          {/* Top Controls Bar */}
          <div className="top-bar-controls">
            <div className="top-bar-left">
            <button
              type="button"
              className={`sidebar-toggle-btn ${activeMission ? 'has-mission' : ''}`}
              onClick={() => setIsSidebarOpen(true)}
              title="Open missions sidebar"
            >
              <span className="toggle-icon">☰</span>
              <span>{activeMission ? (activeMission.custom ? `LEVEL: ${activeMission.label}` : `MISSION: ${activeMission.id}`) : 'MISSION'}</span>
            </button>
            {/* The bomb's timer and the needy reminder run on one clock (core/bombClock.js): starting or
                stopping either does both. It keeps running across levels; New game stops it. */}
            <BombTimer />
            <NeedyTimer />
            {/* Serial: same on every bomb in a game, so it lives here, not per module */}
            <SerialBar />
            {/* New game: forgets the serial, this game's manuals and every screenshot at once */}
            <NewGameButton />
            {/* Rooms: play one bomb together (needs a Discord login; not in bomb.html) */}
            <RoomBar />
            </div>
          </div>

          {/* Top navigation router */}
          <ModeRouter
            currentMode={appMode}
            onSelectMode={setAppMode}
            activeMission={activeMission}
            activeSlotIndex={activeSlotIndex}
            onSelectSlot={handleSelectSlot}
            onClearMission={handleSelectAll}
          />

          {/* Module Header */}
          <div className="eyebrow" id="appEyebrow">{currentMeta.eyebrow}</div>
          <h1 id="appTitle">{currentMeta.title}</h1>
          <div
            className="sub"
            id="appSub"
            dangerouslySetInnerHTML={{ __html: currentMeta.sub }}
          />

          {/* Active Module UI: In mission mode, render each slot independently so repeated modules are separate windows */}
          {activeMission && Array.isArray(activeMission.modules) ? (
            <LevelContext.Provider value={activeMission}>
            <div className="mission-modules-container">
              {activeMission.modules.map((modName, slotIdx) => {
                const known = KNOWN_MODULE_NAMES[modName];
                if (!known || !known.isImplemented) return null;
                const isSlotActive = activeSlotIndex === slotIdx;
                // Which copy of this module this slot is (Symbols #1, #2 …) and how many copies the level has
                const instance = activeMission.modules.slice(0, slotIdx).filter(n => n === modName).length;
                const instanceCount = activeMission.modules.filter(n => n === modName).length;
                // Level 6.4 from the sidebar (5 Chess): the batch solver from chess63.html in one window —
                // one White 2×3 photo + one Black 1×5 strip solve all 5. Picking 5 Chess by hand
                // (a custom level) keeps the normal Chess cards.
                if (known.id === 'chess' && !activeMission.custom && BATCH_CHESS_LEVELS.has(activeMission.id)) {
                  if (instance > 0) return null;
                  return <Chess63Window key={`mission-${activeMission.id}-chess63-${gameEpoch}`} active={isSlotActive} />;
                }
                // "Same manual" modules: all copies live in one grouped window on the first copy's slot
                // (also a single copy, so the manual is always the hidden one-line bar)
                if (known.shared) {
                  if (instance > 0) return null;
                  const reg = MODULE_REGISTRY.find(m => m.id === known.id);
                  return (
                    <GroupWindow
                      key={`mission-${activeMission.id}-group-${known.id}-${gameEpoch}`}
                      id={known.id}
                      label={(reg ? reg.label : modName).toUpperCase()}
                      count={instanceCount}
                      active={isSlotActive}
                    />
                  );
                }
                return (
                  <ModuleWindow
                    key={`mission-${activeMission.id}-slot-${slotIdx}-${known.id}-${gameEpoch}`}
                    id={known.id}
                    active={isSlotActive}
                    instance={instance}
                    instanceCount={instanceCount}
                  />
                );
              })}
            </div>
            </LevelContext.Provider>
          ) : (
            <div className="mission-modules-container">
              {visitedModes.map(id => (SHARED_IDS.has(id) ? (
                <GroupWindow
                  key={`all-${id}-${gameEpoch}`}
                  id={id}
                  label={((MODULE_REGISTRY.find(m => m.id === id) || {}).label || id).toUpperCase()}
                  count={groupCounts[id] || 1}
                  active={id === appMode}
                  setCounts={setGroupCounts}
                />
              ) : (
                <ModuleWindow key={`all-${id}-${gameEpoch}`} id={id} active={id === appMode} />
              )))}
            </div>
          )}

          {/* About / Settings Footer */}
          <div className="about-row" style={{ marginTop: '24px' }}>
            <button
              className="about-btn"
              type="button"
              onClick={() => setView('about')}
            >
              ABOUT &amp; SETTINGS →
            </button>
          </div>
        </div>

      {view === 'about' && (
        <div className="view about-view" id="aboutView">
          <button
            className="back-btn"
            type="button"
            onClick={() => setView('main')}
          >
            ← BACK
          </button>
          <div className="eyebrow">ABOUT</div>
          <h1>Bomb &amp; Queens &amp; Morse &amp; Logic Vision</h1>
          <div className="about-panel">
            <p className="about-text">
              <b>Bomb &amp; Queens &amp; Morse &amp; Logic Vision</b> is an automated computer vision &amp; constraint solver for GTA Heist puzzles. Includes automated modules for Minesweeper, Queens, Morse Code, Word Search, Mazes, Passwords, Switches, Venn Diagrams, Piano Intervals, Who's on First, Knobs, Rubik's Cube, Logic (¬ &gt; ^ &gt; V &gt; →), <b>Chess</b> (Stockfish), The Button and Balance.
            </p>
            <p className="about-credits">
              <b>Credits:</b> <span className="credit-yuza">Yuza</span> and <span className="credit-dixie">Dixie</span>, the
              first two players. <code>yuza.html</code> and <code>dixie.html</code> are named after them, and so are the Yuza and
              Dixie themes in THEME &amp; COLORS below.
              {account()?.og && <span className="about-credits-you"><span className="og-chip">OG</span> That's you. Thank you!</span>}
            </p>
            <button
              className="changelog-btn"
              type="button"
              aria-expanded={changelogOpen}
              onClick={() => setChangelogOpen(o => !o)}
            >
              {changelogOpen ? 'CHANGELOG ▴' : 'CHANGELOG ▾'}
            </button>
            {changelogOpen && (
              <ul className="changelog-list">
                {BOMB_CHANGELOG.map(entry => (
                  <li key={entry.date}>
                    <span className="changelog-version">{entry.date.toUpperCase()}</span>
                    <span className="changelog-text">
                      {entry.items.map(([lead, text]) => (
                        <span className="changelog-item" key={lead}><strong>{lead}:</strong> {text}</span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="about-panel bg-panel">
            <div className="bg-panel-title">MESSAGE &amp; CLIPBOARD SETTINGS</div>
            <div className="bg-row">
              <label className="setting-check-label" htmlFor="autocopyToggle">
                <input
                  type="checkbox"
                  id="autocopyToggle"
                  className="setting-checkbox"
                  checked={copyOnDecode}
                  onChange={(e) => setCopyOnDecode(e.target.checked)}
                />
                <span className="setting-check-text">
                  Auto-copy answers (<code>COPY ON DECODE</code>) in every module
                  <span className="setting-note">Untick to have it off for everything. Remembered on this device, and Heist uses the same switch. A module's COPY ON DECODE button changes it too.</span>
                </span>
              </label>
            </div>
            <div className="bg-row">
              <label className="setting-check-label" htmlFor="prefixHashToggle">
                <input
                  type="checkbox"
                  id="prefixHashToggle"
                  className="setting-checkbox"
                  checked={prefixHash}
                  onChange={(e) => setPrefixHash(e.target.checked)}
                />
                <span className="setting-check-text">
                  Prefix copied message with <code># </code> (e.g. <code># A5 C4</code>)
                  <span className="setting-note">Off unless you tick it. Remembered on this device until you change it.</span>
                </span>
              </label>
            </div>
          </div>
          <div className="about-panel bg-panel">
            <div className="bg-panel-title">NEW GAME</div>
            <div className="bg-row setting-col">
              <NewGameButton />
              <span className="setting-note">
                Also in the top bar. Press it twice to forget everything that changes from one game to the next: {GAME_ITEMS.join(', ')}.
                Settings, the Password / Who's on First / Word Search lists and the letter shapes the app has learned are kept.
              </span>
            </div>
          </div>
          <div className="about-panel bg-panel">
            <div className="bg-panel-title">NEEDY REMINDER</div>
            <div className="bg-row">
              <label className="bg-label setting-label-auto" htmlFor="needyLead">Remind me</label>
              <select id="needyLead" className="bg-hex setting-select" value={needyLeadSeconds(needyLead)} onChange={(e) => setNeedyLead(e.target.value)}>
                {NEEDY_LEADS.map((n) => <option key={n} value={n}>{n} seconds</option>)}
              </select>
              <span className="setting-inline">before each 30-second mark</span>
            </div>
            <div className="bg-row">
              <label className="setting-check-label" htmlFor="needyBeep">
                <input type="checkbox" id="needyBeep" className="setting-checkbox" checked={needyBeep === 'on'}
                  onChange={(e) => setNeedyBeep(e.target.checked ? 'on' : 'off')} />
                <span className="setting-check-text">
                  Beep with the reminder
                  <span className="setting-note">Two short beeps from this page as well as the notification, for when notifications are silent or blocked.</span>
                </span>
              </label>
              <button type="button" className="bg-btn" onClick={playBeep}>▶ Test beep</button>
            </div>
          </div>
          <div className="about-panel bg-panel">
            <div className="bg-panel-title">MODULES</div>
            <div className="bg-row">
              <label className="setting-check-label" htmlFor="openLast">
                <input type="checkbox" id="openLast" className="setting-checkbox" checked={openLast === 'on'}
                  onChange={(e) => setOpenLast(e.target.checked ? 'on' : 'off')} />
                <span className="setting-check-text">
                  Open on the module I used last
                  <span className="setting-note">Off: the page opens on the first module in the list.</span>
                </span>
              </label>
            </div>
            <div className="bg-row">
              <label className="bg-label setting-label-auto" htmlFor="workingPanels">Working panels</label>
              <select id="workingPanels" className="bg-hex setting-select" value={panels} onChange={(e) => setPanels(e.target.value)}>
                <option value="module">as each module sets them</option>
                <option value="open">always open</option>
                <option value="closed">always closed</option>
              </select>
            </div>
            <div className="setting-sub">
              Modules in the picker <span className="setting-note-inline">({MODULE_REGISTRY.length - hidden.size} of {MODULE_REGISTRY.length} shown · tap one to show or hide it · levels still show all of theirs)</span>
            </div>
            <div className="setting-modules">
              {MODULE_REGISTRY.map((m) => (
                <button key={m.id} type="button" className={`setting-module ${hidden.has(m.id) ? 'off' : 'on'}`}
                  aria-pressed={!hidden.has(m.id)} onClick={() => toggleShown(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="bg-row">
              <button type="button" className="bg-btn" onClick={() => setHiddenValue('')} disabled={!hidden.size}>Show all</button>
            </div>
          </div>
          <ThemeSettings />
        </div>
      )}
    </div>
  );
}
