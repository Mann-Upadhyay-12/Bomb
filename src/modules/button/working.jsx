import React from 'react';

export const COLOR_SWATCH = {
  white: '#F2F2EE', blue: '#3B82F6', yellow: '#F5C842', red: '#E5484D',
  green: '#3E9B4F', black: '#1A1C22', purple: '#9B5DE5', orange: '#F08A24'
};

const STATUS_ICON = { match: '✓', no: '✗', unknown: '?' };

export function ButtonWorking({ rows = [], match = null, blocked = null, log = [] }) {
  if (!rows.length) {
    return (
      <div className="shared-empty-state">
        <span className="shared-empty-text">Paste the helper checklist above — each line like “button is white and label says Blue: 3s”.</span>
      </div>
    );
  }

  return (
    <div className="btn-working">
      <ol className="btn-rules">
        {rows.map(r => {
          const isHit = match && match.n === r.n;
          const isBlock = blocked && blocked.n === r.n;
          return (
            <li key={r.n} className={`btn-rule ${r.status} ${isHit ? 'hit' : ''} ${isBlock ? 'block' : ''}`}>
              <span className="btn-rule-n">{r.n}</span>
              <span className="btn-rule-clauses">
                {r.clauses.map((c, i) => {
                  const v = r.vals[i];
                  const cls = c.unknown ? 'unk' : v === true ? 't' : v === false ? 'f' : 'q';
                  return (
                    <span key={i} className={`btn-clause ${cls}`} title={c.unknown ? 'Could not understand this condition — check the wording' : undefined}>
                      {c.unknown ? `⚠ ${c.desc}` : c.desc}
                    </span>
                  );
                })}
              </span>
              <span className="btn-rule-time">{r.seconds}s</span>
              <span className={`btn-rule-status ${r.status}`}>{STATUS_ICON[r.status]}</span>
            </li>
          );
        })}
      </ol>

      {blocked && (
        <div className="module-hint bad" style={{ marginTop: 10 }}>
          Rule {blocked.n} can’t be decided yet{match ? '' : ''} — fill in the missing info (amber) so the first-match order is respected.
        </div>
      )}

      {log.length > 0 && (
        <div className="btn-log">
          <span className="search-config-label">SOLVED BUTTONS:</span>
          <div className="btn-log-row">
            {log.map((e, i) => (
              <span key={i} className="btn-log-chip">
                {e.stage ? `#${e.stage} ` : ''}
                <span className="btn-log-dot" style={{ background: COLOR_SWATCH[e.color] || 'var(--line)' }} />
                “{e.label}” → <b>{e.seconds}s</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
