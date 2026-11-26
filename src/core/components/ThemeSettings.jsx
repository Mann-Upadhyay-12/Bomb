import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../ThemeContext.jsx';
import { THEME_PRESETS, HEX_RE } from '../themePalette.js';
import { SKINS } from '../skins.js';

/** '#abc', 'abc', 'AABBCC' → '#AABBCC'; '' when it isn't a colour yet. */
export function normalizeHex(v) {
  let h = String(v || '').trim().replace(/^#?/, '#');
  if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
  return HEX_RE.test(h) ? h.toUpperCase() : '';
}

/** imgur page links → the direct picture; only http(s) (same rule as Heist's background). */
export function normalizeImageUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (/(^|\.)imgur\.com$/i.test(url.hostname) && url.hostname.toLowerCase() !== 'i.imgur.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = parts[parts.length - 1];
      if (id && !id.includes('.') && parts.length === 1) return `https://i.imgur.com/${id}.jpg`;
    }
    return value;
  } catch (e) {
    return '';
  }
}

/** A colour swatch + hex box; the hex box only applies complete colours and goes back to the real one on blur. */
function ColorField({ id, label, value, onChange, onReset, resetDisabled }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <div className="bg-row">
      <label className="bg-label" htmlFor={`${id}Hex`}>{label}</label>
      <input type="color" id={id} className="theme-color-input" aria-label={`${label} colour`}
        value={value.toLowerCase()} onChange={(e) => onChange(e.target.value)} />
      <input type="text" id={`${id}Hex`} className="bg-hex" value={draft} maxLength={7} spellCheck="false" autoComplete="off"
        onChange={(e) => {
          setDraft(e.target.value);
          const h = normalizeHex(e.target.value);
          if (h && e.target.value.replace('#', '').length === 6) onChange(h);
        }}
        onBlur={() => { const h = normalizeHex(draft); if (h) onChange(h); else setDraft(value); }} />
      <button type="button" className="bg-btn" onClick={onReset} disabled={resetDisabled}>Reset</button>
    </div>
  );
}

