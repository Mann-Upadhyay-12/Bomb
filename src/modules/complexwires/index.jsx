import React, { useState } from 'react';
import {
  CW_PRESETS,
  cwKey,
  cwRuleFor
} from './complexwiresConstants.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { ComplexWiresWorking } from './working.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
import { cwReadDiagramImage, cwReadWiresImage } from './complexwiresVision.js';

const CW_PRESET_NAMES = { preset1: 'Preset 1', preset2: 'Preset 2', preset3: 'Preset 3', preset4: 'Preset 4' };
const blankWires = () => Array.from({ length: 6 }, () => ({ active: true, color: 'white', star: false, led: false }));

export function ComplexWiresModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [rules, setRules] = useState(() => ({ ...CW_PRESETS.preset1 }));
  const [edge, setEdge] = useState({ even: false, needy: false, gte5: true });
  const [wires, setWires] = useState(blankWires);
  const [unsure, setUnsure] = useState(() => new Set());
  const [serial, setSerial] = useState('');
  const [readStatus, setReadStatus] = useState({ text: '', ok: null });
  const [thumbs, setThumbs] = useState({ diagram: '', wires: '' });

  const presetName = Object.keys(CW_PRESETS).find(k => Object.keys(CW_PRESETS[k]).every(id => CW_PRESETS[k][id] === rules[id])) || 'custom';

  const handlePreset = (k) => {
    if (!CW_PRESETS[k]) return;
    setRules({ ...CW_PRESETS[k] });
    setUnsure(new Set());
    setReadStatus({ text: `Loaded ${CW_PRESET_NAMES[k]}.`, ok: true });
  };

  // Typing the serial number sets EVEN/ODD from its last digit
  const handleSerial = (val) => {
    setSerial(val);
    const digits = val.match(/\d/g);
    if (digits) setEdge(prev => ({ ...prev, even: Number(digits[digits.length - 1]) % 2 === 0 }));
  };

  // Wide image = Venn rule diagram, tall/square = wires panel (same heuristic as the original)
  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    const isDiagram = img.naturalWidth / img.naturalHeight > 1.05;
    try {
      if (isDiagram) {
        setThumbs(prev => ({ ...prev, diagram: dataUri }));
        const res = cwReadDiagramImage(img);
        if (res.error) { setReadStatus({ text: res.error, ok: false }); return; }
        setRules(res.rules);
        setUnsure(res.unsure);
        setReadStatus({
          text: res.unsure.size
            ? `Diagram read (${res.count} letters), but ${res.unsure.size} look unsure — check the highlighted boxes.`
            : `Diagram read: ${res.count} letters, all matched clearly.`,
          ok: res.unsure.size === 0
        });
        showToast('RULE DIAGRAM READ ✓');
      } else {
        setThumbs(prev => ({ ...prev, wires: dataUri }));
        const found = cwReadWiresImage(img);
        if (found.length) setWires(blankWires().map((w, i) => (found[i] ? found[i] : { ...w, active: false })));
        setReadStatus({
          text: found.length === 6 ? 'Wires read: 6 wires found. Check them below.'
            : found.length ? `Found ${found.length} wire(s), expected 6. Extra slots are switched off — fix by hand if needed.`
            : 'No wires found — set them by hand below.',
          ok: found.length > 0
        });
        if (found.length) showToast('WIRES READ ✓');
      }
    } catch (e) {
      setReadStatus({ text: 'Could not read that image.', ok: false });
    }
  };

  const results = wires.map((w, i) => {
    if (!w.active) return { cut: false, why: 'Inactive' };
    const key = cwKey(w);
    const letter = rules[key] || 'D';
    return cwRuleFor(letter, edge);
  });

  const cuts = [];
  wires.forEach((w, i) => {
    if (w.active && results[i].cut) cuts.push(i + 1);
  });

  const copyFormatted = cuts.length ? cuts.map(n => `Wire ${n}`).join(' ') : 'NONE';

  React.useEffect(() => {
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && cuts.length > 0) {
      copy(copyFormatted);
    }
  }, [copyFormatted, isActive]);

  const handleWireToggle = (i, val) => {
    const next = [...wires];
    next[i] = { ...next[i], active: val };
    setWires(next);
  };

  const handleWireColor = (i, color) => {
    const next = [...wires];
    next[i] = { ...next[i], color };
    setWires(next);
  };

  const handleWireStar = (i, val) => {
    const next = [...wires];
    next[i] = { ...next[i], star: val };
    setWires(next);
  };

  const handleWireLed = (i, val) => {
    const next = [...wires];
    next[i] = { ...next[i], led: val };
    setWires(next);
  };

  const handleRuleChange = (regId, letter) => {
    setRules(prev => ({ ...prev, [regId]: letter }));
    setUnsure(prev => { const n = new Set(prev); n.delete(regId); return n; });
  };

  const handleSample = () => {
    setWires([
      { active: true, color: 'red', star: true, led: false },
      { active: true, color: 'blue', star: false, led: true },
      { active: true, color: 'white', star: true, led: true },
      { active: true, color: 'striped', star: false, led: false },
      { active: true, color: 'white', star: false, led: false },
      { active: false, color: 'white', star: false, led: false }
    ]);
    setEdge({ even: true, needy: false, gte5: true });
    showToast('SAMPLE COMPLEX WIRES LOADED ✓');
  };

  const handleClear = () => {
    setWires(blankWires());
    setThumbs({ diagram: '', wires: '' });
    setReadStatus({ text: '', ok: null });
    setLastCopyString('');
    showToast('WIRES RESET ✓');
  };

  const copyItems = [];
  if (cuts.length > 0) {
    copyItems.push({ label: `COPY CUTS (${copyFormatted})`, value: copyFormatted });
    cuts.forEach(n => {
      copyItems.push({ label: `Wire ${n}`, value: `Wire ${n}` });
    });
  }

  const stampStats = `CUTS: ${cuts.length} of ${wires.filter(w => w.active).length} active wires`;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="⚡ ★ 💡 C D S P B"
              title="Click here, then paste the wires panel or the rule diagram"
              sub={<>wide image → read as the <b>Venn rule diagram</b>, tall/square → read as the <b>wires panel</b></>}
            />
          }
          preview={
            (thumbs.diagram || thumbs.wires) ? (
              <div className="preview-row show">
                {thumbs.wires && <img src={thumbs.wires} alt="wires panel" title="Wires panel" />}
                {thumbs.diagram && <img src={thumbs.diagram} alt="rule diagram" title="Rule diagram" />}
                <span>{[thumbs.wires && 'wires panel', thumbs.diagram && 'rule diagram'].filter(Boolean).join(' + ')} loaded</span>
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
          {readStatus.text && (
            <div className={`module-hint ${readStatus.ok === false ? 'bad' : 'ok'}`}>{readStatus.text}</div>
          )}

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
            <span className="search-config-label" style={{ margin: 0 }}>RULE PRESET:</span>
            <select
              className="bg-hex"
              style={{ width: 'auto', padding: '4px 8px' }}
              value={presetName}
              onChange={(e) => handlePreset(e.target.value)}
            >
              {Object.keys(CW_PRESETS).map(k => <option key={k} value={k}>{CW_PRESET_NAMES[k]}</option>)}
              <option value="custom" disabled>Custom / read from screenshot</option>
            </select>
            <span className="search-config-label" style={{ margin: 0 }}>SERIAL:</span>
            <input
              type="text"
              className="bg-hex"
              style={{ width: '120px' }}
              value={serial}
              placeholder="e.g. AB3C4"
              spellCheck="false"
              onChange={(e) => handleSerial(e.target.value)}
            />
          </div>

          {/* Bomb edge work toggles */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span className="search-config-label">EDGE CONDITIONS:</span>
            <button
              type="button"
              className={`bg-btn ${edge.even ? 'active' : ''}`}
              style={{ borderColor: edge.even ? 'var(--brass)' : '' }}
              onClick={() => setEdge({ ...edge, even: !edge.even })}
            >
              Serial Digit: {edge.even ? 'EVEN' : 'ODD'}
            </button>
            <button
              type="button"
              className={`bg-btn ${edge.needy ? 'active' : ''}`}
              style={{ borderColor: edge.needy ? 'var(--brass)' : '' }}
              onClick={() => setEdge({ ...edge, needy: !edge.needy })}
            >
              Needy Module: {edge.needy ? 'YES' : 'NO'}
            </button>
            <button
              type="button"
              className={`bg-btn ${edge.gte5 ? 'active' : ''}`}
              style={{ borderColor: edge.gte5 ? 'var(--brass)' : '' }}
              onClick={() => setEdge({ ...edge, gte5: !edge.gte5 })}
            >
              Modules ≥5: {edge.gte5 ? 'YES' : 'NO'}
            </button>
          </div>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label="COMPLEX WIRES TO CUT"
          stats={stampStats}
          answers={cuts.length ? cuts.map(n => `Wire ${n}`) : []}
          copyValue={copyFormatted}
          placeholder="NOTHING TO CUT"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title="COMPLEX WIRES SETTINGS — Configure wire colors, stars, LEDs, and Venn rules"
        >
          <ComplexWiresWorking
            wires={wires}
            rules={rules}
            unsure={unsure}
            edge={edge}
            results={results}
            onWireToggle={handleWireToggle}
            onWireColor={handleWireColor}
            onWireStar={handleWireStar}
            onWireLed={handleWireLed}
            onRuleChange={handleRuleChange}
          />
        </WorkingPanel>
      }
    />
  );
}

export const complexwiresModule = {
  id: 'complexwires',
  tabId: 'tabComplexWires',
  tabLabel: '⚡ COMPLEX WIRES',
  eyebrow: 'COMPLEX WIRES SOLVER',
  title: 'Complex Wires Vision',
  sub: 'Select colour, star and LED for up to 6 wires. Follows the <b>Venn diagram cut rules</b> (C, D, S, P, B) according to the serial digit, needy modules and module count. Paste the wires panel or the rule diagram to read them automatically!',
  Component: ComplexWiresModule
};
