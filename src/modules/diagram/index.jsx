import React, { useState, useRef } from 'react';
import { VennCore } from './diagramCore.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { DiagramWorking, DG_LAYOUTS } from './working.jsx';

const DG_LETTERS = ['A', 'B', 'C'];

// Render A/B/C in a few common fonts and add them as extra glyph templates
// (ported from the original single-file app) to improve circle-label recognition.
let fontTemplatesAdded = false;
function ensureFontTemplates() {
  if (fontTemplatesAdded) return;
  fontTemplatesAdded = true;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const x = c.getContext('2d', { willReadFrequently: true });
    ['Arial', 'Verdana', 'Georgia', '"IBM Plex Mono"', '"Trebuchet MS"'].forEach(font => {
      DG_LETTERS.forEach(letter => {
        x.fillStyle = '#000'; x.fillRect(0, 0, 96, 96);
        x.fillStyle = '#fff'; x.font = 'bold 64px ' + font + ', sans-serif';
        x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(letter, 48, 50);
        const d = x.getImageData(0, 0, 96, 96).data;
        let x0 = 96, y0 = 96, x1 = -1, y1 = -1;
        for (let yy = 0; yy < 96; yy++) for (let xx = 0; xx < 96; xx++) {
          if (d[(yy * 96 + xx) * 4] > 110) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
        }
        if (x1 < 0) return;
        const w = x1 - x0 + 1, h = y1 - y0 + 1, cov = new Float32Array(w * h);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) cov[yy * w + xx] = d[((y0 + yy) * 96 + x0 + xx) * 4] / 255;
        VennCore.addTemplate(letter, VennCore.resampleGlyph(cov, w, h));
      });
    });
  } catch (e) {}
}

