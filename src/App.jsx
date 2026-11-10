import React, { useState } from 'react';
import { useAppState } from './core/AppStateContext.jsx';
import { useTheme } from './core/ThemeContext.jsx';
import { useToast } from './core/ToastContext.jsx';
import { ModeRouter } from './core/ModeRouter.jsx';
import { MissionSidebar } from './core/components/MissionSidebar.jsx';
import { KNOWN_MODULE_NAMES } from './core/sectionsData.js';
import { LevelGenerator } from './core/level/LevelGenerator.jsx';

const CUSTOM_LEVELS_KEY = 'bomb_custom_levels';

// Import all 18 migrated React modules
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

export function App() {
  const { appMode, setAppMode, prefixHash, setPrefixHash } = useAppState();
  const { isDark, bgColor, setBgColor, bgImage, setBgImage } = useTheme();
  const { toastMsg, show: showToast } = useToast();
  const [view, setView] = useState('main'); // 'main' | 'about' | 'generate'
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
  React.useEffect(() => {
    setVisitedModes(prev => (prev.includes(appMode) ? prev : [...prev, appMode]));
  }, [appMode]);

  const handleSelectMission = (mission) => {
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
  };

  const handleSelectSlot = (slotIdx, modId) => {
    setActiveSlotIndex(slotIdx);
    setAppMode(modId);
  };

  const handleSelectAll = () => {
    setActiveMission(null);
    setActiveSlotIndex(0);
    setIsSidebarOpen(false);
  };

  // Map of module metadata
  const moduleMeta = {
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
    symbols: symbolsModule
  };

  const currentMeta = moduleMeta[appMode] || minesModule;

  // Render module component by ID
  const renderModuleById = (id, isActive = true, instance = 0, instanceCount = 1) => {
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
      default:
        return <MinesModule isActive={isActive} />;
    }
  };

  return (
    <div className="page">
      {/* Toast Notification */}
      <span className={`copied-toast ${showToast ? 'show' : ''}`} id="copiedToast">
        {toastMsg}
      </span>

      {/* Closable Mission Sidebar */}
      <MissionSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeMission={activeMission}
        onSelectMission={handleSelectMission}
        onSelectAll={handleSelectAll}
        customLevels={customLevels}
        onGenerate={() => { setView('generate'); setIsSidebarOpen(false); }}
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
            <button
              type="button"
              className={`sidebar-toggle-btn ${activeMission ? 'has-mission' : ''}`}
              onClick={() => setIsSidebarOpen(true)}
              title="Open missions sidebar"
            >
              <span className="toggle-icon">☰</span>
              <span>{activeMission ? (activeMission.custom ? `LEVEL: ${activeMission.label}` : `MISSION: ${activeMission.id}`) : 'MISSIONS / SECTIONS'}</span>
            </button>
          </div>

          {/* Top navigation router */}
          <ModeRouter
            currentMode={appMode}
            onSelectMode={(id) => setAppMode(id)}
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
            <div className="mission-modules-container">
              {activeMission.modules.map((modName, slotIdx) => {
                const known = KNOWN_MODULE_NAMES[modName];
                if (!known || !known.isImplemented) return null;
                const isSlotActive = activeSlotIndex === slotIdx;
                // Which copy of this module this slot is (Symbols #1, #2 …) and how many copies the level has
                const instance = activeMission.modules.slice(0, slotIdx).filter(n => n === modName).length;
                const instanceCount = activeMission.modules.filter(n => n === modName).length;
                return (
                  <div
                    key={`mission-${activeMission.id}-slot-${slotIdx}-${known.id}`}
                    className="mission-module-window"
                    style={{ display: isSlotActive ? 'block' : 'none' }}
                  >
                    {renderModuleById(known.id, isSlotActive, instance, instanceCount)}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mission-modules-container">
              {visitedModes.map(id => (
                <div
                  key={`all-${id}`}
                  className="mission-module-window"
                  style={{ display: id === appMode ? 'block' : 'none' }}
                >
                  {renderModuleById(id, id === appMode)}
                </div>
              ))}
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
              <b>Bomb &amp; Queens &amp; Morse &amp; Logic Vision</b> is an automated computer vision &amp; constraint solver for GTA Heist puzzles. Includes automated modules for Minesweeper, Queens, Morse Code, Word Search, Mazes, Passwords, Switches, Venn Diagrams, Piano Intervals, Who's on First, Knobs, Rubik's Cube, Logic (¬ &gt; ^ &gt; V &gt; →), and <b>Chess</b> (Stockfish).
            </p>
          </div>
          <div className="about-panel bg-panel">
            <div className="bg-panel-title">MESSAGE &amp; CLIPBOARD SETTINGS</div>
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
                </span>
              </label>
            </div>
          </div>
          <div className="about-panel bg-panel">
            <div className="bg-panel-title">CUSTOMIZE BACKGROUND</div>
            <div className="bg-row">
              <label className="bg-label" htmlFor="bgColorPicker">Color</label>
              <input
                type="color"
                id="bgColorPicker"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
              />
              <input
                type="text"
                id="bgColorHex"
                className="bg-hex"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                maxLength={7}
                spellCheck="false"
              />
              <button
                type="button"
                className="bg-btn"
                onClick={() => setBgColor('#13151A')}
              >
                Reset
              </button>
            </div>
            <div className="bg-row">
              <label className="bg-label" htmlFor="bgImageUrl">Image URL</label>
              <input
                type="text"
                id="bgImageUrl"
                className="bg-url"
                value={bgImage}
                onChange={(e) => setBgImage(e.target.value)}
                placeholder="https://i.imgur.com/example.jpeg"
                spellCheck="false"
              />
              <button
                type="button"
                className="bg-btn"
                onClick={() => setBgImage('')}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
