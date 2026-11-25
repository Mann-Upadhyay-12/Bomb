import React, { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { manualBoxPaste } from '../../core/airPaste.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { readCircuit } from './circuitVision.js';
import { readLegend, legendToManual } from './circuitLegend.js';
import { solveCircuit, parseCircuitManual, CIRCUIT_COLORS } from './circuitSolver.js';
import { encodeShape } from '../../utils/glyph.js';
import { CircuitWorking, SWATCH } from './working.jsx';

// The colour → ohms table changes every game: it is read from the legend picture (or pasted as text)
// and shared by every Circuit on the bomb. The first line records when it was read.
export const CIRCUIT_MANUAL_KEY = 'bombvision_circuit_manual';
const DIGITS_KEY = 'bombvision_circuit_digits'; // digit shapes learned from corrected legend values (JSON)
const STAMP = '# read from the legend picture';

const stampedAt = (text) => {
  const m = new RegExp(`^${STAMP} (\\S+)`, 'm').exec(String(text || ''));
  const t = m ? Date.parse(m[1]) : NaN;
  return Number.isFinite(t) ? t : null;
};
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const legendText = (chips) => `${STAMP} ${new Date().toISOString()}\n${legendToManual(chips)}`;

function chipThumb(img, b) {
  const c = document.createElement('canvas');
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, b.x0, b.y0, w, h, 0, 0, w, h);
  return c.toDataURL();
}

