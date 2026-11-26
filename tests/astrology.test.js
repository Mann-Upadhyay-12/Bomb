// Astrology: star count + 4 button symbols (Moskowitz constellation glyphs) + sky map quadrants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './pngDecode.js';
import { readSkyMap, readDefuser, segmentSkyMap } from '../src/modules/astrology/astrologyVision.js';
import {
  ASTRO_DEFAULT_STARS, CONSTELLATIONS, DEFAULT_QUADS, astroRefs, parseStarList, solveAstrology, canonConstellation, looksLikeStarList
} from '../src/modules/astrology/astrologySolver.js';

const MAP = readPng(new URL('./fixtures/astrology_map.png', import.meta.url));
const SCREEN = readPng(new URL('./fixtures/astrology_defuser_21.png', import.meta.url));
const refs = astroRefs();

/** Bilinear resize of RGBA data. */
function resize(img, f) {
  const W = Math.round(img.width * f), H = Math.round(img.height * f), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(img.width - 1.001, (x + 0.5) / f - 0.5), sy = Math.min(img.height - 1.001, (y + 0.5) / f - 0.5);
    const x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy)), fx = Math.max(0, sx - x0), fy = Math.max(0, sy - y0);
    for (let c = 0; c < 4; c++) {
      const p = (yy, xx) => img.data[(yy * img.width + xx) * 4 + c];
      out[(y * W + x) * 4 + c] = p(y0, x0) * (1 - fx) * (1 - fy) + p(y0, x0 + 1) * fx * (1 - fy) + p(y0 + 1, x0) * (1 - fx) * fy + p(y0 + 1, x0 + 1) * fx * fy;
    }
  }
  return { data: out, width: W, height: H };
}

test('astrology: 88 distinct constellations in the references', () => {
  assert.equal(CONSTELLATIONS.length, 88);
  assert.equal(new Set(CONSTELLATIONS).size, 88);
  for (const q of ['TL', 'TR', 'BL', 'BR']) assert.ok(Object.values(DEFAULT_QUADS).includes(q));
});

test('astrology: sky map read at its own size and rescaled', () => {
  for (const f of [1, 0.8, 1.35]) {
    const img = f === 1 ? MAP : resize(MAP, f);
    const sky = readSkyMap(img.data, img.width, img.height, refs);
    const wrong = CONSTELLATIONS.filter(n => sky.byName[n] !== DEFAULT_QUADS[n]);
    assert.equal(sky.glyphs.length, 88, `glyphs found at ×${f}`);
    assert.deepEqual(wrong, [], `wrong / missing quadrants at ×${f}`);
  }
});

test('astrology: defuser screenshot — 21 stars, Tucana Triangulum Orion Gemini', () => {
  for (const f of [1, 0.75, 1.5]) {
    const img = f === 1 ? SCREEN : resize(SCREEN, f);
    const r = readDefuser(img.data, img.width, img.height, refs);
    assert.equal(r.stars, 21, `stars at ×${f}`);
    assert.deepEqual(r.buttons.map(b => b && b.name), ['Tucana', 'Triangulum', 'Orion', 'Gemini'], `buttons at ×${f}`);
  }
});

test('astrology: every constellation symbol is recognised on a button', () => {
  // paste each map glyph, scaled to button size, into button 1 of a blank copy of the screenshot
  const seg = segmentSkyMap(MAP.data, MAP.width, MAP.height);
  const W = SCREEN.width, H = SCREEN.height;
  const bx0 = Math.round(W * 0.1), bx1 = Math.round(W * 0.295), by0 = Math.round(H * 0.705), by1 = Math.round(H * 0.885);
  const blank = new Uint8ClampedArray(SCREEN.data);
  const bg = [20, 26, 43];
  for (let y = by0 + 12; y < by1 - 2; y++) for (let x = bx0 + 18; x < bx1 - 6; x++) { const p = (y * W + x) * 4; blank[p] = bg[0]; blank[p + 1] = bg[1]; blank[p + 2] = bg[2]; }
  const named = readSkyMap(MAP.data, MAP.width, MAP.height, refs).glyphs;
  const wrong = [];
  for (const g of seg.glyphs) {
    const b = g.box, f = 44 / Math.max(b.x1 - b.x0, b.y1 - b.y0, 30);
    const crop = { width: b.x1 - b.x0 + 4, height: b.y1 - b.y0 + 4, data: new Uint8ClampedArray((b.x1 - b.x0 + 4) * (b.y1 - b.y0 + 4) * 4) };
    for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
      const sp = ((b.y0 - 2 + y) * MAP.width + b.x0 - 2 + x) * 4, dp = (y * crop.width + x) * 4;
      for (let c = 0; c < 4; c++) crop.data[dp + c] = MAP.data[sp + c];
    }
    const sc = resize(crop, f);
    const img = new Uint8ClampedArray(blank);
    const ox = Math.round((bx0 + bx1) / 2 - sc.width / 2), oy = Math.round((by0 + by1) / 2 - sc.height / 2 + 4);
    for (let y = 0; y < sc.height; y++) for (let x = 0; x < sc.width; x++) {
      const sp = (y * sc.width + x) * 4, dp = ((oy + y) * W + ox + x) * 4;
      for (let c = 0; c < 3; c++) img[dp + c] = sc.data[sp + c];
    }
    const r = readDefuser(img, W, H, refs);
    const expected = named.find(x => x.cx === g.cx && x.cy === g.cy).name;
    if (!r.buttons[0] || r.buttons[0].name !== expected) wrong.push(`${expected} → ${r.buttons[0] && r.buttons[0].name}`);
  }
  assert.deepEqual(wrong, []);
});

