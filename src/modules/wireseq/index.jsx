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
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { WireseqWorking } from './working.jsx';

export function WireseqModule({ isActive = true }) {
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  const uid = useId(); // per-instance ids: missions can show the same module several times

  // All 5 stages are kept; counts are recomputed from earlier stages every render,
  // so correcting an earlier stage re-flows the later answers (matches the original).
  const [stages, setStages] = useState(() => Array.from({ length: WS_STAGES }, wsBlankStage));
  const [thumbs, setThumbs] = useState(() => Array(WS_STAGES).fill(null));
  const [previews, setPreviews] = useState(() => Array(WS_STAGES).fill(null));
  const [active, setActive] = useState(0); // 0-based stage index
  const [quickText, setQuickText] = useState('');
  const [status, setStatus] = useState({ text: '', ok: null });
  // The manual is the same for every copy of this module, so all windows share it
  const [rulesText, setRulesText] = useSharedSetting('bombvision_wireseq_rules_v3', WS_DEFAULT_MANUAL);
  const rules = React.useMemo(() => wsParseManual(rulesText), [rulesText]);

  const perStage = wsSolveAll(stages, rules);
  const results = perStage[active];
  const panel = stages[active];
  const panelNo = active + 1;
  const counts = wsCountsBefore(stages, active);
  const filled = results.some(r => r.state !== 'empty');
  const cuts = results.filter(r => r.state === 'cut').map(r => r.i + 1);
  const copyFormatted = cuts.length ? cuts.map(n => `Wire ${n}`).join(' ') : (filled ? 'NONE' : '');

  React.useEffect(() => {
    const fresh = answerChanged(`${active}|${copyFormatted}`); // false when only isActive changed
    if (!isActive) return;
    setLastCopyString(copyFormatted);
    if (copyOnDecode && fresh && cuts.length > 0) {
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
    setPreviews(prev => prev.map((t, i) => (i === active ? null : t)));
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
    const pv = document.createElement('canvas'); const ps = Math.min(1, 360 / W);
    pv.width = Math.max(1, Math.round(W * ps)); pv.height = Math.max(1, Math.round(H * ps));
    pv.getContext('2d').drawImage(c2, 0, 0, pv.width, pv.height);
    const fromDots = res.stageNo >= 1 && res.stageNo <= WS_STAGES; // ignore a misread dot count
    const stageIdx = Math.max(0, Math.min(WS_STAGES - 1, fromDots ? res.stageNo - 1 : stageHint));
    return { stageIdx, fromDots, wires: res.wires, thumb: th.toDataURL('image/jpeg', 0.7), preview: pv.toDataURL('image/jpeg', 0.8) };
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
    setPreviews(prev => {
      const next = [...prev];
      traces.forEach(t => { next[t.stageIdx] = t.preview; });
      return next;
    });
    const last = traces[traces.length - 1];
    const nextIdx = Math.min(WS_STAGES - 1, last.stageIdx + 1);
    const found = last.wires.filter(w => w.c).length;
    const desc = last.wires.map((w, i) => `${i + 1} ${w.c ? w.c[0].toUpperCase() + w.c.slice(1) + '→' + w.d : '—'}`).join(', ');
    setStatus({
      text: traces.length > 1
        ? `Read ${traces.length} screenshots. Check each stage below.`
        : `Stage ${last.stageIdx + 1}: ${desc}`,
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
  };

  const handleRestoreDefaultRules = () => {
    setRulesText(WS_DEFAULT_MANUAL);
    showToast('RESTORED DEFAULT WIRE SEQUENCE RULES ✓');
  };

  const handleClear = () => {
    setStages(Array.from({ length: WS_STAGES }, wsBlankStage));
    setThumbs(Array(WS_STAGES).fill(null));
    setPreviews(Array(WS_STAGES).fill(null));
    setActive(0);
    setQuickText('');
    setStatus({ text: '', ok: null });
    setLastImage(null, null);
    setLastCopyString('');
    showToast('WIRE SEQUENCE RESET ✓');
  };

  // The group's card header shows this copy's answer
  const summary = filled ? `S${panelNo}: ${cuts.length ? 'CUT ' + cuts.join(' ') : 'NONE'}` : '';
  React.useEffect(() => { if (inst && inst.report) inst.report(summary); }, [summary]);

  const ruleCount = Object.keys(rules.red || {}).length + Object.keys(rules.blue || {}).length + Object.keys(rules.black || {}).length;
  const upto = wsCountsBefore(stages, active + 1); // occurrences up to and including this stage
  const preview = previews[active] || thumbs[active];

  // Same layout as the standalone wireseq.html: stage tabs, screenshot, CUT THESE, chips, counts
  return (
    <div className={`wsq ${inst && inst.multi ? 'compact' : ''}`}>
      <div className="wsq-head">
        <span className="wsq-badge">STAGE {panelNo} / {WS_STAGES}</span>
        <div className="wsq-tabs">
          {perStage.map((rs, i) => (
            <button key={i} type="button"
              className={`wsq-tab ${i === active ? 'on' : ''} ${stages[i].some(w => w.c && w.d) ? 'has' : ''}`}
              onClick={() => goTo(i)}>Stage {i + 1}</button>
          ))}
        </div>
      </div>

      <div className="wsq-body">
        <div className="wsq-left">
          <Dropzone
            onImage={handleImage}
            onFiles={handleFiles}
            multiple
            icon="📷"
            title={`Drop Stage ${panelNo} screenshot`}
            sub={<>click · <kbd>Ctrl</kbd>+<kbd>V</kbd> · drag &amp; drop — stage read from the dots</>}
          />
          {preview && (
            <div className="wsq-preview">
              <img src={preview} alt={`Stage ${panelNo}`} />
            </div>
          )}
          {status.text && <div className={`wsq-note ${status.ok === false ? 'bad' : ''}`}>{status.text}</div>}
          <div className="wsq-strip">
            {perStage.map((rs, i) => {
              const isFilled = rs.some(r => r.state !== 'empty');
              const cutsHere = rs.filter(r => r.state === 'cut').map(r => r.i + 1);
              return (
                <button key={i} type="button" className={`wsq-strip-card ${i === active ? 'on' : ''}`} onClick={() => goTo(i)}>
                  {thumbs[i] && <img src={thumbs[i]} alt="" />}
                  <span>Stage {i + 1}</span>
                  <span>{!isFilled ? '—' : cutsHere.length ? <>cut <b>{cutsHere.join(' ')}</b></> : 'none'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="wsq-right">
          <div className="wsq-stamp" role="button" tabIndex={0} title="Click to copy"
            onClick={() => { if (copyFormatted) { copy(copyFormatted); showToast(`COPIED: ${copyFormatted}`); } }}>
            <div className="wsq-stamp-lbl">CUT THESE</div>
            <div className="wsq-stamp-main">
              {!filled ? <span className="ph">— — —</span>
                : cuts.length ? cuts.map(n => <span key={n} className="wsq-cut">Wire {n}</span>)
                : <span className="ph">NONE TO CUT</span>}
            </div>
          </div>

          <div className="wsq-chips">
            {results.map(r => {
              if (r.state === 'empty') return <span key={r.i} className="wsq-chip">Wire {r.i + 1}: —</span>;
              const tag = `${r.w.c[0].toUpperCase() + r.w.c.slice(1)} → ${r.w.d} (#${r.n})`;
              if (r.state === 'cut') return <span key={r.i} className="wsq-chip cut">Cut {r.i + 1} ({tag})</span>;
              if (r.state === 'skip') return <span key={r.i} className="wsq-chip skip">Keep {r.i + 1} ({tag})</span>;
              return <span key={r.i} className="wsq-chip skip">No rule for {tag}</span>;
            })}
          </div>

          <div className="wsq-counts">
            {['red', 'blue', 'black'].map(c => (
              <span key={c} className="wsq-pill"><span className={`wsq-dot ${c}`}></span> {c[0].toUpperCase() + c.slice(1)}: {upto[c]}</span>
            ))}
          </div>

          <div className="wsq-tools">
            <button type="button" className="wsq-next" onClick={handleNextPanel}>Next Stage →</button>
            <button type="button" className="bg-btn" disabled={active === 0} onClick={handleUndo}>← Prev</button>
            <button type="button" className="bg-btn" onClick={handleClearStage}>Clear Stage</button>
            <button type="button" className="bg-btn" onClick={handleClear}>Reset</button>
          </div>

          <details className="wsq-fix">
            <summary>✎ Fix wires by hand</summary>
            <div style={{ display: 'flex', gap: '8px', margin: '8px 0' }}>
              <input
                id={`${uid}-quick`}
                type="text"
                className="search-words-field"
                style={{ flex: 1, minWidth: 0 }}
                value={quickText}
                placeholder="1RA 2BB 3KC  (Enter · Shift+Enter = & next)"
                spellCheck="false"
                autoComplete="off"
                onChange={(e) => setQuickText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); applyQuick(e.shiftKey); }
                }}
              />
              <button type="button" className="bg-btn" onClick={() => applyQuick(false)}>APPLY</button>
            </div>
            <WireseqWorking
              panel={panel}
              counts={counts}
              results={results}
              onWireColorChange={handleWireColorChange}
              onWireDestChange={handleWireDestChange}
            />
            <button type="button" className="bg-btn" style={{ marginTop: 8 }} onClick={handleSample}>⚡ SAMPLE</button>
          </details>
        </div>
      </div>

      {!grouped && (
        <details className="wsq-fix" style={{ marginTop: 12 }}>
          <summary>📖 Manual rules (red / blue / black) — {ruleCount} loaded</summary>
          <textarea
            className="search-words-field"
            style={{ height: '140px', resize: 'vertical', fontSize: '12px', lineHeight: 1.45, fontFamily: 'monospace', marginTop: 8 }}
            spellCheck={false}
            placeholder="Paste the Red / Blue / Black rules here..."
            value={rulesText}
            onChange={e => handleRulesChange(e.target.value)}
          />
          <button type="button" className="bg-btn" onClick={handleRestoreDefaultRules}>🔄 Restore default rules</button>
        </details>
      )}
    </div>
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
