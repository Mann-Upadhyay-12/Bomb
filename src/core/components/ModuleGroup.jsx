import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InstanceContext } from '../InstanceContext.jsx';
import { useSharedSetting } from '../sharedSetting.js';
import { useToast } from '../ToastContext.jsx';
import { useAppState } from '../AppStateContext.jsx';
import { PASSWORD_WORDS_KEY, PASSWORD_DEFAULT_WORDS } from '../../modules/password/index.jsx';
import { WS_DEFAULT_MANUAL } from '../../modules/wireseq/wireseqRules.js';
import { SIMON_DEFAULT_RULES } from '../../modules/simons/simonsSolver.js';
import { PN_KEY } from '../../modules/piano/index.jsx';
import { PN_DEFAULT_CODES } from '../../modules/piano/pianoSolver.js';
import { KEY as WOF_KEY } from '../../modules/wof/index.jsx';
import { DEFAULT_RULES as WOF_DEFAULT_RULES } from '../../modules/wof/wofSolver.js';

// The one manual every copy of a "same manual" module uses (null = the module has none).
// `looks` recognises that manual's text when it's pasted anywhere on the page.
const MANUALS = {
  password: {
    key: PASSWORD_WORDS_KEY, fallback: PASSWORD_DEFAULT_WORDS, label: 'POSSIBLE PASSWORDS LIST', rows: 4,
    looks: t => (t.toUpperCase().match(/\b[A-Z]{5}\b/g) || []).length >= 8
  },
  wireseq: {
    key: 'bombvision_wireseq_rules_v3', fallback: WS_DEFAULT_MANUAL, label: 'WIRE OCCURRENCE RULES (RED / BLUE / BLACK)', rows: 8,
    looks: t => /occurrence/i.test(t) && /\b(red|blue|black)\b/i.test(t)
  },
  simons: {
    key: 'bombvision_simon_rules', fallback: SIMON_DEFAULT_RULES, label: 'SIMON SAYS RULES (EVEN / ODD)', rows: 7,
    looks: t => /flashes/i.test(t) && /press/i.test(t)
  },
  piano: {
    key: PN_KEY, fallback: PN_DEFAULT_CODES, label: 'INTERVAL → CODE TABLE', rows: 3,
    looks: t => /(minor|major|perfect)\s+\d/i.test(t) && /\d\.\d/.test(t)
  },
  wof: {
    key: WOF_KEY, fallback: WOF_DEFAULT_RULES, label: "WHO'S ON FIRST RULES (STEP 1 & STEP 2)", rows: 8,
    looks: t => /step\s*1/i.test(t) && /step\s*2/i.test(t)
  },
  button: {
    key: 'bombvision_button_checklist', fallback: '', label: 'HELPER CHECKLIST (+ SERIAL / MODULE COUNTS)', rows: 8,
    looks: t => /label says/i.test(t) || (/\bbutton\b/i.test(t) && /\d+\s*s\b/i.test(t))
  },
  morse: null
};

const isTextField = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'file' && el.type !== 'checkbox'));

