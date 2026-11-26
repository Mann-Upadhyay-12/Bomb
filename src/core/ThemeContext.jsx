import React, { createContext, useContext, useState, useEffect } from 'react';
import { HEX_RE, DARK_BG, LIGHT_BG, DARK_ACCENT, LIGHT_ACCENT, PALETTE_TOKENS, THEME_PRESETS, paletteFor, accentVars, hexToRgb } from './themePalette.js';
import { SKINS, isSkin, loadSkinFont } from './skins.js';

const ThemeContext = createContext(null);

export const BG_COLOR_KEY = 'bombvision_bg_color';
export const BG_IMAGE_KEY = 'bombvision_bg_image';
export const THEME_KEY = 'bombvision_theme';
export const ACCENT_KEY = 'bombvision_accent';
export const BG_DIM_KEY = 'bombvision_bg_dim';
export const SKIN_KEY = 'bombvision_skin';
export const DEFAULT_BG_COLOR = DARK_BG;

const read = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
};
const save = (key, value) => { try { localStorage.setItem(key, value); } catch (e) {} };
// '' = the built-in theme's own colour. The built-in backgrounds count as '' (older versions saved them).
const customHex = (v) => (HEX_RE.test(v || '') && ![DARK_BG, LIGHT_BG].includes(v.toUpperCase()) ? v.toUpperCase() : '');

