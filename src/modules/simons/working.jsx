import React from 'react';
import { SINAMES } from './simonsSolver.js';

export function SimonChip({ c, sm = false }) {
  return c
    ? <span className={`simon-chip ${c}${sm ? ' sm' : ''}`} title={SINAMES[c]}>{c}</span>
    : <span className={`simon-chip none${sm ? ' sm' : ''}`}>–</span>;
}

/**
 * Stage log for one Simon module: every upload with its thumbnail, the colour read from it,
 * what it maps to (ODD | EVEN) and one-tap R/B/Y/G buttons to fix a misread.
 * table = this game's manual table (null = not pasted yet); vowel = does the serial have a vowel
 * (null = no serial yet). Without both, no mapping is shown.
 */
export function SimonsWorking({
  entries = [],
  table = null,
  vowel = null,
  compact = false,
  onAddColor = () => {},
  onFixEntry = () => {},
  onRemoveEntry = () => {}
}) {
  let stage = 0;
  const rules = vowel === null || !table ? null : table[vowel ? 'vowel' : 'noVowel'];
  return (
    <div className={`simon-working ${compact ? 'compact' : ''}`}>
      <div className="simon-add-row">
        <span className="search-config-label" style={{ margin: 0 }}>ADD STAGE BY HAND:</span>
        {['R', 'B', 'Y', 'G'].map(c => (
          <button key={c} type="button" className={`simon-add ${c}`} onClick={() => onAddColor(c)} title={`Add a ${SINAMES[c]} flash`}>
            + {compact ? c : SINAMES[c].toUpperCase()}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="simon-status">Nothing yet — paste the stage-1 GIF.</div>
      ) : (
        <div className="simon-log">
          {entries.map((e, i) => {
            if (e.color) stage++;
            return (
              <div key={i} className={`simon-ent ${e.color ? '' : 'miss'}`}>
                <span className="simon-ent-n">{e.color ? `#${stage}` : '—'}</span>
                {e.thumb ? <img src={e.thumb} alt="" /> : <span className="simon-ent-noimg" />}
                <div className="simon-ent-body">
                  <div className="simon-ent-read">
                    {e.color
                      ? <><SimonChip c={e.color} sm /> <b>{SINAMES[e.color]}</b>{rules && <> → <span className="simon-ent-map">ODD <SimonChip c={rules.odd[e.color]} sm /> EVEN <SimonChip c={rules.even[e.color]} sm /></span></>}</>
                      : <span className="simon-status warn">no glow found — pick the colour</span>}
                  </div>
                  {!compact && <div className="simon-status">{e.note}</div>}
                  {e.warn && <div className="simon-status warn">⚠ {e.warn}</div>}
                  <div className="simon-fix">
                    {['R', 'B', 'Y', 'G'].map(c => (
                      <button key={c} type="button" className={`simon-fix-btn ${c} ${e.color === c ? 'on' : ''}`} onClick={() => onFixEntry(i, c)} title={`It was ${SINAMES[c]}`}>{c}</button>
                    ))}
                  </div>
                </div>
                <button type="button" className="simon-del" onClick={() => onRemoveEntry(i)} title="Remove this upload">✕</button>
              </div>
            );
          })}
        </div>
      )}

      {!compact && table && (
        <table className="simon-rules-table">
          <thead>
            <tr><th>Serial / disarmed</th>{['R', 'B', 'Y', 'G'].map(c => <th key={c}>{SINAMES[c]} flash</th>)}</tr>
          </thead>
          <tbody>
            {[['noVowel', 'odd'], ['noVowel', 'even'], ['vowel', 'odd'], ['vowel', 'even']].map(([v, p]) => {
              const on = vowel !== null && (v === 'vowel') === vowel;
              return (
                <tr key={v + p} className={on ? 'on' : vowel === null ? '' : 'off'}>
                  <td>{v === 'vowel' ? 'Vowel' : 'No vowel'} · {p === 'odd' ? 'Odd' : 'Even'}</td>
                  {['R', 'B', 'Y', 'G'].map(c => <td key={c}><SimonChip c={table[v][p][c]} sm /></td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
