import React, { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { readCircuit } from './circuitVision.js';
import { solveCircuit, parseCircuitManual, CIRCUIT_DEFAULT_MANUAL, CIRCUIT_COLORS } from './circuitSolver.js';
import { CircuitWorking } from './working.jsx';

export const CIRCUIT_MANUAL_KEY = 'bombvision_circuit_manual';

export function CircuitModule({ isActive = true }) {
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  // every Circuit on the bomb uses the same colour → ohms table
  const [manualText, setManualText] = useSharedSetting(CIRCUIT_MANUAL_KEY, CIRCUIT_DEFAULT_MANUAL);
  const manual = useMemo(() => parseCircuitManual(manualText), [manualText]);

  const [shot, setShot] = useState(null);     // { uri, W, H }
  const [circuit, setCircuit] = useState(null); // readCircuit result
  const [colors, setColors] = useState([]);   // per-resistor colour (editable)

  const solved = useMemo(() => {
    if (!circuit || !circuit.ok) return null;
    const rs = circuit.resistors.map((r, i) => ({ ...r, color: colors[i] || r.color }));
    return solveCircuit(rs, circuit.A, circuit.B, manual);
  }, [circuit, colors, manual]);
  const answer = solved && solved.ok ? solved.ohms.decimal : '';

  useEffect(() => {
    const fresh = answerChanged(answer); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
    if (inst && inst.report) inst.report(answer ? `${answer} Ω` : '');
  }, [answer, isActive]);

  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const c = readCircuit(ctx.getImageData(0, 0, W, H).data, W, H);
    setShot({ uri: dataUri, W, H });
    setCircuit(c);
    setColors(c.resistors ? c.resistors.map(r => r.color) : []);
    if (c.ok) showToast(`CIRCUIT READ ✓ ${c.resistors.length} RESISTORS`);
  };

  const handleClear = () => {
    setShot(null); setCircuit(null); setColors([]);
    setLastImage(null, null); setLastCopyString('');
  };

  const status = !circuit ? ''
    : !circuit.ok ? `⚠ ${circuit.error}`
    : solved && !solved.ok ? `⚠ ${solved.error}`
    : `✓ ${circuit.resistors.length} resistors · ${solved.ohms.isInteger ? '' : `exact ${solved.ohms.exact} Ω · `}check the colours below match the screenshot`;

  const placeholder = !circuit ? 'PASTE THE CIRCUIT SCREENSHOT' : (status.replace(/^⚠ /, '').toUpperCase() || '— — —');

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={<Dropzone onImage={handleImage} icon="⚡ R1 — R2 — R3" title="Click here, then paste the Circuit screenshot" />}
          controls={<button className="reset-btn" type="button" onClick={handleClear}>clear</button>}
        >
          {status && <div className={`module-hint ${status.startsWith('⚠') ? 'bad' : 'ok'}`}>{status}</div>}
          {!grouped && (
            <details className="wsq-fix">
              <summary>Manual (colour → Ω)</summary>
              <textarea
                className="search-words-field"
                rows={8}
                value={manualText}
                spellCheck="false"
                onChange={(e) => setManualText(e.target.value)}
              />
            </details>
          )}
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="TOTAL RESISTANCE (Ω)"
          stats={solved && solved.ok ? `${circuit.resistors.length} RESISTORS${solved.ohms.isInteger ? '' : ` · EXACT ${solved.ohms.exact}`}` : 'BETWEEN THE TWO ORANGE TERMINALS'}
          answers={answer ? [answer] : []}
          copyValue={answer}
          placeholder={placeholder}
        />
      }
      copylines={<CopyLines items={answer ? [
        { label: `COPY ${answer}`, value: answer },
        ...(solved.ohms.isInteger ? [] : [{ label: `EXACT ${solved.ohms.exact}`, value: solved.ohms.exact }])
      ] : []} />}
      working={
        <WorkingPanel title="CIRCUIT — what was read (fix a colour if it's wrong)">
          <CircuitWorking
            shot={shot}
            circuit={circuit}
            colors={colors}
            values={solved ? solved.values : []}
            colorNames={CIRCUIT_COLORS}
            onColor={(i, c) => setColors(cs => cs.map((x, k) => (k === i ? c : x)))}
          />
        </WorkingPanel>
      }
    />
  );
}

export const circuitModule = {
  id: 'circuit',
  tabId: 'tabCircuit',
  tabLabel: '⚡ CIRCUIT',
  eyebrow: 'RESISTOR NETWORK',
  title: 'Circuit Vision',
  sub: 'Paste the manual (colour → Ω) and the Circuit screenshot. Reads every resistor and wire and copies the <b>total resistance between the two orange terminals</b> — series, parallel, shorted corners and bridges.',
  Component: CircuitModule
};