// The manual is pasted, not typed: paste its text anywhere on the page and it's used straight away.
// So it's just a one-line status here; the text box is only for checking / debugging.
function SharedManual({ cfg, count, visible }) {
  const [text, setText] = useSharedSetting(cfg.key, cfg.fallback);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const isDefault = text.trim() === String(cfg.fallback || '').trim();
  const status = !text.trim() ? 'NOT LOADED' : isDefault ? 'DEFAULT' : 'LOADED ✓';

  // Pasting the manual anywhere on the page (outside a text box) loads it straight away
  useEffect(() => {
    if (!visible) return undefined;
    const onPaste = (e) => {
      if (isTextField(document.activeElement)) return;
      const cd = e.clipboardData;
      if (!cd || Array.from(cd.items || []).some(it => it.kind === 'file')) return;
      const t = cd.getData('text');
      if (t && cfg.looks(t)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setText(t.trim());
        showToast(`MANUAL LOADED FOR ${count > 1 ? `ALL ${count}` : 'THIS MODULE'} ✓`);
      }
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [visible, cfg, count]);

  return (
    <div className={`mgroup-manual-bar ${open ? 'open' : ''}`}>
      <div className="mgroup-manual-line">
        <span className="mgroup-manual-name">📖 MANUAL</span>
        <span className={`mgroup-manual-status ${status === 'NOT LOADED' ? 'off' : 'on'}`}>{status}</span>
        <span className="mgroup-manual-tip">paste the manual text anywhere (Ctrl+V) to load it</span>
        <button type="button" className="mgroup-manual-debug" onClick={() => setOpen(o => !o)}>{open ? 'hide' : 'debug'}</button>
      </div>
      {open && (
        <div className="mgroup-manual">
          <div className="mgroup-manual-sub">{cfg.label}</div>
          <textarea
            className="search-words-field"
            rows={cfg.rows}
            spellCheck={false}
            value={text}
            placeholder="Paste the manual here — it's used straight away, no button needed."
            onChange={e => setText(e.target.value)}
          />
          <div className="mgroup-manual-foot">
            <span>Applied as you paste or type.</span>
            {cfg.fallback && <button type="button" className="bg-btn" onClick={() => setText(cfg.fallback)}>🔄 Restore default</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Several copies of a module that share one manual (Password ×4 …), shown together:
 * the manual once at the top, then a card per copy, all visible. Drop a screenshot on a card,
 * or click a card and press Ctrl+V — it goes to that copy. Each copy keeps its own state.
 * `onCountChange` (optional) shows a 1–9 "modules to solve" bar.
 */
export function ModuleGroup({ id, label, count, isActive, renderInstance, onCountChange = null }) {
  const [selected, setSelected] = useState(0);
  const [answers, setAnswers] = useState({});
  const [injects, setInjects] = useState({});
  const [dragOver, setDragOver] = useState(-1);
  const cfg = MANUALS[id];
  const rootRef = useRef(null);
  const sel = Math.min(selected, count - 1);

  const ctxs = useMemo(() => Array.from({ length: count }, (_, i) => ({
    grouped: true,
    multi: count > 1,
    index: i,
    selected: i === sel,
    inject: injects[i] || null,
    count,
    // a strip with n modules in one screenshot (Diagram): add cards up to n when the count can change;
    // returns how many cards there will be
    grow: (n) => {
      if (onCountChange && n > count) { onCountChange(Math.min(9, n)); return Math.min(9, n); }
      return count;
    },
    report: (a) => setAnswers(prev => (prev[i] === a ? prev : { ...prev, [i]: a }))
  })), [count, injects, sel, onCountChange]);

  const dropOn = (i, e) => {
    e.preventDefault();
    setDragOver(-1);
    setSelected(i);
    const file = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find(f => !f.type || f.type.startsWith('image/'));
    if (file) setInjects(prev => ({ ...prev, [i]: { file, nonce: Date.now() } }));
  };

  const { copyOnDecode, setCopyOnDecode } = useAppState();
  const solved = Array.from({ length: count }, (_, i) => answers[i]).filter(Boolean).length;

  return (
    <div className={`mgroup mgroup-${id} ${count > 1 ? 'multi' : ''}`} ref={rootRef}>
      {onCountChange && (
        <div className="mgroup-count">
          <span className="search-config-label">MODULES TO SOLVE:</span>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button key={n} type="button" className={`mgroup-count-btn ${n === count ? 'on' : ''}`} onClick={() => onCountChange(n)}>{n}</button>
          ))}
          <select className="mgroup-count-select" aria-label="Modules to solve" value={count} onChange={e => onCountChange(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {cfg && <SharedManual cfg={cfg} count={count} visible={isActive} />}

      {count > 1 && (
        <div className="mgroup-head">
          <span className="search-config-label">{label} — {count} MODULES · {solved} ANSWERED</span>
          <span className="mgroup-hint">{cfg ? '① paste the manual  ② click a card, paste the defuser\'s screenshot' : 'click a card, then Ctrl+V (or drop a screenshot on it)'}</span>
          <button type="button" className={`copy-btn ${copyOnDecode ? 'on' : ''}`} aria-pressed={copyOnDecode}
            onClick={() => setCopyOnDecode(!copyOnDecode)}>
            <span className="swatch"></span> COPY ON DECODE
          </button>
        </div>
      )}

      <div className={count > 1 ? `mgroup-cards cols-${count === 2 || count === 4 ? 2 : 3}` : 'mgroup-single'}>
      {Array.from({ length: count }, (_, i) => (
        <section
          key={i}
          className={`mgroup-card ${count > 1 && i === sel ? 'selected' : ''} ${dragOver === i ? 'drag' : ''}`}
          onMouseDownCapture={() => setSelected(i)}
          onFocusCapture={() => setSelected(i)}
          onDragOver={e => { e.preventDefault(); if (dragOver !== i) setDragOver(i); if (sel !== i) setSelected(i); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(d => (d === i ? -1 : d)); }}
          onDrop={e => dropOn(i, e)}
        >
          {count > 1 && (
            <div className="mgroup-card-head">
              <span className="mgroup-card-n">{label} #{i + 1}</span>
              {i === sel && <span className="mgroup-card-tag">PASTE TARGET</span>}
              <span className={`mgroup-card-ans ${answers[i] ? 'done' : ''}`}>{answers[i] || '—'}</span>
            </div>
          )}
          <InstanceContext.Provider value={ctxs[i]}>
            {renderInstance(i, isActive && i === sel)}
          </InstanceContext.Provider>
        </section>
      ))}
      </div>
    </div>
  );
}
