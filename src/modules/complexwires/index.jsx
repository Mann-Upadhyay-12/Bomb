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

export function ComplexWiresModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [rules, setRules] = useState(() => ({ ...CW_PRESETS.preset1 }));
  const [edge, setEdge] = useState({ even: false, needy: false, gte5: true });
  const [wires, setWires] = useState(() =>
    Array.from({ length: 6 }, () => ({ active: true, color: 'white', star: false, led: false }))
  );

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
  };

  const handleSample = () => {
    setWires([
      { active: true, color: 'red', star: true, led: false },
      { active: true, color: 'blue', star: false, led: true },
      { active: true, color: 'white', star: true, led: true },
      { active: true, color: 'redblue', star: false, led: false },
      { active: true, color: 'white', star: false, led: false },
      { active: false, color: 'white', star: false, led: false }
    ]);
    setEdge({ even: true, needy: false, gte5: true });
    showToast('SAMPLE COMPLEX WIRES LOADED ✓');
  };

  const handleClear = () => {
    setWires(Array.from({ length: 6 }, () => ({ active: true, color: 'white', star: false, led: false })));
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
              Parallel Port / Needy: {edge.needy ? 'YES' : 'NO'}
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
          placeholder="NONE TO CUT"
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
  sub: 'Select color, star, and LED for up to 6 wires. Follows the <b>Venn diagram cut rules</b> (C, D, S, P, B) according to serial digit, parallel port, and module count, and copies cuts to clipboard!',
  Component: ComplexWiresModule
};