export function CircuitModule({ isActive = true }) {
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  // every Circuit on the bomb uses the same colour → ohms table
  const [manualText, setManualText] = useSharedSetting(CIRCUIT_MANUAL_KEY, '');
  const manual = useMemo(() => parseCircuitManual(manualText), [manualText]);
  const manualCount = Object.keys(manual).length;
  const readAt = stampedAt(manualText);
  const [learnedJson, setLearnedJson] = useSharedSetting(DIGITS_KEY, '');
  const learned = useMemo(() => { try { return learnedJson ? JSON.parse(learnedJson) : {}; } catch (e) { return {}; } }, [learnedJson]);

  const [shot, setShot] = useState(null);       // { uri, W, H }
  const [circuit, setCircuit] = useState(null); // readCircuit result
  const [colors, setColors] = useState([]);     // per-resistor colour (editable)
  const [legend, setLegend] = useState(null);   // { chips } — the legend picture pasted in this card

  const solved = useMemo(() => {
    if (!circuit || !circuit.ok || !manualCount) return null;
    const rs = circuit.resistors.map((r, i) => ({ ...r, color: colors[i] || r.color }));
    return solveCircuit(rs, circuit.A, circuit.B, manual);
  }, [circuit, colors, manual, manualCount]);
  const answer = solved && solved.ok ? solved.ohms.decimal : '';

  useEffect(() => {
    const fresh = answerChanged(answer); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
    if (inst && inst.report) inst.report(answer ? `${answer} Ω` : '');
  }, [answer, isActive]);

  // the table this card last wrote: if it changes elsewhere (another card, the text box), this
  // card's chip list is out of date, so it goes
  const wroteRef = React.useRef(null);
  const applyLegend = (chips) => {
    const text = legendText(chips);
    wroteRef.current = text;
    setLegend({ chips });
    setManualText(text);
  };
  useEffect(() => { if (legend && manualText !== wroteRef.current) setLegend(null); }, [manualText]);

  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, W, H).data;
    const c = readCircuit(data, W, H);

    // no orange terminals: maybe it's the colour legend
    if (!(c.terminals && c.terminals.length === 2)) {
      const lg = readLegend(data, W, H, learned);
      const valued = lg.ok ? lg.chips.filter(ch => ch.value !== null).length : 0;
      if (valued >= 3) {
        const chips = lg.chips.map(ch => ({ ...ch, thumb: chipThumb(img, ch.box), read: ch.value }));
        applyLegend(chips);
        const check = chips.filter(ch => !ch.sure).length;
        showToast(check ? `LEGEND READ — CHECK ${check} VALUE${check > 1 ? 'S' : ''}` : `LEGEND READ ✓ ${chips.length} COLOURS`);
        return;
      }
    }
    setShot({ uri: dataUri, W, H });
    setCircuit(c);
    setColors(c.resistors ? c.resistors.map(r => r.color) : []);
    if (c.ok) showToast(`CIRCUIT READ ✓ ${c.resistors.length} RESISTORS`);
  };

  // fixing a legend value: used straight away; when the box loses focus the digit shapes are learned
  const setChipValue = (k, v) => {
    const clean = String(v).replace(/\D/g, '');
    const chips = legend.chips.map((ch, j) => (j === k ? { ...ch, value: clean ? String(Number(clean)) : null, sure: Boolean(clean) } : ch));
    applyLegend(chips);
  };
  const learnChip = (k) => {
    const ch = legend.chips[k];
    const typed = ch.value || '';
    if (!ch.digits || typed === ch.read || typed.length !== ch.digits.length) return;
    const next = { ...learned };
    ch.digits.forEach((g, i) => {
      if (!g.glyph || g.ch === typed[i]) return;
      next[typed[i]] = [{ aspect: +g.glyph.aspect.toFixed(3), fp: encodeShape(g.glyph.v) }, ...(next[typed[i]] || [])].slice(0, 4);
    });
    setLearnedJson(JSON.stringify(next));
  };

  const handleClear = () => {
    setShot(null); setCircuit(null); setColors([]); setLegend(null);
    setLastImage(null, null); setLastCopyString('');
  };

  const legendWarn = legend ? legend.chips.filter(ch => !ch.sure).length : 0;
  const dupes = legend ? legend.chips.map(ch => ch.color).filter((c, i, a) => a.indexOf(c) !== i) : [];

  const status = !circuit ? ''
    : !circuit.ok ? `⚠ ${circuit.error}`
    : !manualCount ? '⚠ Paste this game’s colour legend picture — the circuit is read, its values aren’t known yet'
    : solved && !solved.ok ? `⚠ ${solved.error}`
    : `✓ ${circuit.resistors.length} resistors · ${solved.ohms.isInteger ? '' : `exact ${solved.ohms.exact} Ω · `}check the colours below match the screenshot`;

  const placeholder = !circuit ? (manualCount ? 'PASTE THE CIRCUIT SCREENSHOT' : 'PASTE THE LEGEND + THE CIRCUIT')
    : !manualCount ? 'PASTE THE COLOUR LEGEND'
    : (status.replace(/^⚠ /, '').toUpperCase() || '— — —');

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="⚡ R1 — R2 — R3"
              title="Click here, then paste the circuit or the colour legend picture"
              sub={<>the <b>legend</b> (colour → Ω) changes every game — paste it once · then each <b>circuit</b></>}
            />
          }
          controls={<button className="reset-btn" type="button" onClick={handleClear}>clear</button>}
        >
          <ol className="cir-steps">
            <li className={manualCount ? 'ok' : 'todo'}>
              {manualCount
                ? <>Legend ✓ {manualCount} colours · {readAt ? ago(readAt) : 'typed / pasted text — check it’s this game’s'}
                  {legendWarn ? <span className="warn"> · check the marked value{legendWarn > 1 ? 's' : ''}</span> : null}
                  {dupes.length ? <span className="warn"> · two chips read as {dupes.join(', ')}</span> : null}</>
                : <>Paste this game’s <b>colour legend</b> picture (colour → Ω)</>}
            </li>
            <li className={circuit && circuit.ok ? 'ok' : 'todo'}>
              {circuit ? (circuit.ok ? <>Circuit ✓ {circuit.resistors.length} resistors</> : <>⚠ {circuit.error}</>) : <>Paste the <b>circuit</b> picture</>}
            </li>
          </ol>
          {legend && (
            <div className="cir-legend">
              {legend.chips.map((ch, k) => (
                <label key={k} className={`cir-chip ${ch.sure ? '' : 'unsure'}`} title={ch.sure ? '' : 'Not sure about this value — check it against the picture'}>
                  <img src={ch.thumb} alt="" />
                  <span className="cir-chip-name"><span className="cir-swatch" style={{ background: SWATCH[ch.color] || '#888' }} />{ch.color}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={ch.value ?? ''}
                    placeholder="?"
                    aria-label={`${ch.color} ohms`}
                    onChange={e => setChipValue(k, e.target.value)}
                    onBlur={() => learnChip(k)}
                  />
                  <span className="cir-ohm">Ω</span>
                  {!ch.sure && <span className="cir-check">check</span>}
                </label>
              ))}
            </div>
          )}
          {status && <div className={`module-hint ${status.startsWith('⚠') ? 'bad' : 'ok'}`}>{status}</div>}
          {!grouped && (
            <details className="wsq-fix">
              <summary>Colour → Ω table (read from the legend picture; you can edit it)</summary>
              <textarea
                className="search-words-field"
                rows={9}
                value={manualText}
                spellCheck="false"
                placeholder={'Paste the legend picture above — or type lines like\nRed = 4 Ω'}
                onChange={(e) => setManualText(e.target.value)}
                onPaste={manualBoxPaste(inst && inst.multi ? inst.index : null)}
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
  sub: 'Paste this game’s <b>colour legend</b> picture (colour → Ω) once, then each Circuit screenshot. Reads every resistor and wire and copies the <b>total resistance between the two orange terminals</b> — series, parallel, shorted corners and bridges.',
  Component: CircuitModule
};
