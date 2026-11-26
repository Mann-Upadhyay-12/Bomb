import React, { useState } from 'react';
import { readSkyMap, readDefuser, QUAD_NAMES } from './astrologyVision.js';
import { CONSTELLATIONS, astroRefs, parseStarList, solveAstrology, looksLikeStarList } from './astrologySolver.js';
import { imageToData } from '../../core/level/levelVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone, ManualPasteBox } from '../../core/Dropzone.jsx';
import { discordPlain } from '../../utils/discordText.js';
import { useTouchScreen } from '../../utils/touch.js';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';
import { RefGlyph, QuadTag, AstroQuadGrid, StarCheck } from './working.jsx';

export const ASTRO_STARS_KEY = 'bombvision_astro_stars';
const MAP_KEY = 'bombvision_astro_map'; // JSON { name: quad, _missing, _at } of this game's sky map
const STARS_AT_KEY = 'bombvision_astro_stars_at'; // when the star list was pasted (ms)

// Both the sky map and the star list change every game, so nothing is built in: an old map or list
// can make exactly one button match by chance, which would be a confident wrong answer.
const ago = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

const SORTED = CONSTELLATIONS.slice().sort((a, b) => a.localeCompare(b));

function cropUri(img, b, pad = 4) {
  const c = document.createElement('canvas');
  const w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, b.x0 - pad, b.y0 - pad, w, h, 0, 0, w, h);
  return c.toDataURL();
}

