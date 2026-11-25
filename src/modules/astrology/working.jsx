import React from 'react';
import { GLYPH_N, QUAD_NAMES } from './astrologyVision.js';
import { astroRefs } from './astrologySolver.js';

const glyphUriCache = new Map();
/** Reference glyph of a constellation as a small white-on-transparent image. */
function refGlyphUri(name) {
  if (glyphUriCache.has(name)) return glyphUriCache.get(name);
  const r = astroRefs().find(x => x.name === name);
  if (!r || typeof document === 'undefined') return '';
  const c = document.createElement('canvas'); c.width = c.height = GLYPH_N;
  const g = c.getContext('2d'), im = g.createImageData(GLYPH_N, GLYPH_N);
  r.bits.forEach((v, i) => { if (v) { im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = 235; im.data[i * 4 + 3] = 255; } });
  g.putImageData(im, 0, 0);
  const uri = c.toDataURL();
  glyphUriCache.set(name, uri);
  return uri;
}

export function RefGlyph({ name, size = 28 }) {
  const uri = name ? refGlyphUri(name) : '';
  return uri ? <img className="astro-ref" src={uri} alt={name} title={name} width={size} height={size} /> : <span className="astro-ref none" style={{ width: size, height: size }} />;
}

export const QuadTag = ({ q }) => (q ? <span className={`astro-quad q-${q}`} title={QUAD_NAMES[q]}>{q}</span> : <span className="astro-quad none">?</span>);

/** 2×2 sky map: the target constellations and the buttons in each quadrant. */
export function AstroQuadGrid({ solved }) {
  return (
    <div className="astro-grid">
      {['TL', 'TR', 'BL', 'BR'].map(q => {
        const t = solved.targets.filter(x => x.quad === q);
        const b = solved.rows.filter(x => x.quad === q);
        const hit = t.length && b.length;
        return (
          <div key={q} className={`astro-cell ${hit ? 'hit' : ''}`}>
            <div className="astro-cell-head">{QUAD_NAMES[q]}</div>
            {t.map(x => <div key={x.name} className="astro-cell-t">★ {x.name}</div>)}
            {b.map(x => <div key={x.n} className="astro-cell-b">button {x.n} · {x.name}</div>)}
            {!t.length && !b.length && <div className="astro-cell-empty">—</div>}
          </div>
        );
      })}
    </div>
  );
}

/** The screenshot with a ring on every star counted, so a miscount is easy to spot. */
export function StarCheck({ uri, w, h, blobs }) {
  if (!uri) return null;
  return (
    <div className="astro-starcheck">
      <img src={uri} alt="defuser screenshot" />
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {blobs.map((b, i) => (
          <g key={i}>
            <circle cx={b.x} cy={b.y} r={w * 0.022} className="astro-star-ring" />
            <text x={b.x + w * 0.025} y={b.y - w * 0.02} className="astro-star-n" fontSize={w * 0.03}>{i + 1}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
