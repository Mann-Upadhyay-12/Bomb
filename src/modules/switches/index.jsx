import React, { useState, useEffect, useMemo } from 'react';
import { swNorm, swBFS, swParseForbidden, swMoves } from './switchesSolver.js';
import { detectSwitchesAndGoals } from './switchesVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { discordPlain } from '../../utils/discordText.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { SwitchesWorking } from './working.jsx';

const isTextField = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'file' && el.type !== 'checkbox'));

export function SwitchesModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  const [initState, setInitState] = useState('UUUUU');
  const [goalState, setGoalState] = useState('DDDDD');
  const [forbiddenText, setForbiddenText] = useState('');
  // the switches were read from a picture, loaded from the sample or set by hand: until then the
  // default UUUUU → DDDDD isn't a real module, so nothing is answered
  const [ready, setReady] = useState(false);
  const [editMode, setEditMode] = useState('init'); // 'init' or 'goal'
  const [stepIdx, setStepIdx] = useState(0);
  const [status, setStatus] = useState({ text: '', ok: null });
  const [previewUri, setPreviewUri] = useState('');
  const [previewMeta, setPreviewMeta] = useState('');

  // Solved again whenever the start, goal or forbidden list changes — so the picture and the
  // manual can come in either order
  const forbidden = useMemo(() => swParseForbidden(forbiddenText), [forbiddenText]);
  const init = swNorm(initState), goal = swNorm(goalState);
  const path = useMemo(() => (ready ? swBFS(init, goal, forbidden) : null), [ready, init, goal, forbidden]);
  const moveSeq = swMoves(path);
  const answer = path ? (moveSeq || 'Already solved') : '';
  useEffect(() => { setStepIdx(0); }, [path && path.join()]);

  useEffect(() => {
    const fresh = answerChanged(answer);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  // The Helper's forbidden list pasted anywhere on the page (outside a text box) loads it, like the
  // manuals of the other modules
  useEffect(() => {
    if (!isActive) return undefined;
    const onPaste = (e) => {
      if (isTextField(document.activeElement)) return;
      const cd = e.clipboardData;
      if (!cd || Array.from(cd.items || []).some(it => it.kind === 'file')) return;
      const t = discordPlain(cd.getData('text'));
      if (!t || /^https?:\/\//i.test(t.trim()) || !swParseForbidden(t).length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setForbiddenText(t.trim());
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [isActive]);

  const handleImage = (img, dataUri, fileBlob) => {
    setPreviewUri(dataUri);
    setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px source`);
    setLastImage(img, fileBlob);
    const detected = detectSwitchesAndGoals(img);
    if (!detected) {
      setStatus({ text: '⚠ Could not read the switches — click them below to set the start and goal.', ok: false });
      return;
    }
    const a = swNorm(detected.detectedInit || detected.switches || 'UUUUU');
    const b = swNorm(detected.detectedGoal || detected.goals || 'DDDDD');
    setInitState(a);
    setGoalState(b);
    setReady(true);
    setStatus({ text: `✓ Start ${a} → goal ${b}${forbiddenText.trim() ? '' : ' — paste the forbidden list (Ctrl+V anywhere) if this bomb has one'}`, ok: true });
  };

  const touch = () => { setReady(true); setStatus({ text: '', ok: null }); };

  const handleSwitchClick = (i) => {
    touch();
    if (editMode === 'init') {
      const cur = init.split('');
      cur[i] = cur[i] === 'U' ? 'D' : 'U';
      setInitState(cur.join(''));
    } else {
      const cur = goal.split('');
      cur[i] = cur[i] === 'U' ? 'D' : 'U';
      setGoalState(cur.join(''));
    }
  };

  const handleSample = () => {
    setInitState('UUDDU');
    setGoalState('DDUUD');
    setForbiddenText('UDUDU\nDUDUD');
    setReady(true);
    setStatus({ text: '', ok: null });
  };

  const handleClear = () => {
    setInitState('UUUUU');
    setGoalState('DDDDD');
    setForbiddenText('');
    setReady(false);
    setStatus({ text: '', ok: null });
    setPreviewUri('');
    setPreviewMeta('');
    setLastImage(null, null);
    setLastCopyString('');
  };

  const movesCount = path ? path.length - 1 : 0;
  // why there is no answer
  const placeholder = !ready ? 'PASTE THE SWITCHES PICTURE'
    : forbidden.includes(init) ? 'START POSITION IS FORBIDDEN — CHECK IT'
    : forbidden.includes(goal) ? 'GOAL IS A FORBIDDEN STATE — CHECK IT'
    : 'NO PATH AVOIDS THE FORBIDDEN STATES';

  const copyItems = [];
  if (moveSeq) {
    copyItems.push({ label: `COPY FULL FLIP ORDER (${moveSeq})`, value: moveSeq });
    if (path) {
      copyItems.push({ label: `COPY FINAL GOAL (${goalState})`, value: goalState });
    }
  }

  const stampStats = path
    ? `MOVES: ${movesCount} · ${forbidden.length} FORBIDDEN`
    : `SWITCHES: 5 · FORBIDDEN: ${forbidden.length}`;

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
              <button className="reset-btn" type="button" onClick={handleClear} data-card-clear>
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
          {status.text && <div className={`module-hint ${status.ok === false ? 'bad' : status.ok ? 'ok' : ''}`}>{status.text}</div>}
          <div className="switches-config" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label className="search-config-label">START POSITIONS (5 chars: U or D):</label>
                <input
                  type="text"
                  className="search-words-field"
                  value={initState}
                  maxLength={5}
                  onChange={(e) => { touch(); setInitState(e.target.value.toUpperCase().replace(/[^UD]/g, '')); }}
                />
              </div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label className="search-config-label">GOAL LED POSITIONS (5 chars: U or D):</label>
                <input
                  type="text"
                  className="search-words-field"
                  value={goalState}
                  maxLength={5}
                  onChange={(e) => { touch(); setGoalState(e.target.value.toUpperCase().replace(/[^UD]/g, '')); }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="search-config-label">CLICKING SWITCH TOGGLES:</span>
              <button
                type="button"
                className={`bg-btn ${editMode === 'init' ? 'active' : ''}`}
                style={{ borderColor: editMode === 'init' ? 'var(--brass)' : '' }}
                onClick={() => setEditMode('init')}
              >
                Start Position
              </button>
              <button
                type="button"
                className={`bg-btn ${editMode === 'goal' ? 'active' : ''}`}
                style={{ borderColor: editMode === 'goal' ? 'var(--brass)' : '' }}
                onClick={() => setEditMode('goal')}
              >
                Goal Position
              </button>
            </div>

            <div className="search-config-row">
              <label className="search-config-label">FORBIDDEN STATES — paste the Helper's list as-is, here or anywhere (Ctrl+V) · {forbidden.length} read:</label>
              <textarea
                className="password-rows-field"
                rows={2}
                value={forbiddenText}
                onChange={(e) => setForbiddenText(e.target.value)}
                placeholder="UDDUD&#10;DDUUU"
              />
            </div>

            <div className="search-btn-row">
              <button type="button" className="bg-btn" onClick={handleClear} data-card-clear>
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
          answers={path ? (moveSeq ? `✓ ${movesCount} MOVE${movesCount !== 1 ? 'S' : ''}: ${moveSeq}` : '✓ ALREADY AT THE GOAL') : []}
          copyValue={answer}
          placeholder={placeholder}
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
