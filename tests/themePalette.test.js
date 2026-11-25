// Settings → Theme & colors: one background colour (and an accent) → every colour token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paletteFor, accentVars, contrast, isDarkBg, THEME_PRESETS, PALETTE_TOKENS, HEX_RE } from '../src/core/themePalette.js';
import { readFileSync } from 'node:fs';

const hex = (n) => '#' + n.toString(16).padStart(6, '0').toUpperCase();

test('any background: text, secondary text and accent stay readable', () => {
  // a sweep over the colour cube (6×6×6 backgrounds) with accents that clash on purpose
  const steps = [0, 51, 102, 153, 204, 255];
  for (const r of steps) for (const g of steps) for (const b of steps) {
    const bg = hex((r << 16) | (g << 8) | b);
    for (const acc of ['', bg, '#FFFF00', '#000080']) {
      const { vars } = paletteFor(bg, acc);
      const at = `${bg} / accent ${acc || 'default'}`;
      assert.ok(contrast(vars['--ink'], vars['--paper-raised']) >= 7, `text on panels ${at}`);
      assert.ok(contrast(vars['--ink'], bg) >= 4.5, `text on the page ${at}`);
      assert.ok(contrast(vars['--ink-soft'], vars['--paper-raised']) >= 4.5, `secondary text on panels ${at}`);
      assert.ok(contrast(vars['--brass'], vars['--paper-raised']) >= 3, `accent on panels ${at}`);
      for (const [k, v] of Object.entries(vars)) assert.ok(HEX_RE.test(v) || /^rgba\(|^\d+,\d+,\d+$/.test(v), `${k} = ${v}`);
    }
  }
});

test('light and dark follow the colour', () => {
  assert.equal(isDarkBg('#13151A'), true);
  assert.equal(isDarkBg('#FFFFFF'), false, 'white on the dark theme becomes a light theme (dark text)');
  assert.equal(paletteFor('#FFFFFF').vars['--ink'], '#211D17');
  assert.equal(paletteFor('#1B2230').vars['--ink'], '#F2EFE9');
});

test('the accent is used as given when it shows, and moved when it would vanish', () => {
  assert.equal(paletteFor('#1B2230', '#7AB8FF').vars['--brass'], '#7AB8FF');
  const lost = paletteFor('#3366CC', '#3366CC').vars['--brass'];
  assert.notEqual(lost, '#3366CC', 'an accent equal to the background is lightened');
  assert.equal(accentVars('#7AB8FF', true)['--brass'], '#7AB8FF');
  assert.equal(accentVars('#7AB8FF', true)['--brass-rgb'], '122,184,255');
});

test('presets and tokens', () => {
  assert.equal(THEME_PRESETS[0].id, 'midnight');
  assert.equal(THEME_PRESETS[0].bg, '', 'Midnight is the built-in dark theme');
  assert.equal(THEME_PRESETS[1].bg, '', 'Parchment is the built-in light theme');
  for (const p of THEME_PRESETS.filter((x) => x.bg)) assert.equal(isDarkBg(p.bg), p.theme === 'dark', p.name);
  // every token the palette sets exists in the built-in themes, so clearing it falls back cleanly
  const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
  for (const t of PALETTE_TOKENS) assert.ok(css.includes(`${t}:`), `${t} in main.css`);
});

test('no hard-coded accent left in the app styles (the accent setting would miss it)', () => {
  const files = ['components/answerpanel.css', 'components/sidebar.css', 'components/modulelayout.css', 'modules/maze.css', 'modules/diagram.css', 'modules/chess63.css'];
  for (const f of files) {
    const s = readFileSync(new URL(`../src/styles/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /rgba\(\s*(229\s*,\s*184\s*,\s*75|173\s*,\s*122\s*,\s*46)\s*,/, f);
  }
  const main = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8').split('\n').slice(60).join('\n');
  assert.doesNotMatch(main, /rgba\(\s*(229\s*,\s*184\s*,\s*75|173\s*,\s*122\s*,\s*46)\s*,|#F3CA65/i, 'main.css after the theme definitions');
});
