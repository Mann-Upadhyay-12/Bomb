// The Cyberpunk 2077 theme's colours, shared by the bomb app (themePalette.js, styles/skins/cyberpunk.css)
// and Heist (heistCore.js, heist.css). Where each one comes from (checked 2026-11-24):
//   yellow, cyan, red: cyberpunk.net's own stylesheet and button pictures. #FCEE0A is its main yellow
//     (49 uses; buttons, links), #00F0FF its cyan buttons and menu, #FD0130 its red buttons.
//     CD Projekt's printed yellow, Pantone 3945 C (243, 230, 0), is the same colour for print.
//   hudRed, bg, border: the game's own menus, as copied by CPStyling.lua (a Cyber Engine Tweaks
//     library made to match the in-game UI). Its text is (1.00, 0.38, 0.33), its window background
//     (0.06, 0.04, 0.06) and its borders (0.30, 0.07, 0.08).
export const CP = {
  yellow: '#FCEE0A',
  cyan: '#00F0FF',
  red: '#FD0130',
  hudRed: '#FF6154',
  bg: '#0F0A0F',
  border: '#4D1214',
};

export const CP_SKIN = 'cyberpunk';

// Blender Pro is the game's UI font (not free); Rajdhani is the usual free stand-in. It is loaded
// only while the theme is on. Offline (bomb.html), the fallback fonts are used instead.
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap';
export function loadCyberpunkFont() {
  if (typeof document === 'undefined' || document.getElementById('cp-font')) return;
  const link = document.createElement('link');
  link.id = 'cp-font';
  link.rel = 'stylesheet';
  link.href = FONT_URL;
  document.head.appendChild(link);
}

// Colour tokens the theme changes beyond the background + accent palette (themePalette.js sets those
// on <html> itself, so they are set the same way, not in the stylesheet): the game's dark red panel
// borders, its cyan secondary text, a cyan glow for a box being dropped on.
export const CP_VARS = {
  '--line': '#5A1820',
  '--ink-soft': '#8FD3D8',
  '--dropzone-active': '#0F262C',
  '--dot-empty-ring': '#5A1820',
  '--cell-covered-border': '#5A1820',
};