export function DiagramModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [mode, setMode] = useState(3); // 2 or 3
  const [orient2, setOrient2] = useState('h'); // 'h' or 'v'
  const [showUnshaded, setShowUnshaded] = useState(false);

  const [lettersState, setLettersState] = useState({
    c3: Object.assign({}, DG_LAYOUTS.c3.defaults),
    c2h: Object.assign({}, DG_LAYOUTS.c2h.defaults),
    c2v: Object.assign({}, DG_LAYOUTS.c2v.defaults)
  });

  const [selState, setSelState] = useState({
    c3: new Set(),
    c2h: new Set(),
    c2v: new Set()
  });

  const [shots, setShots] = useState([]);

  const layoutKey = mode === 3 ? 'c3' : (orient2 === 'h' ? 'c2h' : 'c2v');
  const L = DG_LAYOUTS[layoutKey];
  const currentLetters = lettersState[layoutKey];
  const currentSel = selState[layoutKey];

  const letterNames = L.slots.map(s => currentLetters[s]).sort();

  const slotToLocal = (slotMask) => {
    let m = 0;
    L.slots.forEach((s, i) => {
      if (slotMask & (1 << i)) m |= 1 << letterNames.indexOf(currentLetters[s]);
    });
    return m;
  };

  const localToSlot = (localMask) => {
    let m = 0;
    L.slots.forEach((s, i) => {
      if ((localMask >> letterNames.indexOf(currentLetters[s])) & 1) m |= 1 << i;
    });
    return m;
  };

  const toggleSlot = (sm) => {
    const next = new Set(currentSel);
    if (next.has(sm)) next.delete(sm);
    else next.add(sm);
    setSelState({ ...selState, [layoutKey]: next });
  };

  // Compute Boolean Expression
  const localSet = new Set();
  currentSel.forEach(sm => localSet.add(slotToLocal(sm)));
  const total = 1 << letterNames.length;
  let targetSet = localSet;
  if (showUnshaded) {
    targetSet = new Set();
    for (let m = 0; m < total; m++) if (!localSet.has(m)) targetSet.add(m);
  }

  const expr = VennCore.expression(letterNames, targetSet);

  React.useEffect(() => {
    if (!isActive) return;
    if (expr && expr !== 'Null') {
      setLastCopyString(expr);
      if (copyOnDecode) {
        copy(expr);
      }
    } else {
      setLastCopyString('');
    }
  }, [expr, isActive]);

  // Tracks the current "round" of screenshots: the game shows the circle labels and
  // the shading in separate screenshots, so a labels-only shot must not wipe shading.
  const roundRef = useRef({ lk: null, labels: false, shade: false });
  const [hint, setHint] = useState({ text: '', kind: '' });

  const analyzeImage = (img, dataUri) => {
    try {
      ensureFontTemplates();
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const sc = Math.min(1, 480 / Math.max(iw, ih));
      const w = Math.max(1, Math.round(iw * sc));
      const h = Math.max(1, Math.round(ih * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#1f2228'; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
      const res = VennCore.analyze(ctx.getImageData(0, 0, w, h));

      if (!res || !res.ok) {
        const reason = (res && res.reason) || 'Could not analyse that image.';
        setShots(prev => [...prev.filter(sh => sh.type !== 'bad').slice(-1), { url: dataUri, type: 'bad', meta: reason }]);
        setHint({ text: reason, kind: 'bad' });
        showToast('DIAGRAM NOT RECOGNISED');
        return;
      }

      const lk = res.layout;
      const LL = DG_LAYOUTS[lk];
      const hasLetters = !!res.letters;
      const masks = (res.shade && res.shade.masks) || [];
      const shadedCount = masks.length;
      const type = hasLetters ? (shadedCount > 0 ? 'both' : 'labels') : 'shade';

      let rd = roundRef.current;
      let freshRound = false;
      if (rd.lk !== lk || (rd.labels && rd.shade)) {
        rd = { lk, labels: false, shade: false };
        freshRound = true;
      }

      if (lk === 'c3') setMode(3);
      else { setMode(2); setOrient2(lk === 'c2h' ? 'h' : 'v'); }

      if (hasLetters) {
        setLettersState(prev => ({ ...prev, [lk]: Object.assign({}, res.letters.slotLetters) }));
        rd.labels = true;
      }
      if (!hasLetters || shadedCount > 0 || !rd.shade) {
        setSelState(prev => ({ ...prev, [lk]: new Set(masks) }));
        if (!hasLetters || shadedCount > 0) rd.shade = true;
      }
      roundRef.current = rd;

      const parts = [];
      if (type !== 'labels') parts.push(`${shadedCount} region${shadedCount === 1 ? '' : 's'} shaded`);
      if (hasLetters) parts.push(LL.slots.map(sl => `${LL.names[sl]} = ${res.letters.slotLetters[sl]}`).join(' · '));
      const meta = (lk === 'c3' ? '3 circles' : '2 circles') + (parts.length ? ' · ' + parts.join(' · ') : '');

      setShots(prev => {
        let list = freshRound ? [] : prev.filter(sh => sh.type !== 'bad');
        list = list.filter(sh => sh.type !== type && sh.type !== 'both' && type !== 'both');
        return [...list, { url: dataUri, type, meta }].slice(-2);
      });

      let msg = '✓ ' + meta;
      if (!hasLetters) {
        msg += res.lettersTried
          ? ' — letters unclear, set the circle names manually if needed.'
          : (rd.labels ? '' : ' — add the lettered screenshot to set circle names.');
      }
      setHint({ text: msg, kind: 'ok' });
      showToast('DIAGRAM ANALYZED ✓');
    } catch (err) {
      setHint({ text: (err && err.message) || 'Could not analyse that image.', kind: 'bad' });
    }
  };

  // Multiple screenshots (labels + shading) dropped/pasted at once: process sequentially
  const handleFiles = (files) => {
    Array.from(files)
      .filter(f => f && (!f.type || f.type.startsWith('image/')))
      .forEach(f => {
        const reader = new FileReader();
        reader.onload = ev => {
          const img = new Image();
          img.onload = () => analyzeImage(img, ev.target.result);
          img.src = ev.target.result;
        };
        reader.readAsDataURL(f);
      });
  };

  const handleSample = () => {
    setMode(3);
    setSelState(prev => ({
      ...prev,
      c3: new Set([3, 7])
    }));
    showToast('SAMPLE VENN DIAGRAM SHADED ✓');
  };

  // Clears only the shading of the current layout (used by the region CLEAR chip)
  const handleClearShading = () => {
    setSelState({ ...selState, [layoutKey]: new Set() });
  };

  // Full reset: shading, circle names, screenshots and the screenshot round
  const handleClear = () => {
    setSelState({ c3: new Set(), c2h: new Set(), c2v: new Set() });
    setLettersState({
      c3: Object.assign({}, DG_LAYOUTS.c3.defaults),
      c2h: Object.assign({}, DG_LAYOUTS.c2h.defaults),
      c2v: Object.assign({}, DG_LAYOUTS.c2v.defaults)
    });
    roundRef.current = { lk: null, labels: false, shade: false };
    setHint({ text: '', kind: '' });
    setShots([]);
    setLastCopyString('');
    showToast('SHADING CLEARED ✓');
  };

  const handleAll = () => {
    const all = new Set();
    for (let i = 0; i < (1 << L.n); i++) all.add(i);
    setSelState({ ...selState, [layoutKey]: all });
  };

  const handleInvert = () => {
    const inv = new Set();
    for (let i = 0; i < (1 << L.n); i++) {
      if (!currentSel.has(i)) inv.add(i);
    }
    setSelState({ ...selState, [layoutKey]: inv });
  };

  // Circle name change
  const handleLetterChange = (slot, newLetter) => {
    const oldLetter = currentLetters[slot];
    const otherSlot = L.slots.find(t => t !== slot && currentLetters[t] === newLetter);
    const updated = { ...currentLetters, [slot]: newLetter };
    if (otherSlot) updated[otherSlot] = oldLetter;
    setLettersState({ ...lettersState, [layoutKey]: updated });
  };

  const copyItems = [];
  if (expr && expr !== 'Null') {
    copyItems.push({ label: `COPY FORMULA (${expr})`, value: expr });
  }

  const word = showUnshaded ? 'UNSHADED' : 'SHADED';
  const cnt = showUnshaded ? total - currentSel.size : currentSel.size;
  const stampStats = `${word}: ${cnt} of ${total} regions | CIRCLES: ${letterNames.join(', ')}`;

  const chipOrder = L.n === 3 ? [1, 2, 4, 3, 5, 6, 7, 0] : [1, 2, 3, 0];

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={(img, dataUri) => analyzeImage(img, dataUri)}
              onFiles={handleFiles}
              multiple
              icon="🔵 🔴 🟡"
              title="Upload diagram screenshot (multiple tiles supported)"
            />
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
          <div className="diagram-config" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            {hint.text && (
              <div className={`module-hint ${hint.kind === 'bad' ? 'bad' : 'ok'}`}>{hint.text}</div>
            )}
            <div className="mode-row" style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className={`bg-btn ${mode === 2 ? 'active' : ''}`}
                style={{ borderColor: mode === 2 ? 'var(--brass)' : '' }}
                onClick={() => setMode(2)}
              >
                2 CIRCLES
              </button>
              <button
                type="button"
                className={`bg-btn ${mode === 3 ? 'active' : ''}`}
                style={{ borderColor: mode === 3 ? 'var(--brass)' : '' }}
                onClick={() => setMode(3)}
              >
                3 CIRCLES
              </button>
              {mode === 2 && (
                <button
                  type="button"
                  className="bg-btn"
                  onClick={() => setOrient2(orient2 === 'h' ? 'v' : 'h')}
                >
                  {orient2 === 'h' ? 'HORIZONTAL' : 'VERTICAL'}
                </button>
              )}
            </div>

            {/* Circle Names */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="search-config-label">CIRCLE NAMES:</span>
              {L.slots.map(s => (
                <label key={s} className="name-pick" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ink)' }}>{L.names[s]}:</span>
                  <select
                    value={currentLetters[s]}
                    onChange={(e) => handleLetterChange(s, e.target.value)}
                    style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '4px', padding: '2px 6px' }}
                  >
                    {DG_LETTERS.map(lt => (
                      <option key={lt} value={lt}>{lt}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {/* Quick Toggle Regions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span className="search-config-label">QUICK TOGGLE REGIONS:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {chipOrder.map(m => {
                  const sm = localToSlot(m);
                  const active = currentSel.has(sm);
                  const label = m === 0 ? 'Outside' : letterNames.filter((_, i) => (m >> i) & 1).join(' ∩ ');

                  return (
                    <button
                      key={m}
                      type="button"
                      className={`chip-btn ${active ? 'active' : ''}`}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: active ? '1px solid var(--brass)' : '1px solid var(--line)',
                        background: active ? 'var(--brass-dim)' : 'var(--paper)',
                        color: active ? 'var(--brass)' : 'var(--ink)',
                        fontSize: '11px'
                      }}
                      onClick={() => toggleSlot(sm)}
                    >
                      {label}
                    </button>
                  );
                })}
                <button type="button" className="bg-btn" onClick={handleAll}>ALL (S)</button>
                <button type="button" className="bg-btn" onClick={handleInvert}>INVERT</button>
                <button type="button" className="bg-btn" onClick={handleClearShading}>CLEAR</button>
              </div>
            </div>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label={`SET NOTATION — ${word} REGION`}
          stats={stampStats}
          answers={expr && expr !== 'Null' ? [expr] : []}
          copyValue={expr}
          placeholder={`Null — nothing ${word.toLowerCase()}`}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="VENN DIAGRAM WORKSPACE — Interactive circles & shaded regions"
        >
          <DiagramWorking
            layoutKey={layoutKey}
            letters={currentLetters}
            selectedSlots={currentSel}
            onToggleSlot={toggleSlot}
            shots={shots}
          />
        </WorkingPanel>
      }
    />
  );
}

export const diagramModule = {
  id: 'diagram',
  tabId: 'tabDiagram',
  tabLabel: '🔵 DIAGRAM',
  eyebrow: 'VENN DIAGRAM SOLVER',
  title: 'Diagram Vision',
  sub: 'Solve 2-circle or 3-circle Venn diagrams. Toggle shaded regions by clicking on the diagram or region buttons — computes the exact <b>Boolean logic expression</b> and copies it to your clipboard!',
  Component: DiagramModule
};
