// Settings → Theme & colors: a whole palette from one background colour (and an accent), the way
// Heist's Theme Colors does it (heistCore.js applyBgColor), so a custom colour also changes the
// panels, borders and text instead of only the page behind them.
//
// Built-in themes stay in main.css (:root = dark "Midnight", [data-theme="parchment"]). A custom
// background sets every colour token below on <html> and picks dark or parchment for the rest of
// the CSS from which text colour reads better on it.
import { CP, CP_SKIN } from './cyberpunk.js';
import { YUZA, DIXIE } from './skins.js';

export const DARK_BG = '#13151A';
export const LIGHT_BG = '#EDE6D6';
export const DARK_ACCENT = '#E5B84B';
export const LIGHT_ACCENT = '#AD7A2E';
const DARK_INK = '#F2EFE9';
const LIGHT_INK = '#211D17';

export const HEX_RE = /^#[0-9a-f]{6}$/i;

/**
 * Ready-made themes (bg '' = the built-in palette of that theme). A `skin` theme also turns on its own
 * CSS (styles/skins/<skin>.css: fonts, shapes, the backdrop and extra colours), not only bg + accent.
 */
export const THEME_PRESETS = [
  { id: 'midnight', name: 'Midnight', theme: 'dark', bg: '', accent: '', swatch: [DARK_BG, DARK_ACCENT] },
  { id: 'parchment', name: 'Parchment', theme: 'parchment', bg: '', accent: '', swatch: [LIGHT_BG, LIGHT_ACCENT] },
  { id: 'cyberpunk', name: 'Cyberpunk 2077', theme: 'dark', bg: CP.bg, accent: CP.yellow, skin: CP_SKIN, swatch: [CP.bg, CP.yellow, CP.cyan, CP.red] },
  // named after the first two players, in their colours (skins.js)
  { id: 'yuza', name: 'Yuza', theme: 'dark', bg: YUZA.bg, accent: YUZA.red, skin: 'yuza', swatch: [YUZA.bg, YUZA.red, YUZA.purple, YUZA.blood],
    credit: "Yuza's colours: black, blood red and purple" },
  { id: 'dixie', name: 'Dixie', theme: 'dark', bg: DIXIE.bg, accent: DIXIE.blue, skin: 'dixie', swatch: [DIXIE.bg, DIXIE.blue, DIXIE.pink, DIXIE.white],
    credit: "Dixie's colours: light blue (his favourite) with hot pink, magenta and white" },
  { id: 'slate', name: 'Slate', theme: 'dark', bg: '#1B2230', accent: '#7AB8FF' },
  { id: 'forest', name: 'Forest', theme: 'dark', bg: '#102019', accent: '#5FD39A' },
  { id: 'wine', name: 'Wine', theme: 'dark', bg: '#211419', accent: '#F08AA0' },
  { id: 'ocean', name: 'Ocean', theme: 'dark', bg: '#0C1C27', accent: '#4FD1E0' },
  { id: 'violet', name: 'Violet', theme: 'dark', bg: '#1A1626', accent: '#B79BFF' },
  { id: 'paper', name: 'Paper', theme: 'parchment', bg: '#F3F3F0', accent: '#2F6FB2' },
  { id: 'sand', name: 'Sand', theme: 'parchment', bg: '#E5DEC9', accent: '#A0522D' },
  { id: 'mint', name: 'Mint', theme: 'parchment', bg: '#E4EFE8', accent: '#2E7D5B' },
].map((p) => ({ ...p, swatch: p.swatch || [p.bg, p.accent] }));

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** weight of `a` (0..1), the rest `b` — same as Heist's mixColors */
export function mix(a, b, weight) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(...x.map((v, i) => v * weight + y[i] * (1 - weight)));
}
const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(',')},${a})`;

/** WCAG relative luminance and contrast ratio */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Light text reads better on it → a dark theme. */
export const isDarkBg = (bg) => contrast(bg, DARK_INK) >= contrast(bg, LIGHT_INK);

/** Moves `color` toward `toward` until it has `ratio` contrast with `against` (an accent that vanishes into the page). */
export function withContrast(color, against, ratio, toward) {
  let c = color;
  for (let w = 1; w >= 0 && contrast(c, against) < ratio; w -= 0.05) c = mix(color, toward, w);
  return c;
}

/**
 * Every colour token for a background (and an optional accent; '' = the theme's brass).
 * → { dark, vars: { '--paper': … } }
 */
export function paletteFor(bg, accent = '') {
  let dark = isDarkBg(bg);
  let ink = dark ? DARK_INK : LIGHT_INK;
  // on a mid-tone neither usual text colour is quite enough: pure white or black, whichever reads
  // better (one of them always reaches 4.58:1), and light / dark follows that
  if (contrast(ink, bg) < 4.5) {
    dark = contrast('#FFFFFF', bg) > contrast('#000000', bg);
    ink = dark ? '#FFFFFF' : '#000000';
  }
  const toward = dark ? '#FFFFFF' : '#000000';
  // the built-in themes' steps: dark panels a little lighter than the page, light panels lighter still
  // (on a mid-tone colour the panels move away from the text colour until text reads well on them)
  const raised = withContrast(dark ? mix(bg, '#FFFFFF', 0.95) : mix(bg, '#FFFFFF', 0.55), ink, 7, dark ? '#000000' : '#FFFFFF');
  const line = dark ? mix(bg, '#FFFFFF', 0.87) : mix(bg, '#000000', 0.89);
  // secondary text: as far from the text colour as the built-in themes, but readable on page and panels
  const inkSoft = withContrast(withContrast(mix(ink, bg, 0.64), bg, 4.5, ink), raised, 4.5, ink);
  const base = HEX_RE.test(accent || '') ? accent : (dark ? DARK_ACCENT : LIGHT_ACCENT);
  const brass = withContrast(base, raised, 3, dark ? '#FFFFFF' : '#000000');
  const brassDeep = mix(brass, '#000000', dark ? 0.87 : 0.8);
  return {
    dark,
    vars: {
      '--paper': bg,
      '--paper-raised': raised,
      '--ink': ink,
      '--ink-soft': inkSoft,
      '--line': line,
      '--brass': brass,
      '--brass-deep': brassDeep,
      '--brass-glow': rgba(brass, dark ? 0.30 : 0.25),
      '--brass-dim': rgba(brass, dark ? 0.14 : 0.12),
      '--brass-rgb': hexToRgb(brass).join(','),
      '--brass-hi': mix(brass, '#FFFFFF', 0.8),
      '--dot-empty': dark ? raised : '#FFFFFF',
      '--dot-empty-ring': mix(bg, toward, dark ? 0.83 : 0.77),
      '--dot-fill': dark ? brass : ink,
      '--dropzone-active': dark ? mix(bg, '#FFFFFF', 0.92) : mix(brass, bg, 0.35),
      '--cell-covered': mix(bg, toward, dark ? 0.92 : 0.95),
      '--cell-covered-border': mix(bg, toward, dark ? 0.82 : 0.84),
    },
  };
}

/** Only the accent on a built-in theme. */
export function accentVars(accent, dark) {
  const raised = dark ? '#1C2028' : '#F7F2E7';
  const brass = withContrast(accent, raised, 3, dark ? '#FFFFFF' : '#000000');
  return {
    '--brass': brass,
    '--brass-deep': mix(brass, '#000000', dark ? 0.87 : 0.8),
    '--brass-glow': rgba(brass, dark ? 0.30 : 0.25),
    '--brass-dim': rgba(brass, dark ? 0.14 : 0.12),
    '--brass-rgb': hexToRgb(brass).join(','),
    '--brass-hi': mix(brass, '#FFFFFF', 0.8),
    ...(dark ? { '--dot-fill': brass } : {}),
  };
}

/** Every token a custom palette may set (to clear them all). */
export const PALETTE_TOKENS = Object.keys(paletteFor(DARK_BG).vars);
