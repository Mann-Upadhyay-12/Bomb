import React from 'react';
import { bestGuess } from './hangmanSolver.js';

/** Blanks with the known letters; `mark` highlights some positions (0-based). */
export function HangmanBoard({ letters, mark = [], small = false }) {
  return (
    <span className={`hm-board ${small ? 'small' : ''}`}>
      {letters.map((ch, i) => (
        <span key={i} className={`hm-slot ${ch !== '_' ? 'known' : ''} ${mark.includes(i) ? 'mark' : ''}`}>{ch === '_' ? '' : ch}</span>
      ))}
    </span>
  );
}

/** The whole plan from here: which letter to guess, and what to do for each thing it can show. */
export function HangmanPlan({ cands, memo, depth = 0 }) {
  const g = bestGuess(cands, memo);
  if (!g) {
    return cands.length === 1
      ? <span className="hm-leaf">→ guess the word <b>{cands[0]}</b></span>
      : <span className="hm-leaf warn">{cands.length ? `can’t tell apart: ${cands.join(', ')}` : 'no word fits'}</span>;
  }
  return (
    <div className="hm-node">
      <div className="hm-ask">Guess <b>{g.letter}</b> <span className="hm-dim">({cands.length} words · worst {g.worst})</span></div>
      <ul>
        {g.groups.map((o, i) => (
          <li key={i}>
            <span className="hm-when">{o.positions.length ? `${g.letter} at ${o.positions.map(p => p + 1).join(' & ')}` : `no ${g.letter}`}:</span>{' '}
            {o.words.length === 1 ? <span className="hm-leaf">→ <b>{o.words[0]}</b></span> : <HangmanPlan cands={o.words} memo={memo} depth={depth + 1} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
