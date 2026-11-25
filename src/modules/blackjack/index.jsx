import React, { useState } from 'react';
import { readBlackjack, encodeShape } from './blackjackVision.js';
import { RANKS, bjAdvice, bustChance, tableRows, TABLE_DEALERS, rankValue } from './blackjackSolver.js';
import { imageToData } from '../../core/level/levelVision.js';
import { useAppState } from '../../core/AppStateContext.jsx';
import { useToast } from '../../core/ToastContext.jsx';
import { useClipboard } from '../../core/useClipboard.js';
import { useAnswerGate } from '../../core/useAnswerGate.js';
import { useSharedSetting } from '../../core/sharedSetting.js';
import { useInstance } from '../../core/InstanceContext.jsx';
import { Dropzone } from '../../core/Dropzone.jsx';
import { ModuleLayout } from '../../core/components/ModuleLayout.jsx';
import { ModuleInput } from '../../core/components/ModuleInput.jsx';
import { AnswerPanel } from '../../core/components/AnswerPanel.jsx';
import { WorkingPanel } from '../../core/components/WorkingPanel.jsx';

const SHAPES_KEY = 'bombvision_blackjack_shapes'; // rank shapes learned from corrections (JSON)

function cropUri(img, b, pad = 2) {
  const c = document.createElement('canvas');
  const w = b.x1 - b.x0 + pad * 2, h = Math.round((b.y1 - b.y0) * 0.55) + pad * 2; // the top half: rank + suit
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, b.x0 - pad, b.y0 - pad, w, h, 0, 0, w, h);
  return c.toDataURL();
}

