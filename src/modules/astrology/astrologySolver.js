// Astrology rules. The defuser counts the stars and reads the 4 button symbols; the helpers look up
// every constellation with that many stars, find them on the sky map, and press the ONE button whose
// symbol is in the same quadrant as one of them.

import { ASTRO_REFS } from './astroRefs.js';
import { unpackBits } from './astrologyVision.js';
import { discordPlain } from '../../utils/discordText.js';

export const CONSTELLATIONS = ASTRO_REFS.map(r => r.name);
/** Quadrant of every constellation on the built-in sky map. */
export const DEFAULT_QUADS = Object.fromEntries(ASTRO_REFS.map(r => [r.name, r.quad]));

let refCache = null;
/** Reference glyphs, unpacked once. */
export function astroRefs() {
  if (!refCache) refCache = ASTRO_REFS.map(r => ({ name: r.name, aspect: r.aspect, bits: unpackBits(r.bits) }));
  return refCache;
}

// The first game's list (kept for tests; every game has its own list, so the app has no default)
export const ASTRO_DEFAULT_STARS = `Constellations by number of stars
3: Chamaeleon, Corvus, Draco, Gemini, Norma, Ursa Major
4: Cassiopeia, Lacerta, Phoenix
5: Andromeda, Apus, Corona Australis, Horologium, Indus
6: Orion, Pyxis, Sagitta, Scorpius, Sculptor, Virgo
7: Octans, Tucana
8: Aquarius, Cancer, Circinus, Pegasus, Scutum
9: Columba, Coma Berenices, Leo, Ophiuchus, Taurus, Ursa Minor
10: Aries, Hydrus, Monoceros, Piscis Austrinus
11: Ara, Crater, Perseus
12: Canes Venatici
13: Aquila, Canis Minor, Libra, Lupus, Microscopium, Pavo, Serpens
14: Lepus, Pisces
15: Fornax, Lynx, Telescopium, Triangulum, Volans
16: Caelum, Canis Major, Capricornus, Pictor
17: Corona Borealis, Delphinus, Leo Minor, Sagittarius
18: Antlia, Carina, Cygnus, Dorado, Grus, Hercules, Hydra, Triangulum Australe
19: Puppis
20: Auriga, Camelopardalis, Mensa, Musca
21: Eridanus, Lyra, Sextans
22: Reticulum, Vela, Vulpecula
23: Boötes, Cepheus
24: Centaurus, Cetus, Crux, Equuleus`;

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const ALIASES = { scorpio: 'Scorpius', capricorn: 'Capricornus', serpenscaput: 'Serpens', serpenscauda: 'Serpens', bootes: 'Boötes', chameleon: 'Chamaeleon' };
const BY_FOLD = Object.fromEntries(CONSTELLATIONS.map(n => [fold(n), n]));

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// Lists differ per game and sometimes misspell a name ("Chameleon"): take the one name a letter or
// two away (one for short names), and only when no other name is as close.
function nearestConstellation(f) {
  if (f.length < 4) return null;
  const max = f.length < 8 ? 1 : 2;
  let best = null, bestD = max + 1, tie = false;
  for (const [k, n] of Object.entries(BY_FOLD)) {
    const d = editDistance(f, k);
    if (d < bestD) { best = n; bestD = d; tie = false; } else if (d === bestD) tie = true;
  }
  return best && !tie ? best : null;
}

/** Any spelling ("Bootes", "ursa major", "Scorpio", "Chameleon") → the canonical name, or null. */
export function canonConstellation(s) {
  const f = fold(s);
  return BY_FOLD[f] || ALIASES[f] || nearestConstellation(f);
}

/** Pasted text that is a star list: several "N: names" lines naming known constellations. */
export function looksLikeStarList(text) {
  const l = parseStarList(text);
  return l.count >= 20 && Object.keys(l.byCount).length >= 5;
}

/**
 * "N: name, name, …" lines → { byCount: { N: [names] }, unknown: [words not recognised], count }.
 * Lines without "N:" are ignored (headings).
 */
export function parseStarList(text) {
  text = discordPlain(text); // a phone copies Discord's **markup** too
  const byCount = {}, unknown = [];
  let count = 0;
  String(text || '').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*(\d{1,3})\s*[:=\-–]\s*(.+)$/);
    if (!m) return;
    const n = Number(m[1]);
    m[2].split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(w => {
      const c = canonConstellation(w);
      if (!c) { unknown.push(w); return; }
      (byCount[n] = byCount[n] || []).push(c);
      count++;
    });
  });
  return { byCount, unknown, count };
}

/**
 * stars: number; buttons: [name|null ×4]; quads: { name: 'TL'|'TR'|'BL'|'BR' }; list: parseStarList().
 * Returns { targets: [{ name, quad }], rows: [{ n, name, quad, hits: [target names] }], answer: 1..4 | null,
 *           problem: '' | text, alone: [button numbers alone in their quadrant] }.
 */
export function solveAstrology(stars, buttons, quads, list) {
  const names = (list.byCount[stars] || []).slice();
  const targets = names.map(name => ({ name, quad: quads[name] || null }));
  const targetQuads = new Set(targets.map(t => t.quad).filter(Boolean));
  const rows = buttons.map((name, i) => {
    const quad = name ? quads[name] || null : null;
    return { n: i + 1, name, quad, hits: quad ? targets.filter(t => t.quad === quad).map(t => t.name) : [] };
  });
  const matched = rows.filter(r => r.hits.length);
  // "exactly one button matches" also means the answer is the only button in its quadrant
  const perQuad = {};
  rows.forEach(r => { if (r.quad) perQuad[r.quad] = (perQuad[r.quad] || 0) + 1; });
  const alone = rows.filter(r => r.quad && perQuad[r.quad] === 1).map(r => r.n);

  let problem = '';
  if (!names.length) problem = `No constellation has ${stars} stars in the list.`;
  else if (rows.some(r => !r.name)) problem = 'A button symbol was not read — pick it by hand.';
  else if (targets.some(t => !t.quad)) problem = `Not on the sky map: ${targets.filter(t => !t.quad).map(t => t.name).join(', ')}.`;
  else if (matched.length === 0) problem = 'No button shares a quadrant with those constellations — check the star count and the symbols.';
  else if (matched.length > 1) problem = `${matched.length} buttons match (${matched.map(r => r.n).join(', ')}) — the rule says exactly one, so a read is wrong. Check the star count and the symbols.`;
  return { targets, rows, answer: !problem && matched.length === 1 ? matched[0].n : null, problem, alone, targetQuads: [...targetQuads] };
}