export function AstrologyModule({ isActive = true }) {
  const inst = useInstance();
  const grouped = Boolean(inst && inst.grouped);
  const multi = Boolean(inst && inst.multi);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();
  const touch = useTouchScreen();

  // Same for every Astrology on the bomb, and for the whole game: the star list and the sky map
  const [starText, setStarTextRaw] = useSharedSetting(ASTRO_STARS_KEY, '');
  const [starsAt, setStarsAt] = useSharedSetting(STARS_AT_KEY, '');
  const [mapJson, setMapJson] = useSharedSetting(MAP_KEY, '');
  const setStarText = (t) => { setStarTextRaw(t); setStarsAt(t.trim() ? String(Date.now()) : ''); };
  const list = React.useMemo(() => parseStarList(starText), [starText]);
  const pastedMap = React.useMemo(() => { try { return mapJson ? JSON.parse(mapJson) : null; } catch (e) { return null; } }, [mapJson]);
  const quads = pastedMap || {};
  const listOk = list.count >= 40;
  const mapOk = Boolean(pastedMap);

  const [read, setRead] = useState(null); // { stars, starBlobs, bigBlobs, buttons, uri, w, h, thumbs }
  const [stars, setStars] = useState(null);
  const [names, setNames] = useState([null, null, null, null]);
  const [status, setStatus] = useState({ text: '', ok: null });

  const haveInput = read !== null || names.some(Boolean) || stars !== null;
  let solved = haveInput && stars !== null ? solveAstrology(stars, names, quads, list) : null;
  if (solved && (!mapOk || !listOk)) {
    solved = { ...solved, answer: null, problem: `Paste this game's ${[!mapOk && 'sky map', !listOk && 'star list'].filter(Boolean).join(' and ')} first.` };
  }
  const answer = solved && solved.answer ? String(solved.answer) : '';

  // The star list is pasted, not typed: Ctrl+V with it anywhere on the page loads it (in a group of
  // several Astrology cards the group's manual bar does this instead)
  React.useEffect(() => {
    if (!isActive || grouped) return undefined;
    const onPaste = (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))) return;
      const t = e.clipboardData && discordPlain(e.clipboardData.getData('text'));
      if (t && looksLikeStarList(t)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setStarText(t.trim());
        showToast(`STAR LIST LOADED: ${parseStarList(t).count} NAMES ✓`);
      }
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [isActive, grouped]);

  React.useEffect(() => {
    const fresh = answerChanged(answer);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  const readMap = (img) => {
    const d = imageToData(img);
    const sky = readSkyMap(d.data, d.width, d.height, astroRefs());
    const found = Object.keys(sky.byName).length;
    if (found < 60) {
      setStatus({ text: `Only ${found} symbols recognised on that map — kept the previous map.`, ok: false });
      showToast('SKY MAP NOT READ');
      return;
    }
    const missing = CONSTELLATIONS.filter(n => !sky.byName[n]);
    setMapJson(JSON.stringify({ ...sky.byName, _missing: missing, _at: Date.now() }));
    setStatus({
      text: `Sky map read: ${found}/88 symbols${missing.length ? ` — not found: ${missing.join(', ')}` : ''}.`,
      ok: !missing.length
    });
    showToast(`SKY MAP READ: ${found}/88 ✓`);
  };

  const readScreen = (img, dataUri) => {
    const d = imageToData(img);
    const r = readDefuser(d.data, d.width, d.height, astroRefs());
    const thumbs = r.buttons.map(b => (b ? cropUri(img, b.box) : ''));
    setRead({ ...r, uri: dataUri, w: d.width, h: d.height, thumbs });
    setStars(r.stars);
    setNames(r.buttons.map(b => (b ? b.name : null)));
    const weak = r.buttons.filter(b => !b || b.margin < 0.5).length;
    setStatus({
      text: `${r.stars} stars · buttons: ${r.buttons.map((b, i) => `${i + 1} ${b ? b.name : '?'}`).join(', ')}${weak ? ` · ${weak} unsure` : ''}${r.bigBlobs ? ' · a star may hide another — check the count' : ''}`,
      ok: !weak && !r.bigBlobs
    });
  };

  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    try {
      // the helper's sky map is wide; the defuser's module screenshot is square
      if (img.naturalWidth / img.naturalHeight > 1.3) readMap(img);
      else readScreen(img, dataUri);
    } catch (e) {
      setStatus({ text: `Could not read that image (${e.message || e}).`, ok: false });
    }
  };

  const setName = (i, v) => setNames(prev => prev.map((x, j) => (j === i ? (v || null) : x)));
  const bumpStars = (d) => setStars(s => Math.max(1, (s || 0) + d));

  const handleClear = () => {
    setRead(null); setStars(null); setNames([null, null, null, null]);
    setStatus({ text: '', ok: null });
    setLastImage(null, null);
    setLastCopyString('');
  };

  // toast once per new answer
  const lastToast = React.useRef('');
  React.useEffect(() => {
    if (answer && answer !== lastToast.current) { lastToast.current = answer; showToast(`ASTROLOGY: PRESS ${answer} ✓`); }
  }, [answer]);

  const stats = solved
    ? `${stars}★ → ${solved.targets.map(t => `${t.name} ${t.quad || '?'}`).join(', ') || 'none'}`
    : null;

  return (
    <ModuleLayout
      input={
        <ModuleInput
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="✨"
              title={multi ? 'Drop / paste this Astrology screenshot' : 'Click here, then paste the Astrology screenshot'}
              sub={<>the defuser’s module (stars + 4 buttons) · paste the helper’s <b>sky map</b> once per game</>}
            />
          }
          controls={<button className="reset-btn" type="button" onClick={handleClear} data-card-clear>clear</button>}
        >
          {status.text && <div className={`astro-status ${status.ok === false ? 'warn' : ''}`}>{status.text}</div>}
          <ol className="astro-steps">
            <li className={mapOk ? 'ok' : 'todo'}>
              {mapOk
                ? <>Sky map ✓ {88 - (pastedMap._missing || []).length}/88 · {ago(pastedMap._at)}</>
                : <>Paste this game’s <b>sky map</b> (the wide picture)</>}
            </li>
            <li className={listOk ? 'ok' : 'todo'}>
              {listOk
                ? <>Star list ✓ {list.count} names{starsAt ? <> · {ago(Number(starsAt))}</> : null}{list.unknown.length ? <span className="warn"> · not recognised: {list.unknown.join(', ')}</span> : null}</>
                : <>Paste this game’s <b>star list</b> text {touch ? '(into the 📖 manual box)' : '(Ctrl+V anywhere)'}</>}
            </li>
            <li className={read ? 'ok' : 'todo'}>{read ? 'Defuser screenshot ✓' : <>Paste the defuser’s <b>screenshot</b> (each bomb)</>}</li>
          </ol>
          <ManualPasteBox what="Astrology sky map" card={multi ? inst.index : null} />
          {(mapOk || listOk) && (
            <button type="button" className="bg-btn astro-newgame" onClick={() => { setMapJson(''); setStarText(''); handleClear(); showToast('ASTROLOGY: NEW GAME — PASTE THE MAP AND LIST'); }}>
              NEW GAME (forget map + list)
            </button>
          )}
          {!grouped && (
            <details className="astro-manual">
              <summary>📖 CONSTELLATIONS BY NUMBER OF STARS</summary>
              <textarea
                className="search-words-field"
                rows={8}
                spellCheck={false}
                placeholder={'3: Libra, Lupus, Pavo, Taurus\n4: Camelopardalis, Cetus, …'}
                value={starText}
                onChange={e => setStarText(e.target.value)}
              />
            </details>
          )}
        </ModuleInput>
      }
      answers={
        <>
          <AnswerPanel label="PRESS BUTTON" stats={stats} answers={answer} placeholder="— — —" />
          {solved && solved.problem && (
            <div className="astro-status warn astro-problem">
              ⚠ {solved.problem}
              {solved.alone.length === 1 && solved.rows.every(r => r.quad) && (
                <> Hint: button {solved.alone[0]} is the only one alone in its quadrant, and the answer always is.</>
              )}
            </div>
          )}
          {haveInput && (
            <div className="astro-board">
              <div className="astro-stars">
                <span className="astro-label">STARS</span>
                <button type="button" className="bg-btn" onClick={() => bumpStars(-1)}>−</button>
                <input type="number" min="1" className="bg-hex" value={stars ?? ''} onChange={e => setStars(e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1))} />
                <button type="button" className="bg-btn" onClick={() => bumpStars(1)}>+</button>
              </div>
              <div className="astro-buttons">
                {names.map((name, i) => {
                  const row = solved && solved.rows[i];
                  const b = read && read.buttons[i];
                  return (
                    <div key={i} className={`astro-btn ${solved && solved.answer === i + 1 ? 'answer' : ''} ${b && b.margin < 0.5 ? 'unsure' : ''}`}>
                      <div className="astro-btn-n">{i + 1}</div>
                      <div className="astro-btn-glyphs">
                        {read && read.thumbs[i] ? <img src={read.thumbs[i]} alt="" className="astro-thumb" /> : null}
                        <RefGlyph name={name} />
                      </div>
                      <select value={name || ''} onChange={e => setName(i, e.target.value)} aria-label={`Button ${i + 1} constellation`}>
                        <option value="">— pick —</option>
                        {SORTED.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <div className="astro-btn-q">
                        <QuadTag q={name ? quads[name] : null} />
                        {row && row.hits.length ? <span className="astro-hit">✓ {row.hits.join(', ')}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      }
      working={
        <WorkingPanel title="SKY MAP — TARGETS & BUTTONS" defaultExpanded={false}>
          {solved ? (
            <div className="astro-working">
              <div className="astro-targets">
                <b>{stars} stars:</b>{' '}
                {solved.targets.length ? solved.targets.map(t => (
                  <span key={t.name} className="astro-target"><RefGlyph name={t.name} size={22} /> {t.name} <QuadTag q={t.quad} /></span>
                )) : 'none in the list'}
              </div>
              <AstroQuadGrid solved={solved} />
              {read && <StarCheck uri={read.uri} w={read.w} h={read.h} blobs={read.starBlobs} />}
              <div className="astro-status">
                Quadrants: {Object.entries(QUAD_NAMES).map(([k, v]) => `${k} = ${v}`).join(' · ')}
              </div>
            </div>
          ) : <div className="astro-status">Paste the defuser’s Astrology screenshot.</div>}
        </WorkingPanel>
      }
    />
  );
}

export const astrologyModule = {
  id: 'astrology',
  tabId: 'tabAstrology',
  tabLabel: '✨ ASTROLOGY',
  eyebrow: 'ASTROLOGY SOLVER',
  title: 'Astrology Vision',
  sub: 'Each game: paste the helper’s <b>sky map</b> and <b>star list</b>. Each bomb: paste the defuser’s screenshot — the <b>stars</b> are counted and the 4 <b>button symbols</b> named (Moskowitz constellation symbols). Every constellation with that many stars is found on the map, and the one button in the same quadrant as one of them is the answer.',
  Component: AstrologyModule
};
