import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InstanceContext } from '../InstanceContext.jsx';
import { useSharedSetting } from '../sharedSetting.js';
import { useRoomFrom } from '../room/roomSync.js';
import { nameOf, myId } from '../room/roomClient.js';
import { useToast } from '../ToastContext.jsx';
import { useAppState } from '../AppStateContext.jsx';
import { PASSWORD_WORDS_KEY, PASSWORD_DEFAULT_WORDS } from '../../modules/password/index.jsx';
import { WS_DEFAULT_MANUAL } from '../../modules/wireseq/wireseqRules.js';
import { PN_KEY } from '../../modules/piano/index.jsx';
import { PN_DEFAULT_CODES, pnParseCodes } from '../../modules/piano/pianoSolver.js';
import { KEY as WOF_KEY } from '../../modules/wof/index.jsx';
import { DEFAULT_RULES as WOF_DEFAULT_RULES, looksLikeWofManual, mergeWofManual } from '../../modules/wof/wofSolver.js';
import { CIRCUIT_MANUAL_KEY } from '../../modules/circuit/index.jsx';
import { MazeManualBar } from '../../modules/maze/manualBar.jsx';
import { ASTRO_STARS_KEY } from '../../modules/astrology/index.jsx';
import { looksLikeStarList } from '../../modules/astrology/astrologySolver.js';
import { HANGMAN_WORDS_KEY } from '../../modules/hangman/index.jsx';
import { HANGMAN_DEFAULT_WORDS, looksLikeHangmanList } from '../../modules/hangman/hangmanSolver.js';
import { extractImageSource, warmImageHosts, dragHasLink } from '../../utils/image.js';
import { discordPlain } from '../../utils/discordText.js';
import { isTouchScreen, useTouchScreen } from '../../utils/touch.js';
import { ManualPasteBox } from '../Dropzone.jsx';
import { manualBoxPaste } from '../airPaste.js';
import { WIRES_MANUAL_KEY } from '../../modules/wires/index.jsx';
import { MEMORY_MANUAL_KEY } from '../../modules/memory/index.jsx';
import { ECHO_PAIRS_KEY } from '../../modules/echo/index.jsx';
import { parseEchoPairs } from '../../modules/echo/echoSolver.js';
import { parseWiresManual } from '../../modules/wires/wiresSolver.js';
import { parseMemoryManual } from '../../modules/memory/memorySolver.js';

// Modules whose manual is an image strip shared by every copy (pasted / dropped anywhere on the page)
const IMAGE_MANUALS = { maze: MazeManualBar };

// The one manual every copy of a "same manual" module uses (null = the module has none).
// `looks` recognises that manual's text when it's pasted anywhere on the page.
// `picture`: the manual comes as a picture (named here). Pasted / dropped anywhere it goes to the
// selected card, whose module tells it apart from a puzzle screenshot and reads it into this text.
const MANUALS = {
  password: {
    key: PASSWORD_WORDS_KEY, fallback: PASSWORD_DEFAULT_WORDS, label: 'POSSIBLE PASSWORDS LIST', rows: 4,
    looks: t => (t.toUpperCase().match(/\b[A-Z]{5}\b/g) || []).length >= 8
  },
  wireseq: {
    key: 'bombvision_wireseq_rules_v4', fallback: WS_DEFAULT_MANUAL, label: 'WIRE OCCURRENCE RULES (RED / BLUE / BLACK)', rows: 8,
    picture: 'Red / Blue / Black manual picture', pasteAs: 'Wire Sequences manual',
    looks: t => /occurrence/i.test(t) && /\b(red|blue|black)\b/i.test(t)
  },
  simons: null, // manual table picture changes every game: the Simon card reads it (shared in memory)
  piano: {
    key: PN_KEY, fallback: PN_DEFAULT_CODES, label: 'INTERVAL → CODE TABLE', rows: 3,
    looks: t => (/(minor|major|perfect)\s+\d/i.test(t) && /\d\.\d/.test(t)) || Object.keys(pnParseCodes(t)).length >= 3
  },
  wof: {
    key: WOF_KEY, fallback: WOF_DEFAULT_RULES, label: "WHO'S ON FIRST RULES (STEP 1 & STEP 2)", rows: 8,
    // both steps, or one at a time (two messages, headings or not): one step keeps the other
    looks: looksLikeWofManual, merge: mergeWofManual
  },
  button: {
    key: 'bombvision_button_checklist', fallback: '', label: 'HELPER CHECKLIST (+ SERIAL / MODULE COUNTS)', rows: 8,
    looks: t => /label says/i.test(t) || (/\bbutton\b/i.test(t) && /\d+\s*s\b/i.test(t))
  },
  circuit: {
    key: CIRCUIT_MANUAL_KEY, fallback: '', label: 'RESISTOR COLOUR → OHMS (this game)', rows: 9,
    picture: 'colour legend picture', pasteAs: 'Circuit colour legend',
    looks: t => (t.match(/\b(red|orange|yellow|green|blue|violet|purple|white|gr[ae]y)\s*[=:]\s*\d/gi) || []).length >= 3
  },
  hangman: {
    key: HANGMAN_WORDS_KEY, fallback: HANGMAN_DEFAULT_WORDS, label: 'HANGMAN WORD LIST', rows: 4,
    looks: looksLikeHangmanList
  },
  astrology: {
    key: ASTRO_STARS_KEY, fallback: '', label: 'CONSTELLATIONS BY NUMBER OF STARS (this game)', rows: 10,
    looks: looksLikeStarList
  },
  morse: null,
  // the field-guide modules: every copy on a bomb reads the same Helper text
  wires: {
    key: WIRES_MANUAL_KEY, fallback: '', label: 'WIRES MANUAL (THE 3, 4, 5 AND 6 WIRE LISTS)', rows: 10,
    looks: t => /\bcut\b/i.test(t) && (/\b[3-6]\s*wires?\b/i.test(t) || Object.values(parseWiresManual(t).sections).some(l => l.length))
  },
  memory: {
    key: MEMORY_MANUAL_KEY, fallback: '', label: 'MEMORY MANUAL (A RULE PER STAGE AND DISPLAY)', rows: 10,
    looks: t => (/\bstage\s*[1-5]\b/i.test(t) && /\bdisplay\b/i.test(t) && /\b(position|label(l)?ed)\b/i.test(t)) || parseMemoryManual(t).count >= 3
  },
  echo: {
    key: ECHO_PAIRS_KEY, fallback: '', label: 'ECHO WORD LIST (SHOWN WORD → WORD TO ENTER)', rows: 8,
    looks: t => !/^https?:\/\//i.test(t.trim()) && parseEchoPairs(t).pairs.length >= 3
  }
};