test('astrology: star list parsing and aliases', () => {
  const l = parseStarList(ASTRO_DEFAULT_STARS);
  assert.equal(l.count, 88);
  assert.deepEqual(l.unknown, []);
  assert.deepEqual(l.byCount[21], ['Eridanus', 'Lyra', 'Sextans']);
  assert.equal(canonConstellation('bootes'), 'Boötes');
  assert.equal(canonConstellation('Scorpio'), 'Scorpius');
  assert.equal(canonConstellation('URSA  major'), 'Ursa Major');
  assert.equal(canonConstellation('Chameleon'), 'Chamaeleon'); // game 4's list spells it this way
  assert.equal(canonConstellation('Sagitarius'), 'Sagittarius');
  assert.equal(canonConstellation('Ursa Minr'), 'Ursa Minor');
  assert.equal(canonConstellation('Ursa Manor'), null); // as close to Major as to Minor: no guessing
  assert.equal(canonConstellation('Lyn'), null); // short: no guessing
  assert.equal(canonConstellation('Nonsense'), null);
});

test('astrology: the one button sharing a quadrant with a target', () => {
  const l = parseStarList(ASTRO_DEFAULT_STARS);
  const s = solveAstrology(21, ['Tucana', 'Triangulum', 'Orion', 'Gemini'], DEFAULT_QUADS, l);
  assert.equal(s.answer, 1);
  assert.equal(s.problem, '');
  assert.deepEqual(s.rows[0].hits, ['Eridanus']); // Eridanus and Tucana are both bottom-right
  assert.deepEqual(s.alone, [1]);
  // a wrong star count that makes two buttons match is refused, not guessed
  const bad = solveAstrology(3, ['Tucana', 'Triangulum', 'Orion', 'Gemini'], DEFAULT_QUADS, l);
  assert.equal(bad.answer, null);
  assert.match(bad.problem, /buttons match|No button/);
  assert.equal(solveAstrology(99, ['Tucana', 'Triangulum', 'Orion', 'Gemini'], DEFAULT_QUADS, l).answer, null);
  assert.equal(solveAstrology(21, ['Tucana', null, 'Orion', 'Gemini'], DEFAULT_QUADS, l).answer, null);
});

// ── Later games: the sky map and the star list both change every game ─────────────────────────────
const LIST_GAME3 = `3: Corona Australis, Hydrus, Lepus, Lynx, Microscopium, Pavo, Scorpius
4: Canis Minor, Carina
5: Aries, Cassiopeia, Circinus, Corvus, Horologium, Hydra, Leo Minor
6: Aquarius, Octans, Perseus, Pyxis, Reticulum
7: Antlia, Eridanus
8: Cepheus, Draco, Mensa, Musca, Serpens, Vulpecula
9: Delphinus, Pictor, Piscis Austrinus, Scutum, Triangulum
10: Gemini
11: Capricornus, Orion, Virgo
12: Camelopardalis, Dorado, Libra, Lyra, Sculptor
13: Equuleus, Grus, Phoenix, Telescopium
14: Ara, Columba, Corona Borealis, Crater, Pisces, Sextans
15: Cetus, Ursa Major
16: Apus, Canis Major, Puppis, Ursa Minor, Volans
17: Boötes, Centaurus, Coma Berenices, Leo, Sagitta, Sagittarius
18: Canes Venatici, Tucana
19: Fornax, Hercules, Lacerta
20: Monoceros
21: Cancer, Cygnus, Ophiuchus, Pegasus
22: Andromeda, Chamaeleon, Norma, Taurus
23: Auriga, Caelum, Crux
24: Aquila, Indus, Lupus, Triangulum Australe, Vela`;

test('astrology: other games’ sky maps (different layouts, one at 1400×830) read 88/88', () => {
  const spot = {
    game2: { Lyra: 'TL', Gemini: 'TR', Orion: 'TR', Capricornus: 'BL', Virgo: 'BR', Cetus: 'BL' },
    game3: { Orion: 'TL', Capricornus: 'BR', Virgo: 'BR', Apus: 'BR', Serpens: 'TR', Pegasus: 'TR', Cetus: 'BL', Lyra: 'TR' }
  };
  for (const g of ['game2', 'game3']) {
    const img = readPng(new URL(`./fixtures/astrology_map_${g}.png`, import.meta.url));
    const sky = readSkyMap(img.data, img.width, img.height, refs);
    assert.equal(sky.glyphs.length, 88, `${g} glyphs`);
    assert.equal(Object.keys(sky.byName).length, 88, `${g} distinct names`);
    assert.deepEqual(sky.dupes, [], `${g} duplicate names`);
    for (const [n, q] of Object.entries(spot[g])) assert.equal(sky.byName[n], q, `${g} ${n}`);
  }
});

