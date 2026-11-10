import React from 'react';
import { SY } from './symbolsConstants.js';

// '҂' renders as a tiny tick in most fonts, so Double Cross is drawn as an SVG
const DC_PATH = 'M 17.7 2.7 L 15.7 2.0 L 13.0 5.3 L 9.7 3.3 L 7.7 4.7 L 11.0 10.0 L 9.0 12.7 L 5.7 10.7 L 3.0 12.7 L 7.0 16.0 L 5.7 21.3 L 8.3 22.0 L 11.0 18.0 L 15.0 20.7 L 17.0 17.3 L 12.3 14.7 L 15.0 10.7 L 18.3 12.7 L 21.0 10.7 L 17.0 7.3 Z';

export function SymbolGlyph({ k, size = 22 }) {
  if (!k || !SY[k]) return <span className="sy-glyph" style={{ fontSize: size }}>?</span>;
  if (k === 'DOUBLE_CROSS') {
    return (
      <svg className="sy-svg" viewBox="0 0 24 24" width={size} height={size} aria-label={SY[k].name}>
        <path d={DC_PATH} />
      </svg>
    );
  }
  return <span className="sy-glyph" style={{ fontSize: size }} aria-label={SY[k].name}>{SY[k].glyph}</span>;
}
