// The themes with a look of their own (a "skin"): fonts, shapes, a backdrop and a few colours on top of
// the background + accent palette. Settings → THEME & COLORS in the bomb app, Theme Colors in Heist.
// <html data-skin="…"> turns its CSS on: styles/skins/cyberpunk.css, styles/skins/friends.css (both
// apps; Heist has its own copy of the Cyberpunk one in heist.css).
//
//   cyberpunk     Cyberpunk 2077 (cyberpunk.js: where each colour comes from)
//   yuza, dixie   named after Yuza and Dixie, the site's first two players (yuza.html and dixie.html
//                 are theirs too), in the colours they picked: Yuza's black, blood red and purple (a
//                 vampire night), and Dixie's: light blue first (his favourite), then hot pink,
//                 magenta and a little red with white, and only a touch of purple. Not too soft.
import { CP, CP_SKIN, CP_VARS, loadCyberpunkFont } from './cyberpunk.js';

export const YUZA = {
  bg: '#0B080D',
  red: '#DC1F3C',    // blood red: the accent (answers, buttons)
  blood: '#8B0A1E',  // dark blood: drips, the scrollbar
  purple: '#A66CFF', // labels, focus
  lilac: '#C79BFF',  // links
  line: '#3F2147',   // plum borders
  soft: '#B9A3C9',   // secondary text, mauve
};

export const DIXIE = {
  bg: '#0A0F1E',      // a deep navy night
  blue: '#8EC5FF',    // light blue, Dixie's favourite: the accent (answers, buttons)
  pink: '#FF4FA3',    // hot pink, the second colour: labels, edges, the ridges' rim
  magenta: '#E0218A', // glows, the scrollbar
  red: '#FF4D6A',     // a reddish touch (the drop box's icons)
  white: '#FFFFFF',   // stars, the drop box's title
  purple: '#8F7BE0',  // the least of them: only the far ridge's edge
  line: '#24304F',    // navy borders
  soft: '#A9B6D3',    // secondary text, blue-grey
};

const font = (family) => `https://fonts.googleapis.com/css2?family=${family}&display=swap`;

/**
 * id → { name, vars (set on <html> over the palette, bomb app), heist (Heist's accents), note (Heist's
 * line under its theme buttons), font (a Google Fonts link, loaded only while the skin is on), picture
 * (its backdrop is a picture, dimmed by the bomb app's Dim slider through --bg-veil) }.
 */
export const SKINS = {
  [CP_SKIN]: {
    name: 'Cyberpunk 2077',
    vars: CP_VARS,
    picture: true, // its backdrop is a picture (styles/skins/cyberpunk.css): the Dim slider dims it too
    heist: { '--brass': CP.yellow, '--brass-deep': CP.red, '--dropzone-active': '#0F262C', '--line': CP_VARS['--line'], '--ink-soft': CP_VARS['--ink-soft'] },
    note: "Cyberpunk 2077 is on: the game's yellow, cyan and red, its square panels, and the Samurai backdrop (a background picture below replaces it). Picking any colour turns it off.",
  },
  yuza: {
    name: 'Yuza',
    vars: {
      '--line': YUZA.line,
      '--ink-soft': YUZA.soft,
      '--dropzone-active': '#1C0A14',
      '--dot-empty-ring': YUZA.line,
      '--cell-covered-border': YUZA.line,
    },
    heist: { '--brass': YUZA.red, '--brass-deep': YUZA.blood, '--dropzone-active': '#1C0A14', '--line': YUZA.line, '--ink-soft': YUZA.soft },
    note: "Yuza is on: Yuza's black, blood red and purple, a vampire night with a full moon, bats and roses (a background picture below replaces it). Picking any colour turns it off.",
    font: font('Grenze+Gotisch:wght@500;700'),
  },
  dixie: {
    name: 'Dixie',
    vars: {
      '--line': DIXIE.line,
      '--ink-soft': DIXIE.soft,
      '--dropzone-active': '#181530',
      '--dot-empty-ring': DIXIE.line,
      '--cell-covered-border': DIXIE.line,
    },
    heist: { '--brass': DIXIE.blue, '--brass-deep': DIXIE.magenta, '--dropzone-active': '#181530', '--line': DIXIE.line, '--ink-soft': DIXIE.soft },
    note: "Dixie is on: Dixie's favourite light blue with hot pink, magenta and white, a starry night over hot-pink-rimmed ridges (a background picture below replaces it). Picking any colour turns it off.",
    font: font('Outfit:wght@500;600;700'),
  },
};

export const isSkin = (id) => Object.prototype.hasOwnProperty.call(SKINS, id || '');

/** Loads a skin's font once (offline, bomb.html, the fallback fonts are used instead). */
export function loadSkinFont(id) {
  if (id === CP_SKIN) { loadCyberpunkFont(); return; }
  const url = SKINS[id] && SKINS[id].font;
  if (!url || typeof document === 'undefined' || document.getElementById(`skin-font-${id}`)) return;
  const link = document.createElement('link');
  link.id = `skin-font-${id}`;
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
