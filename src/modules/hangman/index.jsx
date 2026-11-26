import React, { useState } from 'react';
import {
  HANGMAN_DEFAULT_WORDS, parseHangmanWords, looksLikeHangmanList, candidates, bestGuess, outcomes, revealed
} from './hangmanSolver.js';
import { readHangman } from './hangmanVision.js';
import { applyShot, shapeBook, learnShapes } from './hangmanShot.js';
import { imageToData } from '../../core/level/levelVision.js';
import { Dropzone } from '../../core/Dropzone.jsx';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { HangmanBoard, HangmanPlan } from './working.jsx';
import { useTouchScreen } from '../../utils/touch.js';

export const HANGMAN_WORDS_KEY = 'bombvision_hangman_words';
const SHAPES_KEY = 'bombvision_hangman_shapes'; // letter shapes learned from screenshots (JSON)

export function HangmanModule({ isActive = true }) {
  const touch = useTouchScreen();
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);
  const multi = Boolean(inst && inst.multi);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  // the word list is the same for every Hangman on the bomb
  const [wordText, setWordText] = useSharedSetting(HANGMAN_WORDS_KEY, HANGMAN_DEFAULT_WORDS);
  const words = React.useMemo(() => parseHangmanWords(wordText), [wordText]);
  const lengths = React.useMemo(() => [...new Set(words.map(w => w.length))].sort((a, b) => a - b), [words]);
  // number of blanks: from the screenshot, else picked, else the list's only length
  const [length, setLength] = useState(null);
  const len = length != null ? length : (lengths.length === 1 ? lengths[0] : null);
  const [prevShot, setPrevShot] = useState(null);   // { ink } of the last screenshot
  const [shotNote, setShotNote] = useState({ text: '', ok: null });
  const [unresolved, setUnresolved] = useState([]); // blanks whose letter the app couldn't tell
  const [shapesJson, setShapesJson] = useSharedSetting(SHAPES_KEY, '');
  const savedShapes = React.useMemo(() => { try { return shapesJson ? JSON.parse(shapesJson) : {}; } catch (e) { return {}; } }, [shapesJson]);

  const [guesses, setGuesses] = useState([]); // [{ letter, positions: [0-based] }]
  const [typed, setTyped] = useState('');      // a letter the defuser guessed instead of the suggested one

  const memo = React.useMemo(() => new Map(), [words]);
  const cands = React.useMemo(() => (len == null ? [] : candidates(words, guesses, len)), [words, guesses, len]);
  const next = React.useMemo(() => bestGuess(cands, memo), [cands, memo]);
  const used = new Set(guesses.map(g => g.letter));

  let answer = '', label = 'GUESS THIS LETTER', problem = '';
  if (len == null) problem = 'Paste the defuser’s screenshot (or pick the number of blanks).';
  else if (!lengths.includes(len)) problem = `This word has ${len} letters, but the word list has no ${len}-letter words — paste this bomb’s Hangman manual (${touch ? 'into the 📖 manual box' : 'Ctrl+V anywhere'}).`;
  else if (!cands.length) problem = 'No word in the list fits these guesses — undo the last one and check where the letter appeared, or check the word list.';
  else if (cands.length === 1) { answer = cands[0]; label = 'GUESS THE WORD'; }
  else if (next) answer = next.letter;
  else problem = `These words can’t be told apart by any letter: ${cands.join(', ')}.`;

  React.useEffect(() => {
    const fresh = answerChanged(answer);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  const lastToast = React.useRef('');
  React.useEffect(() => {
    if (cands.length === 1 && guesses.length && lastToast.current !== cands[0]) {
      lastToast.current = cands[0];
      showToast(`HANGMAN: GUESS THE WORD ${cands[0]} ✓`);
    }
  }, [cands, guesses.length]);

  // Ctrl+V of the manual anywhere on the page loads its word list (a group of Hangman cards has
  // the group's manual bar for that instead)
  React.useEffect(() => {
    if (!isActive || grouped) return undefined;
    const onPaste = (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))) return;
      const t = e.clipboardData && e.clipboardData.getData('text');
      if (t && looksLikeHangmanList(t)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setWordText(t.trim()); // guesses so far are facts about this word, so they stay
        showToast(`HANGMAN WORD LIST: ${parseHangmanWords(t).length} WORDS ✓`);
      }
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [isActive, grouped]);

  const record = (letter, positions) => {
    setGuesses(g => [...g, { letter, positions }]);
    setTyped('');
  };
  const undo = () => setGuesses(g => g.slice(0, -1));
  const handleClear = () => {
    setGuesses([]); setTyped(''); setLength(null);
    setPrevShot(null); setUnresolved([]); setShotNote({ text: '', ok: null });
    lastToast.current = '';
    setLastCopyString('');
    setLastImage(null, null);
  };

  // A screenshot after each guess: what changed tells where the guessed letter is (or that it missed)
  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    let shot;
    try {
      const d = imageToData(img);
      shot = readHangman(d.data, d.width, d.height);
    } catch (e) {
      setShotNote({ text: `Could not read that image (${e.message || e}).`, ok: false });
      return;
    }
    if (!shot.ok) { setShotNote({ text: `${shot.reason} — is this the Hangman screenshot?`, ok: false }); return; }
    const pending = typedLetter || (next && next.letter) || null;
    const r = applyShot({ words, guesses, length: len, prev: prevShot, pending, book: shapeBook(savedShapes) }, shot);
    setGuesses(r.guesses);
    setLength(r.length);
    setPrevShot({ ink: shot.figure.ink });
    setUnresolved(r.unresolved);
    setTyped('');
    if (r.learned.length) setShapesJson(JSON.stringify(learnShapes(savedShapes, r.learned)));
    const said = [];
    if (r.newBomb) said.push('new bomb');
    said.push(`${r.length} blanks`);
    for (const e of r.events) {
      if (e.type === 'hit') said.push(`${e.letter} at ${e.positions.map(p => p + 1).join(' & ')}${e.how === 'guess' ? ' (the letter you guessed)' : e.how === 'shape' ? ' (known shape)' : e.how === 'list' ? ' (only letter that fits)' : ''}`);
      if (e.type === 'miss') said.push(`no ${e.letter} — a body part was added`);
      if (e.type === 'same') said.push('nothing new since the last screenshot');
    }
    if (r.unresolved.length) said.push('a letter needs naming below');
    const started = r.events.some(e => e.type === 'started');
    setShotNote({
      text: said.join(' · ') + (started ? ' · the stick figure was already started: if letters were guessed before and missed, add them below (“No X”).' : ''),
      ok: !r.unresolved.length && !started
    });
  };

  // name a letter the screenshot showed (or the letter that missed)
  const resolve = (k, letter) => {
    const u = unresolved[k];
    if (!u || !letter) return;
    record(letter, u.positions);
    if (u.glyph) setShapesJson(JSON.stringify(learnShapes(savedShapes, [{ letter, glyph: u.glyph }])));
    setUnresolved(list => list.filter((_, j) => j !== k));
  };

  const board = len ? revealed(len, guesses) : [];
  const typedLetter = /^[A-Z]$/.test(typed) && !used.has(typed) ? typed : '';
  const typedOutcomes = typedLetter && cands.length ? outcomes(cands, typedLetter) : [];

  // one button per thing a guess can show
  const outcomeButtons = (letter, groups) => (
    <div className="hm-outcomes">
      {groups.map((o, i) => (
        <button key={i} type="button" className={`hm-outcome ${o.positions.length ? 'hit' : 'miss'}`} onClick={() => record(letter, o.positions)}>
          <span className="hm-outcome-head">{o.positions.length ? `${letter} at ${o.positions.map(p => p + 1).join(' & ')}` : `No ${letter}`}</span>
          <HangmanBoard small letters={revealed(len, [...guesses, { letter, positions: o.positions }])} mark={o.positions} />
          <span className="hm-outcome-words">{o.words.length === 1 ? `→ ${o.words[0]}` : o.words.length <= 3 ? o.words.join(', ') : `${o.words.length} words`}</span>
        </button>
      ))}
    </div>
  );

  return (
    <ModuleLayout
      input={
        <ModuleInput
          controls={<button className="reset-btn" type="button" onClick={handleClear} data-card-clear>clear</button>}
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🪢"
              title={multi ? 'Drop / paste this Hangman screenshot' : 'Click here, then paste the Hangman screenshot after each guess'}
              sub={<>the blanks that filled in show where the guessed letter is · nothing new = it missed</>}
            />
          }
        >
          {shotNote.text && <div className={`hm-status ${shotNote.ok === false ? 'warn' : ''}`}>{shotNote.text}</div>}
          {unresolved.map((u, k) => (
            <div key={k} className="hm-ask-box">
              {u.positions.length
                ? <>Which letter is in blank {u.positions.map(p => p + 1).join(' & ')}?</>
                : <>A body part was drawn but no letter showed — which letter missed?</>}
              <span className="hm-ask-opts">
                {u.options.slice(0, 10).map(o => (
                  <button key={o} type="button" className="hm-chip" onClick={() => resolve(k, o)}>{o}</button>
                ))}
                <input
                  className="hm-typed"
                  type="text"
                  maxLength={1}
                  placeholder="?"
                  aria-label="letter"
                  onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); if (v) resolve(k, v); }}
                />
              </span>
            </div>
          ))}
          {lengths.length > 1 && length == null && (
            <div className="hm-row">
              <span className="hm-q">BLANKS:</span>
              {lengths.map(n => (
                <button key={n} type="button" className={`hm-chip ${len === n ? 'on' : ''}`} onClick={() => { setLength(n); setGuesses([]); }}>{n}</button>
              ))}
            </div>
          )}
          {len != null && (
            <div className="hm-row hm-now">
              <HangmanBoard letters={board} />
            </div>
          )}
          <div className="hm-row">
            <span className="hm-q">GUESSED ({guesses.length} part{guesses.length === 1 ? '' : 's'} drawn):</span>
            {guesses.length ? guesses.map((g, i) => (
              <span key={i} className={`hm-chip ${g.positions.length ? 'hit' : 'miss'}`}>{g.letter}{g.positions.length ? ` ${g.positions.map(p => p + 1).join('&')}` : ' ✗'}</span>
            )) : <span className="hm-dim">none yet</span>}
            {guesses.length > 0 && <button type="button" className="bg-btn hm-undo" onClick={undo}>↶ undo</button>}
          </div>
          <div className="hm-row">
            <label className="hm-q" htmlFor="hm-typed">DEFUSER GUESSED A DIFFERENT LETTER? TYPE IT FIRST:</label>
            <input
              id="hm-typed"
              className="hm-typed"
              type="text"
              maxLength={1}
              value={typed}
              placeholder="A"
              onChange={e => setTyped(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
            {typed && used.has(typed) && <span className="hm-dim">already guessed</span>}
          </div>
          {typedLetter && len != null && cands.length > 0 && (
            <>
              <div className="hm-dim">Now paste the screenshot — or tap what {typedLetter} showed:</div>
              {outcomeButtons(typedLetter, typedOutcomes)}
            </>
          )}
          <div className="hm-dim hm-list">
            Word list: <b>{words.length} words</b>{wordText === HANGMAN_DEFAULT_WORDS ? ' (built in, from the 22 Nov manual)' : ' (pasted)'} · paste a new manual anywhere to replace it
          </div>
          {!grouped && (
            <details className="hm-manual">
              <summary>📖 HANGMAN WORD LIST</summary>
              <textarea
                className="search-words-field"
                rows={5}
                spellCheck={false}
                value={wordText}
                onChange={e => setWordText(e.target.value)}
              />
              <button type="button" className="bg-btn" onClick={() => setWordText(HANGMAN_DEFAULT_WORDS)}>🔄 RESTORE BUILT-IN LIST</button>
            </details>
          )}
        </ModuleInput>
      }
      answers={
        <>
          <AnswerPanel
            label={label}
            answers={answer}
            placeholder="— — —"
            stats={len == null ? null : cands.length === 1 ? 'only word left' : next ? `${cands.length} words left · at most ${next.worst} more letter${next.worst === 1 ? '' : 's'}` : null}
          />
          {problem && <div className="hm-status warn">⚠ {problem}</div>}
          {next && cands.length > 1 && (
            <>
              <div className="hm-dim">Guess <b>{next.letter}</b>, then paste the new screenshot — or tap what the blanks showed:</div>
              {outcomeButtons(next.letter, next.groups)}
            </>
          )}
          {cands.length > 1 && cands.length <= 30 && (
            <div className="hm-dim hm-words">Still possible: {cands.join(' · ')}</div>
          )}
        </>
      }
      working={
        len != null && cands.length > 0 ? (
          <WorkingPanel title="THE WHOLE PLAN FROM HERE" defaultExpanded={false}>
            <div className="hm-plan">
              <div className="hm-dim">Each letter guess costs a body part whether it’s right or wrong, so the letter chosen is the one that leaves the fewest guesses in the worst case (then on average) — not the most common letter. When one word is left, guess the whole word.</div>
              <HangmanPlan cands={cands} memo={memo} />
            </div>
          </WorkingPanel>
        ) : null
      }
    />
  );
}

export const hangmanModule = {
  id: 'hangman',
  tabId: 'tabHangman',
  tabLabel: '🪢 HANGMAN',
  eyebrow: 'HANGMAN SOLVER',
  title: 'Hangman',
  sub: 'Every letter guess draws a body part, right or wrong — so this picks the letter that narrows the <b>manual’s word list</b> down fastest. Guess it, then <b>drop the defuser’s screenshot</b> (the new letters show where it is; nothing new = a miss) and get the next one. Once one word is left, <b>guess the whole word</b>. Paste this bomb’s manual anywhere to load its list.',
  Component: HangmanModule
};
