import React from 'react';

// Render "KNO3" with real subscripts: digits that follow an element/bracket are subscripted
function Formula({ text }) {
  const parts = [];
  const re = /(\d+)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<span key={last}>{text.slice(last, m.index)}</span>);
    const leading = m.index === 0 || text[m.index - 1] === '.';
    parts.push(leading ? <span key={m.index}>{m[1]}</span> : <sub key={m.index}>{m[1]}</sub>);
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push(<span key={last}>{text.slice(last)}</span>);
  return <span className="bal-formula">{parts}</span>;
}

export function BalanceWorking({ result }) {
  if (!result) {
    return (
      <div className="shared-empty-state">
        <span className="shared-empty-text">No equation yet — paste the Balance screenshot or type e.g. KNO3 → KNO2 + O2</span>
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="shared-error-state">
        <span className="shared-error-icon">⚠️</span>
        <span className="shared-error-text">{result.error}</span>
      </div>
    );
  }

  const L = result.species.map((s, i) => ({ s, i })).filter(x => x.s.side === 'L');
  const R = result.species.map((s, i) => ({ s, i })).filter(x => x.s.side === 'R');
  const side = (list) => list.map(({ s, i }, k) => (
    <React.Fragment key={i}>
      {k > 0 && <span className="bal-op">+</span>}
      <span className="bal-term">
        <span className="bal-coef">{result.coefficients[i]}</span>
        <Formula text={s.formula} />
      </span>
    </React.Fragment>
  ));

  return (
    <div className="bal-working">
      <div className="bal-equation">
        {side(L)}
        <span className="bal-arrow">⟶</span>
        {side(R)}
      </div>
      <table className="bal-table">
        <thead>
          <tr><th>Element</th><th>Reactants</th><th>Products</th><th></th></tr>
        </thead>
        <tbody>
          {result.tallies.map(t => (
            <tr key={t.el}>
              <td className="bal-el">{t.el}</td>
              <td>{t.left}</td>
              <td>{t.right}</td>
              <td className={t.left === t.right ? 'ok' : 'bad'}>{t.left === t.right ? '✓' : '✗'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.ambiguous && (
        <div className="module-hint bad">This equation has more than one independent balance — the combination shown is one valid answer.</div>
      )}
    </div>
  );
}