const isTextField = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'file' && el.type !== 'checkbox'));

// The manual is pasted, not typed: paste its text anywhere on the page and it's used straight away.
// So it's just a one-line status here, with the text box folded away. A phone can't paste "anywhere"
// (there's no Ctrl+V, and long-press only offers Paste in a text box), so there the box is the way in:
// it opens by itself while no manual is loaded, and its button says so.
function SharedManual({ cfg, count, visible }) {
  const [text, setText] = useSharedSetting(cfg.key, cfg.fallback);
  const roomFrom = useRoomFrom(`set:${cfg.key}`); // in a room: who pasted the manual in use
  const { showToast } = useToast();
  const phone = useTouchScreen();
  const [open, setOpen] = useState(() => isTouchScreen() && !cfg.picture && !String(text || '').trim());
  const isDefault = text.trim() === String(cfg.fallback || '').trim();
  // a manual read from its picture carries "# read from the … picture <time>" on its first line
  const m = /^# read from the [a-z ]+ picture (\S+)/m.exec(text);
  const readAt = m ? Date.parse(m[1]) : NaN;
  const mins = Number.isFinite(readAt) ? Math.round((Date.now() - readAt) / 60000) : null;
  const status = !text.trim() ? 'NOT LOADED'
    : mins != null ? `FROM PICTURE ✓ ${mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`}`
    : isDefault ? (cfg.picture ? 'OLD DEFAULT' : 'DEFAULT') : 'LOADED ✓';
  // a picture manual changes every game: the built-in one is a warning, not a pass
  const bad = status === 'NOT LOADED' || status === 'OLD DEFAULT';
  const textNow = useRef(text); // the manual a part-paste (cfg.merge) is added to
  textNow.current = text;

  // Pasting the manual anywhere on the page (outside a text box) loads it straight away
  useEffect(() => {
    if (!visible) return undefined;
    const onPaste = (e) => {
      if (isTextField(document.activeElement)) return;
      const cd = e.clipboardData;
      if (!cd || Array.from(cd.items || []).some(it => it.kind === 'file')) return;
      const t = discordPlain(cd.getData('text')); // copied on a phone, Discord's **markup** comes along
      if (t && cfg.looks(t)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setText(cfg.merge ? cfg.merge(textNow.current, t) : t.trim());
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
        <span className={`mgroup-manual-status ${bad ? 'off' : 'on'}`}>{status}</span>
        {roomFrom && !bad && <span className="mgroup-manual-from">👥 FROM {roomFrom.from === myId() ? 'YOU' : nameOf(roomFrom.from).toUpperCase()}</span>}
        <span className="mgroup-manual-tip">{cfg.picture
          ? phone
            ? <>paste this game's <b>{cfg.picture}</b> or its link in the 📖 box below{count > 1 ? ' — one paste loads it for every card' : ''}</>
            : <>paste or drop this game's <b>{cfg.picture}</b> anywhere (Ctrl+V){count > 1 ? ' — one paste loads it for every card' : ''}</>
          : phone ? <>tap <b>✏️ paste</b> and paste the manual text into the box</> : 'paste the manual text anywhere (Ctrl+V) to load it'}</span>
        <button type="button" className="mgroup-manual-debug" onClick={() => setOpen(o => !o)}>{open ? 'hide' : phone ? '✏️ paste' : 'edit'}</button>
      </div>
      {/* phones: the picture is pasted here (on a computer: anywhere on the page) */}
      {cfg.picture && <ManualPasteBox what={cfg.pasteAs} />}
      {open && (
        <div className="mgroup-manual">
          <div className="mgroup-manual-sub">{cfg.label}</div>
          <textarea
            className="search-words-field"
            rows={cfg.rows}
            spellCheck={false}
            value={text}
            placeholder={cfg.picture ? `Paste the ${cfg.picture} anywhere on the page — or type / paste its text here.` : "Paste the manual here — it's used straight away, no button needed."}
            onChange={e => setText(e.target.value)}
            onPaste={cfg.picture ? manualBoxPaste() : undefined}
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

  // a dropped file or image link (a Discord image dragged in) goes to card i
  const injectInto = (i, dt) => {
    const src = extractImageSource(dt);
    if (src) setInjects(prev => ({ ...prev, [i]: { src, nonce: Date.now() } }));
  };
  const dropOn = (i, e) => {
    e.preventDefault();
    // this card took it: the page-wide drop listeners (the card's own Dropzone when it is the only
    // card) must not load it a second time — one drop was read as two stages in Memory and Simon
    e.stopPropagation();
    setDragOver(-1);
    setSelected(i);
    injectInto(i, e.dataTransfer);
  };

  // A drop anywhere else on the page (header, manual bar, gaps between cards) goes to the selected
  // card, so a shared manual strip can be dropped anywhere. One card is shown alone: its own
  // Dropzone already takes drops anywhere.
  const latest = useRef({});
  latest.current = { sel, injectInto };
  useEffect(() => {
    if (!isActive || count < 2) return undefined;
    const visible = () => rootRef.current && rootRef.current.offsetParent !== null;
    const onOver = (e) => {
      if (!visible()) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    // cancelling dragenter too (as the single-copy Dropzone does) keeps the card under the pointer the drop target
    const onEnter = (e) => {
      if (!visible()) return;
      e.preventDefault();
      if (dragHasLink(e.dataTransfer)) warmImageHosts();
    };
    const onDrop = (e) => {
      if (!visible() || e.defaultPrevented) return; // a card already took it
      e.preventDefault();
      setDragOver(-1);
      latest.current.injectInto(latest.current.sel, e.dataTransfer);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [isActive, count]);

  const { copyOnDecode, setCopyOnDecode } = useAppState();
  const phone = useTouchScreen();
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
      {IMAGE_MANUALS[id] && React.createElement(IMAGE_MANUALS[id], { count })}

      {count > 1 && (
        <div className="mgroup-head">
          <span className="search-config-label">{label} — {count} MODULES · {solved} ANSWERED</span>
          <span className="mgroup-hint">{phone
            ? (cfg || IMAGE_MANUALS[id] ? '① paste the manual  ② in each card, long-press its box → Paste the defuser\'s screenshot' : 'in each card, long-press its box → Paste the screenshot (or tap the card to pick a saved picture)')
            : (cfg || IMAGE_MANUALS[id] ? '① paste the manual  ② click a card, paste the defuser\'s screenshot' : 'click a card, then Ctrl+V (or drop a screenshot on it)')}</span>
          <button type="button" className={`copy-btn ${copyOnDecode ? 'on' : ''}`} aria-pressed={copyOnDecode}
            onClick={() => setCopyOnDecode(!copyOnDecode)}>
            <span className="swatch"></span> COPY ON DECODE
          </button>
        </div>
      )}

      <div className={count > 1 ? 'mgroup-cards' : 'mgroup-single'}>
      {Array.from({ length: count }, (_, i) => (
        <section
          key={i}
          data-card={i}
          className={`mgroup-card ${count > 1 && i === sel ? 'selected' : ''} ${dragOver === i ? 'drag' : ''}`}
          onMouseDownCapture={() => setSelected(i)}
          onFocusCapture={() => setSelected(i)}
          onDragEnter={e => e.preventDefault()}
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