/** Settings → THEME & COLORS (modelled on Heist's Settings → Theme & Colors). */
export function ThemeSettings() {
  const {
    theme, isDark, bgColor, setBgColor, paper, accent, setAccent, shownAccent,
    bgImage, setBgImage, bgDim, setBgDim, applyPreset, resetColors, skin,
  } = useTheme();
  const [urlDraft, setUrlDraft] = useState(bgImage);
  const [status, setStatus] = useState({ text: '', kind: '' });
  const probe = useRef(null);
  useEffect(() => () => { if (probe.current) probe.current.cancel(); }, []);

  const applyImage = () => {
    if (probe.current) probe.current.cancel();
    const raw = urlDraft.trim();
    if (!raw) { setBgImage(''); setStatus({ text: '', kind: '' }); return; }
    const url = normalizeImageUrl(raw);
    if (!url) { setStatus({ text: 'Enter a direct picture link starting with https://', kind: 'bad' }); return; }
    setStatus({ text: 'Loading the picture…', kind: '' });
    const img = new Image();
    let done = false;
    const end = () => { done = true; clearTimeout(timer); img.onload = img.onerror = null; };
    const fail = () => { if (done) return; end(); setStatus({ text: 'Could not load that picture. Use a direct link (an i.imgur.com one works).', kind: 'bad' }); };
    const timer = setTimeout(fail, 15000);
    img.onload = () => { if (done) return; end(); setBgImage(url); setUrlDraft(url); setStatus({ text: '✓ Background picture set', kind: 'ok' }); };
    img.onerror = fail;
    probe.current = { cancel: () => { if (!done) { end(); img.src = ''; } } };
    img.src = url;
  };

  const activePreset = THEME_PRESETS.find((p) => p.bg === bgColor && p.accent === accent && (p.bg || p.theme === theme) && (p.skin || '') === skin);
  const custom = Boolean(bgColor || accent || skin);
  // a picture behind the page: your own, or the skin's backdrop (Cyberpunk's Samurai)
  const skinPicture = Boolean(skin && SKINS[skin] && SKINS[skin].picture);
  const pictured = Boolean(bgImage) || skinPicture;

  return (
    <div className="about-panel bg-panel theme-panel">
      <div className="bg-panel-title">THEME &amp; COLORS</div>

      <div className="setting-sub">Themes</div>
      <div className="theme-presets">
        {THEME_PRESETS.map((p) => (
          <button key={p.id} type="button" className={`theme-preset ${p.skin ? `theme-preset-${p.skin}` : ''} ${activePreset === p ? 'on' : ''}`}
            aria-pressed={activePreset === p} onClick={() => applyPreset(p)} title={`${p.credit || p.name}: ${p.swatch.join(' + ')}`}>
            {p.swatch.length > 2 ? (
              // a skin theme: its colours side by side on its background
              <span className="theme-preset-dot theme-preset-dot-multi" style={{ background: p.swatch[0] }}>
                {p.swatch.slice(1).map((c) => <span key={c} style={{ background: c }} />)}
              </span>
            ) : (
              <span className="theme-preset-dot" style={{ background: p.swatch[0] }}>
                <span style={{ background: p.swatch[1] }} />
              </span>
            )}
            {p.name}
          </button>
        ))}
      </div>

      <div className="setting-sub">Your own colors</div>
      <ColorField id="bgColorPicker" label="Background" value={paper} onChange={setBgColor}
        onReset={() => setBgColor(theme === 'parchment' ? '#EDE6D6' : '#13151A')} resetDisabled={!bgColor} />
      <ColorField id="accentPicker" label="Accent" value={shownAccent} onChange={setAccent}
        onReset={() => setAccent('')} resetDisabled={!accent} />
      <div className="setting-note theme-note">
        Panels, borders and text follow the background: {isDark ? 'a dark one gets light text' : 'a light one gets dark text'}, and
        the accent (buttons, answers, highlights) is made lighter or darker if it would disappear into the panels.
      </div>

      <div className="setting-sub">Background picture</div>
      <div className="bg-row">
        <label className="bg-label" htmlFor="bgImageUrl">Image URL</label>
        <input type="text" id="bgImageUrl" className="bg-url" value={urlDraft} placeholder="https://i.imgur.com/example.jpeg"
          spellCheck="false" autoComplete="off" onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyImage(); } }} />
        <button type="button" className="bg-btn" onClick={applyImage}>Apply</button>
        <button type="button" className="bg-btn" disabled={!bgImage && !urlDraft}
          onClick={() => { if (probe.current) probe.current.cancel(); setUrlDraft(''); setBgImage(''); setStatus({ text: '', kind: '' }); }}>Clear</button>
      </div>
      {status.text && <div className={`bg-status ${status.kind}`}>{status.text}</div>}
      {skinPicture && !bgImage && <div className="setting-note theme-note">{SKINS[skin].name} shows its own picture behind the page. A picture set here replaces it, and Dim works on both.</div>}
      <div className="bg-row">
        <label className="bg-label" htmlFor="bgDim">Dim</label>
        <input type="range" id="bgDim" className="theme-range" min="0" max="80" step="5" value={bgDim}
          disabled={!pictured} onChange={(e) => setBgDim(e.target.value)} />
        <span className="setting-inline">{bgDim}%{pictured ? '' : ' (with a picture)'}</span>
      </div>

      <div className="bg-row theme-reset-row">
        <button type="button" className="bg-btn" onClick={resetColors} disabled={!custom && theme === 'dark'}>Reset all colors</button>
        <span className="setting-note-inline">Remembered on this device. The 📜 / 🌙 button in the modules switches between Midnight and Parchment.
          {skin ? ` Changing a colour by hand turns the ${SKINS[skin].name} look off (its colours stay).` : ''}</span>
      </div>
    </div>
  );
}
