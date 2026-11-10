import React, { useState } from 'react';
import { SECTIONS_DATA, KNOWN_MODULE_NAMES } from '../sectionsData.js';

export function MissionSidebar({
  isOpen,
  onClose,
  activeMission,
  onSelectMission,
  onSelectAll,
  customLevels = [],
  onGenerate = null
}) {
  // Collapsed sections state: default open or first open
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSection = (idx) => {
    setCollapsedSections(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  return (
    <>
      {/* Backdrop overlay for mobile / click-away */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`mission-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-title-area">
            <span className="sidebar-eyebrow">HEIST STAGES</span>
            <h2 className="sidebar-title">Missions</h2>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            ✕
          </button>
        </div>

        <div className="sidebar-content">
          {/* ALL Option */}
          <div className="sidebar-all-row">
            <button
              type="button"
              className={`sidebar-all-btn ${!activeMission ? 'active' : ''}`}
              onClick={() => {
                onSelectAll();
              }}
            >
              <span className="all-icon">🌐</span>
              <div className="all-info">
                <span className="all-label">ALL MODULES</span>
                <span className="all-desc">Show all available solvers</span>
              </div>
            </button>
          </div>

          {onGenerate && (
            <div className="sidebar-all-row">
              <button type="button" className="sidebar-all-btn" onClick={onGenerate}>
                <span className="all-icon">🧨</span>
                <div className="all-info">
                  <span className="all-label">GENERATE LEVEL</span>
                  <span className="all-desc">Paste a bomb board screenshot</span>
                </div>
              </button>
            </div>
          )}

          {customLevels.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section-header" style={{ cursor: 'default' }}>
                <span className="sidebar-section-title">My Levels</span>
              </div>
              <div className="sidebar-missions-group">
                {customLevels.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className={`sidebar-mission-card ${activeMission && activeMission.id === m.id ? 'active' : ''}`}
                    onClick={() => onSelectMission(m)}
                  >
                    <div className="mission-card-top">
                      <span className="mission-id-badge">{m.label}</span>
                      <span className="mission-mod-count">{m.modules.length} {m.modules.length === 1 ? 'mod' : 'mods'}</span>
                    </div>
                    <div className="mission-modules-list">
                      {m.modules.map((name, i) => <span key={i} className="mission-mod-pill">{name}</span>)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="sidebar-divider" />

          {/* Sections List */}
          <div className="sidebar-sections-list">
            {SECTIONS_DATA.map((sec, secIdx) => {
              const isCollapsed = Boolean(collapsedSections[secIdx]);

              return (
                <div key={sec.title} className="sidebar-section">
                  <button
                    type="button"
                    className="sidebar-section-header"
                    onClick={() => toggleSection(secIdx)}
                  >
                    <span className="sidebar-section-title">{sec.title}</span>
                    <span className="sidebar-section-caret">
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="sidebar-missions-group">
                      {sec.missions.map(m => {
                        const isSelected = activeMission && activeMission.id === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={`sidebar-mission-card ${isSelected ? 'active' : ''}`}
                            disabled={m.modules.length === 0}
                            title={m.modules.length === 0 ? 'No solvable modules in this level yet' : undefined}
                            style={m.modules.length === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                            onClick={() => m.modules.length && onSelectMission(m)}
                          >
                            <div className="mission-card-top">
                              <span className="mission-id-badge">{m.label}</span>
                              <span className="mission-mod-count">
                                {m.modules.length} {m.modules.length === 1 ? 'mod' : 'mods'}
                              </span>
                            </div>
                            <div className="mission-modules-list">
                              {m.modules.length === 0 && (
                                <span className="mission-mod-pill unimplemented">no solvers yet</span>
                              )}
                              {m.modules.map((name, i) => {
                                const info = KNOWN_MODULE_NAMES[name];
                                const isImp = info && info.isImplemented;
                                return (
                                  <span
                                    key={i}
                                    className={`mission-mod-pill ${!isImp ? 'unimplemented' : ''}`}
                                    title={!isImp ? `${name} (Not implemented)` : name}
                                  >
                                    {name}
                                  </span>
                                );
                              })}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
