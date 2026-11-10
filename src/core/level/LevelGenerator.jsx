import React, { useState } from 'react';
import { Dropzone } from '../Dropzone.jsx';
import { useToast } from '../ToastContext.jsx';
import { KNOWN_MODULE_NAMES } from '../sectionsData.js';
import { readBoard, imageToData } from './levelVision.js';

const ALL_NAMES = Object.keys(KNOWN_MODULE_NAMES);
const isSolvable = n => Boolean(KNOWN_MODULE_NAMES[n] && KNOWN_MODULE_NAMES[n].isImplemented);

/**
 * Paste a screenshot of the bomb board → list of modules in board order → start it as a level.
 * Modules without a solver in this app are shown as skipped and left out of the level.
 */
export function LevelGenerator({ isVisible, savedLevels = [], onStart, onSave, onDelete, onBack }) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState([]); // [{ name, unsure }]
  const [appendNext, setAppendNext] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const [levelName, setLevelName] = useState('');

  const handleImage = (img, dataUri) => {
    setPreviewUri(dataUri);
    let res;
    try { res = readBoard(imageToData(img)); } catch (e) { showToast('COULD NOT READ THAT IMAGE'); return; }
    const found = res.titles.map(t => ({ name: t.name, unsure: t.unsure }));
    if (!found.length) { showToast('NO MODULE TITLES FOUND'); return; }
    setDraft(prev => (appendNext ? [...prev, ...found] : found));
    const kept = found.filter(m => isSolvable(m.name)).length;
    showToast(`FOUND ${found.length} MODULES · ${kept} SOLVABLE ✓`);
  };

  const kept = draft.filter(m => isSolvable(m.name));
  const skipped = draft.filter(m => !isSolvable(m.name));

  const buildLevel = () => {
    const n = savedLevels.length + 1;
    const label = levelName.trim() || `Custom ${n}`;
    return {
      id: `custom-${Date.now()}`,
      label,
      custom: true,
      modules: kept.map(m => m.name),
      detected: draft.map(m => m.name)
    };
  };

  const setAt = (i, name) => setDraft(prev => prev.map((m, j) => (j === i ? { name, unsure: false } : m)));
  const removeAt = (i) => setDraft(prev => prev.filter((_, j) => j !== i));
  const move = (i, d) => setDraft(prev => {
    const j = i + d;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  return (
    <div className="lvlgen">
      <button className="back-btn" type="button" onClick={onBack}>← BACK</button>
      <div className="eyebrow">LEVEL GENERATOR</div>
      <h1>Generate Level</h1>
      <div className="sub">
        Paste a screenshot of the bomb board. Every module card is read by its title, in board order
        (left → right, top → bottom). Modules this app can't solve yet are <b>left out</b> of the level.
      </div>

      {isVisible && (
        <Dropzone
          onImage={handleImage}
          icon="🧨 ▦ ▦ ▦"
          title="Click here, then paste the bomb board screenshot"
        />
      )}

      <div className="lvlgen-row">
        <label className="setting-check-label">
          <input type="checkbox" className="setting-checkbox" checked={appendNext} onChange={e => setAppendNext(e.target.checked)} />
          <span className="setting-check-text">Next paste <b>adds</b> to this level (board split across screenshots)</span>
        </label>
      </div>

      {previewUri && (
        <div className="preview-row show">
          <img src={previewUri} alt="board screenshot" />
          <span>{draft.length} modules read</span>
          <button type="button" className="preview-clear-btn" onClick={() => { setPreviewUri(''); setDraft([]); }}>✕</button>
        </div>
      )}

      {draft.length > 0 && (
        <div className="about-panel lvlgen-panel">
          <div className="bg-panel-title">
            DETECTED MODULES — {kept.length} IN LEVEL{skipped.length ? `, ${skipped.length} SKIPPED (NO SOLVER)` : ''}
          </div>
          <ol className="lvlgen-list">
            {draft.map((m, i) => {
              const ok = isSolvable(m.name);
              return (
                <li key={i} className={`lvlgen-item ${ok ? '' : 'skipped'} ${m.unsure ? 'unsure' : ''}`}>
                  <span className="lvlgen-idx">{i + 1}</span>
                  <select value={m.name || ''} onChange={e => setAt(i, e.target.value)}>
                    {!m.name && <option value="">?</option>}
                    {ALL_NAMES.map(n => (
                      <option key={n} value={n}>{n}{isSolvable(n) ? '' : ' (no solver)'}</option>
                    ))}
                  </select>
                  <span className="lvlgen-tag">{ok ? (m.unsure ? 'CHECK' : 'IN LEVEL') : 'SKIPPED'}</span>
                  <span className="lvlgen-actions">
                    <button type="button" title="Move up" onClick={() => move(i, -1)}>↑</button>
                    <button type="button" title="Move down" onClick={() => move(i, 1)}>↓</button>
                    <button type="button" title="Remove" onClick={() => removeAt(i)}>✕</button>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="lvlgen-row">
            <input
              type="text"
              className="bg-url"
              placeholder={`Level name (default: Custom ${savedLevels.length + 1})`}
              value={levelName}
              onChange={e => setLevelName(e.target.value)}
              maxLength={40}
            />
          </div>
          <div className="lvlgen-row">
            <button type="button" className="about-btn lvlgen-start" disabled={!kept.length}
              onClick={() => { const lvl = buildLevel(); onSave(lvl); onStart(lvl); setLevelName(''); }}>
              ▶ START LEVEL ({kept.length} MODULES)
            </button>
            <button type="button" className="bg-btn" disabled={!kept.length}
              onClick={() => { onSave(buildLevel()); setLevelName(''); showToast('LEVEL SAVED ✓'); }}>
              Save only
            </button>
          </div>
        </div>
      )}

      {savedLevels.length > 0 && (
        <div className="about-panel lvlgen-panel">
          <div className="bg-panel-title">SAVED LEVELS (ALSO IN THE MISSIONS SIDEBAR)</div>
          <div className="lvlgen-saved">
            {savedLevels.map(l => (
              <div key={l.id} className="lvlgen-saved-item">
                <div>
                  <b>{l.label}</b>
                  <div className="lvlgen-saved-mods">{l.modules.join(' · ')}</div>
                </div>
                <span className="lvlgen-actions">
                  <button type="button" className="bg-btn" onClick={() => onStart(l)}>▶ Start</button>
                  <button type="button" className="bg-btn" onClick={() => onDelete(l.id)}>Delete</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