test('astrology: game 3 bomb — 11 stars, Apus Serpens Pegasus Cetus → button 1', () => {
  const img = readPng(new URL('./fixtures/astrology_defuser_11.png', import.meta.url));
  const r = readDefuser(img.data, img.width, img.height, refs);
  assert.equal(r.stars, 11);
  assert.deepEqual(r.buttons.map(b => b && b.name), ['Apus', 'Serpens', 'Pegasus', 'Cetus']);
  const mapImg = readPng(new URL('./fixtures/astrology_map_game3.png', import.meta.url));
  const quads = readSkyMap(mapImg.data, mapImg.width, mapImg.height, refs).byName;
  const s = solveAstrology(11, r.buttons.map(b => b.name), quads, parseStarList(LIST_GAME3));
  assert.equal(s.answer, 1);
  // with the first game's map and list (what the app used to fall back on) it must refuse, not guess
  assert.equal(solveAstrology(11, r.buttons.map(b => b.name), DEFAULT_QUADS, parseStarList(ASTRO_DEFAULT_STARS)).answer, null);
});

// Game 4: the list spells Chamaeleon "Chameleon", and the map's orange frame came through faded
// (~244,208,160 instead of 255,205,135), which used to read the frames as 4 extra glyphs and lose Vela.
const LIST_GAME4 = `Constellations by number of stars
3: Ara, Caelum, Canes Venatici, Coma Berenices, Eridanus, Lepus, Orion
4: Cygnus, Norma, Pavo, Triangulum Australe
5: Columba, Crux, Scorpius
6: Canis Major, Circinus, Corvus, Pisces
7: Horologium, Leo, Ursa Minor
8: Canis Minor, Cassiopeia, Puppis, Serpens
9: Antlia, Scutum
10: Andromeda, Cetus, Draco
11: Equuleus, Musca, Pegasus, Triangulum, Virgo
12: Centaurus, Lacerta, Tucana
13: Cepheus, Phoenix
14: Corona Australis, Delphinus, Taurus, Volans
15: Apus, Fornax, Hydrus, Lupus
16: Aries
17: Dorado, Ophiuchus, Telescopium
18: Cancer, Grus, Mensa, Octans, Vulpecula
19: Capricornus, Sextans, Vela
20: Boötes, Carina, Chameleon, Crater, Gemini, Lynx, Pictor, Piscis Austrinus
21: Aquarius, Lyra, Sagitta, Sagittarius, Sculptor
22: Corona Borealis, Hercules
23: Aquila, Hydra, Indus, Leo Minor, Libra, Monoceros, Pyxis
24: Auriga, Camelopardalis, Microscopium, Perseus, Reticulum, Ursa Major`;

test('astrology: game 4 bomb — faded frame, "Chameleon", 9 stars → button 4', () => {
  const l = parseStarList(LIST_GAME4);
  assert.equal(l.count, 88);
  assert.deepEqual(l.unknown, []);
  const mapImg = readPng(new URL('./fixtures/astrology_map_game4.png', import.meta.url));
  const sky = readSkyMap(mapImg.data, mapImg.width, mapImg.height, refs);
  assert.equal(sky.glyphs.length, 88);
  assert.equal(Object.keys(sky.byName).length, 88);
  assert.deepEqual(sky.dupes, []);
  for (const [n, q] of Object.entries({ Vela: 'BR', Antlia: 'BL', Scutum: 'BL', Norma: 'BL', Vulpecula: 'TL', Pyxis: 'BR', Pictor: 'BR' })) assert.equal(sky.byName[n], q, n);
  const img = readPng(new URL('./fixtures/astrology_defuser_9.png', import.meta.url));
  const r = readDefuser(img.data, img.width, img.height, refs);
  assert.equal(r.stars, 9);
  assert.deepEqual(r.buttons.map(b => b && b.name), ['Pyxis', 'Pictor', 'Vulpecula', 'Norma']);
  assert.equal(solveAstrology(9, r.buttons.map(b => b.name), sky.byName, l).answer, 4);
});

test('astrology: star-list detection for paste-anywhere', () => {
  assert.equal(looksLikeStarList(LIST_GAME3), true);
  assert.equal(looksLikeStarList(ASTRO_DEFAULT_STARS), true);
  assert.equal(looksLikeStarList('1: hello\n2: world'), false);
  assert.equal(looksLikeStarList('MAGIC SPELL WORDS LIST'), false);
});
