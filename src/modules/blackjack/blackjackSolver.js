// Blackjack: hit or stand. The helper sees the player's cards, the defuser sees the dealer's up card.
// No manual text yet, so this is standard blackjack basic strategy with only HIT / STAND (no double,
// split or surrender), counting an ace as 11 while that doesn't bust the hand.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rankValue = r => (r === 'A' ? 11 : ['10', 'J', 'Q', 'K'].includes(r) ? 10 : Number(r));

/** Total of a hand; soft = an ace is counted as 11. */
export function handTotal(ranks) {
  let t = 0, aces = 0;
  for (const r of ranks) {
    if (r === 'A') { aces++; t += 1; } else t += rankValue(r);
  }
  const soft = aces > 0 && t + 10 <= 21;
  return { total: soft ? t + 10 : t, soft };
}

const dealerName = d => (d === 11 ? 'A' : String(d));

/** STAND or HIT for a total against the dealer's up-card value (2–11), with the reason. */
function decide(total, soft, d) {
  if (total >= 21) return { action: 'STAND', why: total === 21 ? '21 — stand' : '' };
  if (soft) {
    if (total >= 19) return { action: 'STAND', why: `soft ${total}: always stand` };
    if (total === 18) return d <= 8
      ? { action: 'STAND', why: 'soft 18: stand against 2–8' }
      : { action: 'HIT', why: 'soft 18: hit against 9, 10, A' };
    return { action: 'HIT', why: `soft ${total}: always hit (an ace can't make you bust)` };
  }
  if (total >= 17) return { action: 'STAND', why: `${total}: always stand` };
  if (total <= 11) return { action: 'HIT', why: `${total}: always hit (no card can make you bust)` };
  if (total === 12) return d >= 4 && d <= 6
    ? { action: 'STAND', why: '12: stand against 4–6 (the dealer is likely to bust)' }
    : { action: 'HIT', why: '12: hit against 2, 3 and 7–A' };
  return d <= 6
    ? { action: 'STAND', why: `${total}: stand against 2–6 (the dealer is likely to bust)` }
    : { action: 'HIT', why: `${total}: hit against 7–A` };
}

/**
 * player: ranks; dealer: rank | null.
 * → null (no cards) | { action: 'HIT'|'STAND'|null, total, soft, bust, why, needsDealer, ifLow, ifHigh }
 */
export function bjAdvice(player, dealer) {
  if (!player || !player.length) return null;
  const { total, soft } = handTotal(player);
  if (total > 21) return { action: null, total, soft, bust: true, why: `${total} — bust` };
  if (dealer) {
    const d = rankValue(dealer);
    return { ...decide(total, soft, d), total, soft, bust: false, dealer: dealerName(d) };
  }
  // no dealer card yet: answer only if every dealer card gives the same answer
  const all = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(d => decide(total, soft, d));
  if (all.every(a => a.action === all[0].action)) return { ...all[0], total, soft, bust: false };
  return { action: null, total, soft, bust: false, needsDealer: true, why: 'depends on the dealer’s card' };
}

/** Chance the next card busts the hand (each rank equally likely). */
export function bustChance(player) {
  if (!player || !player.length) return 0;
  return RANKS.filter(r => handTotal([...player, r]).total > 21).length / RANKS.length;
}

/** The hit/stand table (rows: hard 12–16, soft 17–18) for the working panel. */
export const TABLE_DEALERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export function tableRows() {
  const rows = [];
  rows.push({ label: '≤ 11', total: 11, soft: false });
  for (let t = 12; t <= 16; t++) rows.push({ label: String(t), total: t, soft: false });
  rows.push({ label: '17+', total: 17, soft: false });
  rows.push({ label: 'soft ≤ 17', total: 17, soft: true });
  rows.push({ label: 'soft 18', total: 18, soft: true });
  rows.push({ label: 'soft 19+', total: 19, soft: true });
  return rows.map(r => ({ ...r, cells: TABLE_DEALERS.map(d => decide(r.total, r.soft, d).action) }));
}
