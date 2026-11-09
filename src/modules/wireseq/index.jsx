import React, { useState } from 'react';
import { WS_DEFAULT_MANUAL, wsParseManual } from './wireseqRules.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { CopyLines } from '../../core/components/CopyLines.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { WireseqWorking } from './working.jsx';

export function WireseqModule({ isActive = true }) {
  const { copyOnDecode, setLastCopyString } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();

  const [panelNo, setPanelNo] = useState(1);
  const [history, setHistory] = useState([]);
  const [counts, setCounts] = useState({ red: 0, blue: 0, black: 0 });
  const [panel, setPanel] = useState([
    { c: null, d: null },
    { c: null, d: null },
    { c: null, d: null }
  ]);
  const [rulesText, setRulesText] = useState(() => {
    try {
      const sv = localStorage.getItem('bombvision_wireseq_rules_v3');
      return sv && sv.trim() ? sv : WS_DEFAULT_MANUAL;
    } catch (e) {
      return WS_DEFAULT_MANUAL;
    }
  });
  const [rules, setRules] = useState(() => wsParseManual(rulesText));

  // Solve current panel
  const solvePanel = () => {
    const local = { ...counts };
    return panel.map((w, i) => {
      if (!w.c || !w.d) return { i, state: 'empty' };
      local[w.c]++;
      const n = local[w.c];
      const rule = rules[w.c] && rules[w.c][n];
      if (!rule) return { i, w, n, state: 'norule' };
      return { i, w, n, state: rule.has(w.d) ? 'cut' : 'skip' };
    });
  };

  const results = solvePanel();
  const cuts = results.filter(r => r.state === 'cut').map(r => r.i + 1);
  const copyFormatted = cuts.length ? cuts.map(n => `Wire ${n}`).join(' ') : 'NONE';

  React.useEffect(() => {
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && cuts.length > 0) {
      copy(copyFormatted);
    }
  }, [copyFormatted, isActive]);

  const handleWireColorChange = (idx, c) => {
    const next = [...panel];
    next[idx] = { ...next[idx], c };
    setPanel(next);
  };

  const handleWireDestChange = (idx, d) => {
    const next = [...panel];
    next[idx] = { ...next[idx], d };
    setPanel(next);
  };

  const handleNextPanel = () => {
    setHistory(prev => [...prev, { counts: { ...counts }, panelNo, panel: [...panel] }]);
    const nextCounts = { ...counts };
    panel.forEach(w => {
      if (w.c && w.d) nextCounts[w.c]++;
    });
    setCounts(nextCounts);
    setPanel([
      { c: null, d: null },
      { c: null, d: null },
      { c: null, d: null }
    ]);
    setPanelNo(p => p + 1);
    showToast(`ADVANCED TO PANEL #${panelNo + 1} ✓`);
  };

  const handleUndo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setCounts(prev.counts);
    setPanelNo(prev.panelNo);
    setPanel(prev.panel);
    showToast('UNDO PREVIOUS PANEL ✓');
  };

  const handleSample = () => {
    setPanel([
      { c: 'red', d: 'C' },
      { c: 'blue', d: 'B' },
      { c: 'black', d: 'A' }
    ]);
    showToast('SAMPLE WIRE SEQUENCE LOADED ✓');
  };

  const handleRulesChange = (text) => {
    setRulesText(text);
    const parsed = wsParseManual(text);
    setRules(parsed);
    try {
      localStorage.setItem('bombvision_wireseq_rules_v3', text);
    } catch (e) {}
  };

  const handleRestoreDefaultRules = () => {
    setRulesText(WS_DEFAULT_MANUAL);
    setRules(wsParseManual(WS_DEFAULT_MANUAL));
    try {
      localStorage.setItem('bombvision_wireseq_rules_v3', WS_DEFAULT_MANUAL);
    } catch (e) {}
    showToast('RESTORED DEFAULT WIRE SEQUENCE RULES ✓');
  };

  const handleClear = () => {
    setCounts({ red: 0, blue: 0, black: 0 });
    setPanel([
      { c: null, d: null },
      { c: null, d: null },
      { c: null, d: null }
    ]);
    setHistory([]);
    setPanelNo(1);
    setLastCopyString('');
    showToast('WIRE SEQUENCE RESET ✓');
  };

  const copyItems = [];
  if (cuts.length > 0) {
    copyItems.push({ label: `COPY CUTS (${copyFormatted})`, value: copyFormatted });
    cuts.forEach(n => {
      copyItems.push({ label: `Wire ${n}`, value: `Wire ${n}` });
    });
  }

  const stampStats = `PANEL ${panelNo} | CUTS: ${cuts.length} | TOTAL WIRES SEEN: ${counts.red + counts.blue + counts.black}`;
  const ruleCount = (Object.keys(rules.red || {}).length) + (Object.keys(rules.blue || {}).length) + (Object.keys(rules.black || {}).length);

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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span className="search-config-label">CURRENT PANEL: #{panelNo}</span>
            <button
              type="button"
              className="bg-btn"
              style={{ borderColor: 'var(--brass)', color: 'var(--brass)', fontWeight: 700 }}
              onClick={handleNextPanel}
            >
              NEXT PANEL →
            </button>
            <button
              type="button"
              className="bg-btn"
              disabled={!history.length}
              onClick={handleUndo}
            >
              UNDO
            </button>
            <button type="button" className="bg-btn" onClick={handleClear}>
              RESET ROUND
            </button>
          </div>

          <details className="wireseq-manual-details" style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', letterSpacing: '0.08em', color: 'var(--ink-soft)', marginBottom: '8px' }}>
              📖 MANUAL RULES — PASTE &amp; PARSE (RED / BLUE / BLACK)
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <label className="search-config-label" style={{ margin: 0 }}>
                  PASTE WIRE OCCURRENCE RULES:
                </label>
                <span className="maze-status-tag" style={{ fontSize: '11px', padding: '3px 8px' }}>
                  {ruleCount} rules loaded
                </span>
              </div>
              <textarea
                className="search-words-field"
                style={{ height: '140px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace' }}
                spellCheck={false}
                placeholder="Paste the Red / Blue / Black rules here..."
                value={rulesText}
                onChange={e => handleRulesChange(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="bg-btn"
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                  onClick={handleRestoreDefaultRules}
                >
                  🔄 RESTORE DEFAULT RULES
                </button>
              </div>
            </div>
          </details>
        </ModuleInput>
      }
      answers={
        <AnswerPanel
          label={`PANEL #${panelNo} — WIRES TO CUT`}
          stats={stampStats}
          answers={cuts.length ? cuts.map(n => `Wire ${n}`) : []}
          copyValue={copyFormatted}
          placeholder="SELECT WIRE COLORS &amp; DESTINATIONS"
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title={`WIRE SEQUENCE STAGE — Panel ${panelNo} (Wire 1 to 3)`}
        >
          <WireseqWorking
            panel={panel}
            counts={counts}
            results={results}
            onWireColorChange={handleWireColorChange}
            onWireDestChange={handleWireDestChange}
          />
        </WorkingPanel>
      }
    />
  );
}

export const wireseqModule = {
  id: 'wireseq',
  tabId: 'tabWireSeq',
  tabLabel: '🔌 WIRE SEQ',
  eyebrow: 'WIRE SEQUENCES SOLVER',
  title: 'Wire Sequence Vision',
  sub: 'Enter wire color (Red / Blue / Black) and destination (A / B / C) across successive panels. Tracks cumulative occurrences and reveals <b>which wires to cut</b>!',
  Component: WireseqModule
};