/** One card: picture (when read from a screenshot) + its rank, which can be corrected. */
function CardChip({ card, onRank, onRemove, label }) {
  return (
    <span className={`bj-card ${card.red ? 'red' : ''} ${card.unsure ? 'unsure' : ''}`} title={card.unsure ? 'Not sure about this rank — check it' : ''}>
      {card.thumb && <img src={card.thumb} alt="" />}
      <select value={card.rank || ''} aria-label={label} onChange={e => onRank(e.target.value)}>
        {!card.rank && <option value="">?</option>}
        {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {card.unsure && <span className="bj-check">check</span>}
      {onRemove && <button type="button" className="bj-x" onClick={onRemove} aria-label="remove card">✕</button>}
    </span>
  );
}

function RankButtons({ onPick, label }) {
  return (
    <span className="bj-ranks" role="group" aria-label={label}>
      {RANKS.map(r => <button key={r} type="button" className="bj-rank" onClick={() => onPick(r)}>{r}</button>)}
    </span>
  );
}

export function BlackjackModule({ isActive = true }) {
  const inst = useInstance();
  const multi = Boolean(inst && inst.multi);
  const { copyOnDecode, setLastCopyString, setLastImage } = useAppState();
  const { showToast } = useToast();
  const { copy } = useClipboard();
  const answerChanged = useAnswerGate();

  const [player, setPlayer] = useState([]); // [{ rank, unsure, thumb, glyph, red }]
  const [dealer, setDealer] = useState(null);
  const [status, setStatus] = useState({ text: '', ok: null });
  const [learnedJson, setLearnedJson] = useSharedSetting(SHAPES_KEY, '');
  const learned = React.useMemo(() => { try { return learnedJson ? JSON.parse(learnedJson) : {}; } catch (e) { return {}; } }, [learnedJson]);

  const ranks = player.map(c => c.rank).filter(Boolean);
  const advice = bjAdvice(ranks, dealer && dealer.rank);
  const answer = advice && advice.action ? advice.action : '';
  const unsure = player.some(c => c.unsure) || (dealer && dealer.unsure);

  React.useEffect(() => {
    const fresh = answerChanged(answer);
    if (!isActive) return;
    setLastCopyString(answer);
    if (copyOnDecode && fresh && answer) copy(answer);
  }, [answer, isActive]);

  const cardFrom = (img, c) => ({
    rank: c.rank, red: c.red, glyph: c.glyph, thumb: cropUri(img, c.box),
    unsure: !c.rank || c.score < 0.6 || c.margin < 0.1
  });

  const handleImage = (img, dataUri, fileBlob) => {
    setLastImage(img, fileBlob);
    let r;
    try {
      const d = imageToData(img);
      r = readBlackjack(d.data, d.width, d.height, learned);
    } catch (e) {
      setStatus({ text: `Could not read that image (${e.message || e}).`, ok: false });
      return;
    }
    if (!r.ok) { setStatus({ text: `${r.reason} — is this a Blackjack screenshot?`, ok: false }); return; }
    if (r.defuser) {
      // the defuser's screen: the dealer's up card is the face-up card in the top row
      const c = r.faceUp.find(x => x.row === 0) || r.faceUp[0];
      if (!c) { setStatus({ text: `Defuser’s screen, but no face-up card (${r.faceDown} face down).`, ok: false }); return; }
      const card = cardFrom(img, c);
      setDealer(card);
      setStatus({ text: `Defuser’s screen: dealer shows ${card.rank || '?'}${card.unsure ? ' (check it)' : ''} · ${r.faceDown} card${r.faceDown === 1 ? '' : 's'} face down`, ok: !card.unsure });
    } else {
      const cards = r.faceUp.map(c => cardFrom(img, c));
      setPlayer(cards);
      setStatus({ text: `Helper’s cards: ${cards.map(c => c.rank || '?').join(' + ')}${cards.some(c => c.unsure) ? ' · check the marked card' : ''}`, ok: !cards.some(c => c.unsure) });
    }
  };

  // a corrected rank teaches the reader that shape
  const learn = (card, rank) => {
    if (!card.glyph || card.rank === rank) return;
    const next = { ...learned, [rank]: [encodeShape(card.glyph.v), ...(learned[rank] || [])].slice(0, 4) };
    setLearnedJson(JSON.stringify(next));
  };
  const setPlayerRank = (i, rank) => {
    learn(player[i], rank);
    setPlayer(p => p.map((c, j) => (j === i ? { ...c, rank, unsure: false } : c)));
  };
  const setDealerRank = (rank) => {
    if (dealer) learn(dealer, rank);
    setDealer(d => ({ ...(d || {}), rank, unsure: false }));
  };

  const handleClear = () => {
    setPlayer([]); setDealer(null);
    setStatus({ text: '', ok: null });
    setLastImage(null, null);
    setLastCopyString('');
  };

  const rows = React.useMemo(() => tableRows(), []);
  const dv = dealer && dealer.rank ? rankValue(dealer.rank) : null;
  const rowOf = a => {
    if (!a || a.bust) return -1;
    if (a.soft) return rows.findIndex(r => r.soft && (a.total >= 19 ? r.total === 19 : a.total === 18 ? r.total === 18 : r.total === 17));
    return rows.findIndex(r => !r.soft && (a.total <= 11 ? r.total === 11 : a.total >= 17 ? r.total === 17 : r.total === a.total));
  };
  const hiRow = rowOf(advice);

  return (
    <ModuleLayout
      input={
        <ModuleInput
          controls={<button className="reset-btn" type="button" onClick={handleClear}>clear</button>}
          dropzone={
            <Dropzone
              onImage={handleImage}
              icon="🃏"
              title={multi ? 'Drop / paste a Blackjack screenshot' : 'Click here, then paste the helper’s cards or the defuser’s screen'}
              sub={<>helper’s picture = <b>your cards</b> · defuser’s picture (with face-down cards) = the <b>dealer’s up card</b></>}
            />
          }
        >
          {status.text && <div className={`bj-status ${status.ok === false ? 'warn' : ''}`}>{status.text}</div>}
          <div className="bj-row">
            <span className="bj-q">DEALER SHOWS</span>
            {dealer
              ? <CardChip card={dealer} label="dealer card" onRank={setDealerRank} onRemove={() => setDealer(null)} />
              : <RankButtons label="dealer card" onPick={setDealerRank} />}
          </div>
          <div className="bj-row">
            <span className="bj-q">YOUR CARDS</span>
            {player.map((c, i) => (
              <CardChip key={i} card={c} label={`card ${i + 1}`} onRank={r => setPlayerRank(i, r)} onRemove={() => setPlayer(p => p.filter((_, j) => j !== i))} />
            ))}
          </div>
          <div className="bj-row">
            <span className="bj-q">{player.length ? '+ ADD A CARD' : 'OR TAP THEM'}</span>
            <RankButtons label="add a card" onPick={r => setPlayer(p => [...p, { rank: r }])} />
          </div>
        </ModuleInput>
      }
      answers={
        <>
          <AnswerPanel
            label="HIT OR STAND"
            answers={answer}
            placeholder={advice && advice.bust ? 'BUST' : '— — —'}
            stats={advice ? `${advice.soft ? 'soft ' : ''}${advice.total}${dealer && dealer.rank ? ` vs ${dealer.rank}` : ''}` : null}
          />
          {advice && <div className={`bj-status ${unsure ? 'warn' : ''}`}>
            {advice.needsDealer ? 'Paste the defuser’s screen (or tap the dealer’s card) — this one depends on it.' : advice.why}
            {!advice.bust && ` · if you hit: ${Math.round(bustChance(ranks) * 100)}% chance to bust`}
            {unsure && ' · ⚠ a card rank is marked “check”'}
          </div>}
        </>
      }
      working={
        <WorkingPanel title="HIT / STAND TABLE (BASIC STRATEGY)" defaultExpanded={false}>
          <div className="bj-table-wrap">
            <table className="bj-table">
              <thead>
                <tr><th>you \ dealer</th>{TABLE_DEALERS.map(d => <th key={d} className={dv === d ? 'on' : ''}>{d === 11 ? 'A' : d}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.label} className={i === hiRow ? 'on' : ''}>
                    <th>{r.label}</th>
                    {r.cells.map((a, j) => <td key={j} className={`${a === 'HIT' ? 'hit' : 'stand'} ${i === hiRow && dv === TABLE_DEALERS[j] ? 'cell' : ''}`}>{a === 'HIT' ? 'H' : 'S'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bj-status">No manual text yet, so this is standard blackjack basic strategy with only hit / stand. An ace counts 11 unless that busts (then it’s a “soft” hand). 10, J, Q, K are all 10.</div>
          </div>
        </WorkingPanel>
      }
    />
  );
}

export const blackjackModule = {
  id: 'blackjack',
  tabId: 'tabBlackjack',
  tabLabel: '🃏 BLACKJACK',
  eyebrow: 'BLACKJACK SOLVER',
  title: 'Blackjack',
  sub: 'Paste the <b>helper’s cards</b> (your hand) and the <b>defuser’s screen</b> (the dealer’s up card) — or tap the ranks. Says <b>HIT</b> or <b>STAND</b> by blackjack basic strategy. After a hit, paste the helper’s cards again.',
  Component: BlackjackModule
};
