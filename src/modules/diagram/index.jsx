import React, { useState } from 'react';
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

  const handleSample = () => {
    setMode(3);
    setSelState(prev => ({
      ...prev,
      c3: new Set([3, 7])
    }));
    showToast('SAMPLE VENN DIAGRAM SHADED ✓');
  };

  const handleClear = () => {
    setSelState({
      ...selState,
      [layoutKey]: new Set()
    });
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
              onImage={(img, dataUri, fileBlob) => {
                setShots(prev => [...prev, { url: dataUri }]);
                try {
                  const sc = Math.min(1, 480 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
                  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * sc));
                  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * sc));
                  const c = document.createElement('canvas'); c.width = w; c.height = h;
                  const ctx = c.getContext('2d', { willReadFrequently: true });
                  ctx.fillStyle = '#1f2228'; ctx.fillRect(0, 0, w, h);
                  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
                  const imgData = ctx.getImageData(0, 0, w, h);
                  const res = VennCore.analyze(imgData);

                  if (res && res.ok) {
                    const lk = res.layout;
                    if (lk === 'c3') setMode(3);
                    else {
                      setMode(2);
                      setOrient2(lk === 'c2h' ? 'h' : 'v');
                    }
                    if (res.letters && res.letters.slotLetters) {
                      setLettersState(prev => ({
                        ...prev,
                        [lk]: Object.assign({}, res.letters.slotLetters)
                      }));
                    }
                    if (res.shade && res.shade.masks) {
                      setSelState(prev => ({
                        ...prev,
                        [lk]: new Set(res.shade.masks)
                      }));
                    }
                    showToast('DIAGRAM ANALYZED ✓');
                  } else {
                    showToast(res && res.reason ? res.reason : 'DIAGRAM IMAGE ADDED ✓');
                  }
                } catch (err) {
                  showToast('DIAGRAM IMAGE ADDED ✓');
                }
              }}
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
                <button type="button" className="bg-btn" onClick={handleClear}>CLEAR</button>
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