/**
 * Theme & colors (Settings). `theme` is the built-in palette (dark "Midnight" or parchment). A custom
 * background colour derives every colour from itself (themePalette.js) and turns the light or dark
 * CSS on by how bright it is; an accent replaces the brass. A background picture can be dimmed
 * toward the background colour so the page stays readable. A `skin` (Cyberpunk 2077, Yuza, Dixie: skins.js)
 * adds its own CSS on top: <html data-skin="…">. Changing a colour by hand turns the skin off.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => (read(THEME_KEY, 'dark') === 'parchment' ? 'parchment' : 'dark'));
  // while a skin is on its colours are the skin's own, so a skin that's recoloured later (Dixie, 2026-11-25)
  // reaches people who picked it before: the colours they saved with it are the old ones
  const skinPreset = () => THEME_PRESETS.find((p) => p.skin && p.skin === read(SKIN_KEY, ''));
  const [bgColor, setBgColorState] = useState(() => (skinPreset() ? skinPreset().bg : customHex(read(BG_COLOR_KEY, ''))));
  const [accent, setAccentState] = useState(() => (skinPreset() ? skinPreset().accent : customHex(read(ACCENT_KEY, ''))));
  const [bgImage, setBgImageState] = useState(() => read(BG_IMAGE_KEY, ''));
  const [bgDim, setBgDimState] = useState(() => Math.max(0, Math.min(80, Number(read(BG_DIM_KEY, '0')) || 0)));
  const [skin, setSkin] = useState(() => (isSkin(read(SKIN_KEY, '')) ? read(SKIN_KEY, '') : ''));

  const palette = bgColor ? paletteFor(bgColor, accent) : null;
  const isDark = palette ? palette.dark : theme !== 'parchment';
  const paper = bgColor || (theme === 'parchment' ? LIGHT_BG : DARK_BG);
  // the accent as it shows (an accent too close to the panels is moved until it stands out)
  const shownAccent = palette ? palette.vars['--brass']
    : accent ? accentVars(accent, isDark)['--brass'] : (isDark ? DARK_ACCENT : LIGHT_ACCENT);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', isDark ? 'dark' : 'parchment');
    if (skin) { root.setAttribute('data-skin', skin); loadSkinFont(skin); } else root.removeAttribute('data-skin');
    PALETTE_TOKENS.forEach((t) => root.style.removeProperty(t));
    const vars = { ...(palette ? palette.vars : accent ? accentVars(accent, isDark) : {}), ...(skin ? SKINS[skin].vars : {}) };
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    document.body.style.backgroundColor = bgColor || '';
    save(THEME_KEY, theme);
    save(BG_COLOR_KEY, bgColor);
    save(ACCENT_KEY, accent);
    save(SKIN_KEY, skin);
    // Leaving for the heist happens in this same page (no reload), and the heist reads --paper too
    return () => {
      root.removeAttribute('data-theme');
      root.removeAttribute('data-skin');
      PALETTE_TOKENS.forEach((t) => root.style.removeProperty(t));
      document.body.style.backgroundColor = '';
    };
  }, [theme, bgColor, accent, skin]);

  useEffect(() => {
    const s = document.body.style;
    // a skin whose backdrop is a picture (Cyberpunk's) is dimmed by the same slider: its CSS lays this over it
    const veilVar = `rgba(${hexToRgb(paper).join(',')},${bgDim / 100})`;
    document.documentElement.style.setProperty('--bg-veil', veilVar);
    if (!bgImage) {
      s.backgroundImage = '';
    } else {
      // dimmed toward the background colour (a see-through layer of it over the picture)
      const veil = `rgba(${hexToRgb(paper).join(',')},${bgDim / 100})`;
      s.backgroundImage = `linear-gradient(${veil}, ${veil}), url(${JSON.stringify(bgImage)})`;
      s.backgroundSize = 'cover';
      s.backgroundPosition = 'center';
      s.backgroundRepeat = 'no-repeat';
      s.backgroundAttachment = 'fixed';
    }
    // see-through boxes (the drop areas) get a backing of the background colour over a picture
    document.body.classList.toggle('bg-picture', Boolean(bgImage));
    save(BG_IMAGE_KEY, bgImage);
    save(BG_DIM_KEY, String(bgDim));
    return () => {
      document.body.classList.remove('bg-picture');
      document.documentElement.style.removeProperty('--bg-veil');
      for (const p of ['backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundAttachment']) s[p] = '';
    };
  }, [bgImage, bgDim, paper]);

  // The 📜 / 🌙 button in the modules: the other built-in theme (a custom background is dropped,
  // or the button would seem to do nothing)
  const toggleTheme = () => {
    setThemeState(isDark ? 'parchment' : 'dark');
    setBgColorState('');
    setSkin('');
  };
  const setTheme = (t) => setThemeState(t === 'parchment' ? 'parchment' : 'dark');
  // picking a built-in background colour is that built-in theme
  // (the hex boxes hand back their own colour on blur: that is no change, and keeps the skin)
  const setBgColor = (c) => {
    const u = String(c || '').toUpperCase();
    if (u === paper.toUpperCase()) return;
    setSkin('');
    if (u === DARK_BG || u === LIGHT_BG) { setThemeState(u === DARK_BG ? 'dark' : 'parchment'); setBgColorState(''); }
    else if (HEX_RE.test(u)) setBgColorState(u);
  };
  const setAccent = (c) => {
    const u = HEX_RE.test(c || '') ? c.toUpperCase() : '';
    if (u === accent || (u && u === shownAccent.toUpperCase())) return;
    setSkin('');
    setAccentState(u);
  };
  const setBgImage = (url) => setBgImageState(url || '');
  const setBgDim = (n) => setBgDimState(Math.max(0, Math.min(80, Math.round(Number(n) || 0))));
  const applyPreset = (p) => { setTheme(p.theme); setBgColorState(p.bg); setAccentState(p.accent); setSkin(p.skin || ''); };
  const resetColors = () => { setThemeState('dark'); setBgColorState(''); setAccentState(''); setSkin(''); };

  return (
    <ThemeContext.Provider value={{
      theme,
      isDark,
      toggleTheme,
      setTheme,
      bgColor,
      setBgColor,
      paper,
      accent,
      setAccent,
      shownAccent,
      bgImage,
      setBgImage,
      bgDim,
      setBgDim,
      skin,
      applyPreset,
      resetColors
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
