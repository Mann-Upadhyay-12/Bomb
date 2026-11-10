import React, { useState, useId } from 'react';
import {
  WS_DEFAULT_MANUAL,
  WS_STAGES,
  wsBlankStage,
  wsParseManual,
  wsSolveAll,
  wsCountsBefore,
  wsParseQuick,
  wsReadImage
} from './wireseqRules.js';
import { Dropzone } from '../../core/Dropzone.jsx';
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
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const uid = useId(); // per-instance ids: missions can show the same module several times

  // All 5 stages are kept; counts are recomputed from earlier stages every render,
  // so correcting an earlier stage re-flows the later answers (matches the original).
  const [stages, setStages] = useState(() => Array.from({ length: WS_STAGES }, wsBlankStage));
  const [thumbs, setThumbs] = useState(() => Array(WS_STAGES).fill(null));
  const [active, setActive] = useState(0); // 0-based stage index
  const [quickText, setQuickText] = useState('');
  const [status, setStatus] = useState({ text: '', ok: null });
  const [rulesText, setRulesText] = useState(() => {
    try {
      const sv = localStorage.getItem('bombvision_wireseq_rules_v3');
      return sv && sv.trim() ? sv : WS_DEFAULT_MANUAL;
    } catch (e) {
      return WS_DEFAULT_MANUAL;
    }
  });
  const [rules, setRules] = useState(() => wsParseManual(rulesText));

  const perStage = wsSolveAll(stages, rules);
  const results = perStage[active];
  const panel = stages[active];
  const panelNo = active + 1;
  const counts = wsCountsBefore(stages, active);
  const filled = results.some(r => r.state !== 'empty');
  const cuts = results.filter(r => r.state === 'cut').map(r => r.i + 1);
  const copyFormatted = cuts.length ? cuts.map(n => `Wire ${n}`).join(' ') : (filled ? 'NONE' : '');

  React.useEffect(() => {
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && cuts.length > 0) {
      copy(copyFormatted);
    }
  }, [copyFormatted, active, isActive]);

  const setStage = (idx, nextPanel) => {
    setStages(prev => prev.map((st, i) => (i === idx ? nextPanel : st)));
  };

  const handleWireColorChange = (idx, c) => {
    setStage(active, panel.map((w, i) => (i === idx ? { ...w, c } : w)));
  };

  const handleWireDestChange = (idx, d) => {
    setStage(active, panel.map((w, i) => (i === idx ? { ...w, d } : w)));
  };

  const goTo = (idx) => setActive(Math.max(0, Math.min(WS_STAGES - 1, idx)));

  const handleNextPanel = () => {
    const nxt = active < WS_STAGES - 1 ? active + 1 : 0;
    goTo(nxt);
    showToast(`STAGE ${nxt + 1} / ${WS_STAGES} ✓`);
  };

  const handleUndo = () => goTo(active - 1);

  const handleClearStage = () => {
    setStage(active, wsBlankStage());
    setThumbs(prev => prev.map((t, i) => (i === active ? null : t)));
  };

  const applyQuick = (advance) => {
    const { panel: qp, count, clear } = wsParseQuick(quickText);
    if (clear) {
      handleClearStage();
      setStatus({ text: `✓ Cleared stage ${panelNo}.`, ok: true });
      return;
    }
    if (count > 0) {
      setStage(active, qp.map(p => p || { c: null, d: null }));
      setStatus({ text: `✓ Applied ${count} wire(s) to stage ${panelNo}.`, ok: true });
      setQuickText('');
      if (advance) goTo(active < WS_STAGES - 1 ? active + 1 : 0);
      return;
    }
    setStatus({ text: '⚠ Could not parse — try: 1RA 2RB 3BC', ok: false });
  };

  // Screenshot(s) → wires (+ stage number from the pager dots when visible)
  const traceImage = (img, stageHint) => {
    const sc = img.naturalWidth > 800 ? 800 / img.naturalWidth : 1;
    const W = Math.max(1, Math.round(img.naturalWidth * sc)), H = Math.max(1, Math.round(img.naturalHeight * sc));
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const g = c2.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const res = wsReadImage(g.getImageData(0, 0, W, H));
    const th = document.createElement('canvas'); th.width = 96; th.height = Math.max(1, Math.round(96 * H / W));
    th.getContext('2d').drawImage(c2, 0, 0, th.width, th.height);
    const stageIdx = res.stageNo ? res.stageNo - 1 : stageHint;
    return { stageIdx, fromDots: !!res.stageNo, wires: res.wires, thumb: th.toDataURL('image/jpeg', 0.7) };
  };

  const applyTraces = (traces) => {
    if (!traces.length) return;
    setStages(prev => {
      const next = prev.map(st => st.map(w => ({ ...w })));
      traces.forEach(t => { next[t.stageIdx] = t.wires.map(w => ({ c: w.c, d: w.d })); });
      return next;
    });
    setThumbs(prev => {
      const next = [...prev];
      traces.forEach(t => { next[t.stageIdx] = t.thumb; });
      return next;
    });
    const last = traces[traces.length - 1];
    const nextIdx = Math.min(WS_STAGES - 1, last.stageIdx + 1);
    const found = last.wires.filter(w => w.c).length;
    const desc = last.wires.map((w, i) => `${i + 1} ${w.c ? w.c[0].toUpperCase() + w.c.slice(1) + '→' + w.d : '—'}`).join(', ');
    setStatus({
      text: traces.length > 1
        ? `Read ${traces.length} screenshots. Check each stage below.`
        : `Stage ${last.stageIdx + 1}${last.fromDots ? ' (read from the dots)' : ''}: ${desc}. Tap a wire to fix any mistake.`,
      ok: found > 0
    });
    // show the stage that was just read; the answer for it is what the user needs now
    goTo(last.stageIdx);
    if (found > 0) showToast(`STAGE ${last.stageIdx + 1} READ ✓ — NEXT: STAGE ${nextIdx + 1}`);
  };

  // Stage to use when the pager dots can't be read: the current stage if it is still
  // empty, otherwise the next one (so consecutive pastes fill consecutive stages).
  const fallbackStage = () => {
    const isEmpty = (st) => st.every(w => !w.c && !w.d);
    if (isEmpty(stages[active])) return active;
    for (let i = active + 1; i < WS_STAGES; i++) if (isEmpty(stages[i])) return i;
    return Math.min(WS_STAGES - 1, active + 1);
  };

  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    try {
      applyTraces([traceImage(img, fallbackStage())]);
    } catch (e) {
      setStatus({ text: 'Tracing failed — enter the wires by hand.', ok: false });
    }
  };

  const handleFiles = async (files) => {
    const list = Array.from(files).filter(f => f && (!f.type || f.type.startsWith('image/')));
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
    const traces = [];
    let hint = fallbackStage();
    for (const f of list) {
      const url = URL.createObjectURL(f);
      try {
        const img = await new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = url;
        });
        const t = traceImage(img, hint);
        traces.push(t);
        hint = Math.min(WS_STAGES - 1, t.stageIdx + 1);
      } catch (e) {
        // skip unreadable file
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (traces.length) applyTraces(traces);
    else setStatus({ text: 'Could not open those images.', ok: false });
  };

  const handleSample = () => {
    setStage(active, [
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
    setStages(Array.from({ length: WS_STAGES }, wsBlankStage));
    setThumbs(Array(WS_STAGES).fill(null));
    setActive(0);
    setQuickText('');
    setStatus({ text: '', ok: null });
    setLastImage(null, null);
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

  const stampStats = `STAGE ${panelNo} / ${WS_STAGES} | CUTS: ${cuts.length} | WIRES BEFORE THIS STAGE: ${counts.red + counts.blue + counts.black}`;
  const ruleCount = (Object.keys(rules.red || {}).length) + (Object.keys(rules.blue || {}).length) + (Object.keys(rules.black || {}).length);

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              onFiles={handleFiles}
              multiple
              icon="🔌 1 2 3 → A B C"
              title="Click here, then paste a Wire Sequence screenshot"
              sub={<>paste / drop one stage screenshot (or several at once) — the stage is read from the pager dots</>}
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
          <div className="ws-stage-strip">
            {perStage.map((rs, i) => {
              const isFilled = rs.some(r => r.state !== 'empty');
              const cutsHere = rs.filter(r => r.state === 'cut').map(r => r.i + 1);
              return (
                <button
                  key={i}
                  type="button"
                  className={`ws-stage-card ${i === active ? 'active' : ''} ${isFilled ? 'done' : ''}`}
                  onClick={() => goTo(i)}
                >
                  {thumbs[i] && <img src={thumbs[i]} alt="" />}
                  <span className="ws-stage-card-title">STAGE {i + 1}</span>
                  <span className="ws-stage-card-sub">
                    {!isFilled ? '—' : cutsHere.length ? <>cut <b>{cutsHere.join(' ')}</b></> : 'no cuts'}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
            <span className="search-config-label" style={{ margin: 0 }}>STAGE {panelNo} / {WS_STAGES}</span>
            <button type="button" className="bg-btn" disabled={active === 0} onClick={handleUndo}>
              ← PREV
            </button>
            <button
              type="button"
              className="bg-btn"
              style={{ borderColor: 'var(--brass)', color: 'var(--brass)', fontWeight: 700 }}
              onClick={handleNextPanel}
            >
              NEXT STAGE →
            </button>
            <button type="button" className="bg-btn" onClick={handleClearStage}>
              CLEAR STAGE
            </button>
            <button type="button" className="bg-btn" onClick={handleClear}>
              RESET ALL
            </button>
          </div>

          <div className="search-config-row" style={{ marginBottom: '10px' }}>
            <label className="search-config-label" htmlFor={`${uid}-quick`}>
              QUICK INPUT (e.g. <code>1RA 2RB 3BC</code> · Enter = apply, Shift+Enter = apply &amp; next):
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id={`${uid}-quick`}
                type="text"
                className="search-words-field"
                style={{ flex: 1, minWidth: 0 }}
                value={quickText}
                placeholder="1RA 2BB 3KC  (R=red, B/U=blue, K=black)"
                spellCheck="false"
                autoComplete="off"
                onChange={(e) => setQuickText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); applyQuick(e.shiftKey); }
                }}
              />
              <button type="button" className="bg-btn" onClick={() => applyQuick(false)}>APPLY</button>
            </div>
          </div>

          {status.text && (
            <div className={`module-hint ${status.ok === false ? 'bad' : 'ok'}`}>{status.text}</div>
          )}

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
          label={`STAGE ${panelNo} — WIRES TO CUT`}
          stats={stampStats}
          answers={cuts.length ? cuts.map(n => `Wire ${n}`) : []}
          copyValue={copyFormatted}
          placeholder={filled ? 'NONE TO CUT' : 'SELECT WIRE COLORS & DESTINATIONS'}
        />
      }
      copylines={<CopyLines items={copyItems} />}
      working={
        <WorkingPanel
          title={`WIRE SEQUENCE — Stage ${panelNo} (wires 1 to 3)`}
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
  sub: 'Paste a screenshot of each stage, type a quick code (<code>1RA 2RB 3BC</code>) or pick colours and destinations. Tracks cumulative occurrences across all 5 stages and reveals <b>which wires to cut</b>!',
  Component: WireseqModule
};
