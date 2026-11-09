import React, { useState } from 'react';
import { swNorm, swBFS } from './switchesSolver.js';
import { detectSwitchesAndGoals } from './switchesVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { SwitchesWorking } from './working.jsx';

export function SwitchesModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [initState, setInitState] = useState('UUUUU');
  const [goalState, setGoalState] = useState('DDDDD');
  const [forbiddenText, setForbiddenText] = useState('');
  const [editMode, setEditMode] = useState('init'); // 'init' or 'goal'
  const [path, setPath] = useState(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  const getForbiddenList = () => {
    return forbiddenText.split('\n').map(l => l.trim().toUpperCase()).filter(l => /^[UD]{5}$/.test(l));
  };

  const solve = () => {
    const init = swNorm(initState);
    const goal = swNorm(goalState);
    const forbidden = getForbiddenList();

    const sol = swBFS(init, goal, forbidden);
    if (!sol) {
      showToast(forbidden.includes(init) ? 'START POSITION IS FORBIDDEN' : 'NO VALID PATH (BLOCKED)');
      setPath(null);
      setLastCopyString('');
      return;
    }

    setPath(sol);
    setStepIdx(0);

    const moves = sol.length - 1;
    const moveSeq = sol.slice(1).map((s, i) => {
      const prev = sol[i];
      const d = s.split('').findIndex((c, j) => c !== prev[j]);
      return `SW${d + 1}`;
    }).join(' → ');

    if (isActive) {
      setLastCopyString(moveSeq);
      if (copyOnDecode && moveSeq) {
        copy(moveSeq);
      }
    }
  };

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);

    const detected = detectSwitchesAndGoals(img);
    if (detected) {
      const init = detected.detectedInit || detected.switches || 'UUUUU';
      const goal = detected.detectedGoal || detected.goals || 'DDDDD';
      setInitState(init);
      setGoalState(goal);
      showToast('SWITCHES DETECTED ✓');

      // Auto solve with detected states
      const forbidden = getForbiddenList();
      const sol = swBFS(swNorm(init), swNorm(goal), forbidden);
      if (sol) {
        setPath(sol);
        setStepIdx(0);
        const moveSeq = sol.slice(1).map((s, i) => {
          const prev = sol[i];
          const d = s.split('').findIndex((c, j) => c !== prev[j]);
          return `SW${d + 1}`;
        }).join(' → ');
        if (isActive) {
          setLastCopyString(moveSeq);
          if (copyOnDecode && moveSeq) copy(moveSeq);
        }
      } else {
        setPath(null);
        showToast('SWITCHES DETECTED — NO VALID PATH');
      }
    }
  };

  // Any edit to the inputs invalidates the previously computed solution
  const invalidate = () => {
    if (path) {
      setPath(null);
      setStepIdx(0);
    }
  };

  const handleSwitchClick = (i) => {
    invalidate();
    if (editMode === 'init') {
      const cur = swNorm(initState).split('');
      cur[i] = cur[i] === 'U' ? 'D' : 'U';
      setInitState(cur.join(''));
    } else {
      const cur = swNorm(goalState).split('');
      cur[i] = cur[i] === 'U' ? 'D' : 'U';
      setGoalState(cur.join(''));
    }
  };

  const handleSample = () => {
    setInitState('UUDDU');
    setGoalState('DDUUD');
    setForbiddenText('UDUDU\nDUDUD');
    setPath(null);
    setStepIdx(0);
    const sol = swBFS(swNorm('UUDDU'), swNorm('DDUUD'), ['UDUDU', 'DUDUD']);
    if (sol) {
      setPath(sol);
      const moveSeq = sol.slice(1).map((s, i) => {
        const prev = sol[i];
        const d = s.split('').findIndex((c, j) => c !== prev[j]);
        return `SW${d + 1}`;
      }).join(' → ');
      setLastCopyString(moveSeq);
      if (copyOnDecode && moveSeq) copy(moveSeq);
    }
    showToast('SAMPLE SWITCHES LOADED & SOLVED ✓');
  };

  const handleClear = () => {
    setInitState('UUUUU');
    setGoalState('DDDDD');
    setForbiddenText('');
    setPath(null);
    setStepIdx(0);
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
    showToast('SWITCHES RESET ✓');
  };

  const movesCount = path ? path.length - 1 : 0;
  const moveSeq = path
    ? path.slice(1).map((s, i) => {
        const prev = path[i];
        const d = s.split('').findIndex((c, j) => c !== prev[j]);
        return `SW${d + 1}`;
      }).join(' → ')
    : '';

  const copyItems = [];
  if (moveSeq) {
    copyItems.push({ label: `COPY FULL FLIP ORDER (${moveSeq})`, value: moveSeq });
    if (path) {
      copyItems.push({ label: `COPY FINAL GOAL (${goalState})`, value: goalState });
    }
  }

  const stampStats = path
    ? `MOVES: ${movesCount} | ${moveSeq}`
    : `SWITCHES: 5 | FORBIDDEN: ${getForbiddenList().length}`;

  const currentDisplayState = path ? path[stepIdx] : initState;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🎚️ ⬆ ⬇ ⬆ ⬇ ⬆"
              title="Click here, then paste a screenshot of the 5 switches"
            />
          }
          preview={
            previewUri ? (
              <div className="preview-row show">
                <img src={previewUri} alt="uploaded preview" />
                <span>{previewMeta}</span>
                <button type="button" className="preview-clear-btn" onClick={() => { setPreviewUri(''); setPreviewMeta(''); }}>✕</button>
              </div>
            ) : null
          }
          controls={
            <>
              <button className="reset-btn" type="button" onClick={handleClear}>
                clear
              </button>
              <button
                className="reset-btn"
                type="button"
                style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }}
                onClick={handleSample}
              >
                ⚡ SAMPLE
              </button>
            </>
          }
        >
          <div className="switches-config" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label className="search-config-label">START POSITIONS (5 chars: U or D):</label>
                <input
                  type="text"
                  className="search-words-field"
                  value={initState}
                  maxLength={5}
                  onChange={(e) => { invalidate(); setInitState(e.target.value.toUpperCase().replace(/[^UD]/g, '')); }}
                />
              </div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label className="search-config-label">GOAL LED POSITIONS (5 chars: U or D):</label>
                <input
                  type="text"
                  className="search-words-field"
                  value={goalState}
                  maxLength={5}
                  onChange={(e) => { invalidate(); setGoalState(e.target.value.toUpperCase().replace(/[^UD]/g, '')); }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="search-config-label">CLICKING SWITCH TOGGLES:</span>
              <button
                type="button"
                className={`bg-btn ${editMode === 'init' ? 'active' : ''}`}
                style={{ borderColor: editMode === 'init' ? 'var(--brass)' : '' }}
                onClick={() => { invalidate(); setEditMode('init'); }}
              >
                Start Position
              </button>
              <button
                type="button"
                className={`bg-btn ${editMode === 'goal' ? 'active' : ''}`}
                style={{ borderColor: editMode === 'goal' ? 'var(--brass)' : '' }}
                onClick={() => { invalidate(); setEditMode('goal'); }}
              >
                Goal Position
              </button>
            </div>

            <div className="search-config-row">
              <label className="search-config-label">FORBIDDEN CONFIGURATIONS (1 PER LINE, e.g. "UDDUD"):</label>
              <textarea
                className="password-rows-field"
                rows={2}
                value={forbiddenText}
                onChange={(e) => { invalidate(); setForbiddenText(e.target.value); }}
                placeholder="UDDUD&#10;DDUUU"
              />
            </div>

            <div className="search-btn-row">
              <button
                type="button"
                className="bg-btn"
                style={{ borderColor: 'var(--brass)', color: 'var(--brass)', fontWeight: 700 }}
                onClick={solve}
              >
                ▶ SOLVE SWITCHES
              </button>
              <button type="button" className="bg-btn" onClick={handleClear}>
                🗑️ RESET
              </button>
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="SOLVED SWITCH FLIP SEQUENCE"
          stats={stampStats}
          answers={path ? `✓ ${movesCount} MOVE${movesCount !== 1 ? 'S' : ''}: ${moveSeq}` : []}
          copyValue={moveSeq}
          placeholder="PRESS SOLVE ▶"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="SWITCH WORKSPACE — 5 toggles with target LEDs and step breakdown"
        >
          <SwitchesWorking
            currentState={currentDisplayState}
            goalState={goalState}
            path={path}
            stepIdx={stepIdx}
            onSwitchClick={handleSwitchClick}
            onSelectStep={(idx) => setStepIdx(idx)}
          />
        </WorkingPanel>
      }
    />
  );
}

export const switchesModule = {
  id: 'switches',
  tabId: 'tabSwitches',
  tabLabel: '🎚️ SWITCHES',
  eyebrow: 'SWITCHES PUZZLE SOLVER',
  title: 'Switches Vision',
  sub: 'Upload a screenshot of the 5 switches or set positions manually. Calculates the <b>shortest valid flip sequence</b> avoiding forbidden states and copies flips to your clipboard!',
  Component: SwitchesModule
};
