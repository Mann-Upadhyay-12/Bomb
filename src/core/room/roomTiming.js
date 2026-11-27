// The room panel's TIMING lines (docs/rooms-architecture.md §9.1): how long things take, measured on this
// device, so one real game shows where the time goes.
//   - the live link to each teammate: this app pings on the live channel every 20 s and their app answers
//     (round trip). The answer also says how far their clock is from ours, so their changes' trip here
//     can be timed.
//   - each picture a teammate pastes: which way it came (fast, or from the server), its trip here, the
//     download (server way), when it was in the card, and when the card's answer changed
//   - a shared-reading card (roomCards.js): when the teammate's reading came in (they read it, not us)
//   - each picture pasted here: when the card's answer changed (this device's reading)
//   - the last small change from a teammate (a tap, a manual): its trip here
// Nothing is sent anywhere: COPY TIMINGS in the panel puts the lines on the clipboard.
import { useSyncExternalStore } from 'react';

const MAX_PICS = 8;
const ANSWER_WAIT_MS = 20000; // no answer change by then: "same or no answer" (a first picture of two …)
const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const ms = (v) => (v == null || !Number.isFinite(v) ? null : Math.max(0, Math.round(v)));

let snap = { links: {}, pics: [], change: null };
const listeners = new Set();
function changed(patch) {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
}
/** { links: { id: { rtt, offset, n } }, pics: [record, … newest first], change: { from, key, trip, at } | null } */
export const useRoomTiming = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snap);
export const roomTimingNow = () => snap;

// ── the live link to each teammate ──────────────────────────────────────────────────────────────
const samples = new Map(); // member id → the last 5 { rtt, offset }

/** A teammate answered our ping: rtt (ms) and offset = their clock − ours. */
export function linkMeasured(id, rtt, offset) {
  if (!id || !Number.isFinite(rtt) || !Number.isFinite(offset) || rtt < 0 || rtt > 60000) return;
  const list = [...(samples.get(id) || []), { rtt, offset }].slice(-5);
  samples.set(id, list);
  const best = list.reduce((a, b) => (b.rtt < a.rtt ? b : a)); // the quickest answer tells the clocks best
  const sorted = list.map((s) => s.rtt).sort((a, b) => a - b);
  changed({ links: { ...snap.links, [id]: { rtt: ms(sorted[Math.floor(sorted.length / 2)]), offset: best.offset, n: list.length } } });
}

/** The trip here of a message a teammate sent at `sentAt` (their clock), in ms; null until a ping has
 *  told how far their clock is from ours. */
export function tripFrom(id, sentAt) {
  const l = snap.links[id];
  if (!l || !Number.isFinite(sentAt)) return null;
  const t = Date.now() - (sentAt - l.offset);
  return t > -100 && t < 60000 ? Math.max(0, Math.round(t)) : null;
}

/** A small change from a teammate came the fast way (a tap, a manual, a count …). */
export function changeArrived(from, sentAt, key) {
  changed({ change: { from, key: String(key || ''), trip: tripFrom(from, sentAt), at: Date.now() } });
}

// ── pictures ────────────────────────────────────────────────────────────────────────────────────
const byId = new Map(); // entry id → its record (only the ones still listed)

function add(rec) {
  byId.set(rec.id, rec);
  const pics = [rec, ...snap.pics.filter((p) => p.id !== rec.id)].slice(0, MAX_PICS);
  for (const id of [...byId.keys()]) if (!pics.some((p) => p.id === id)) byId.delete(id);
  changed({ pics });
  const t = setTimeout(() => {
    if (rec.done) return;
    rec.done = true;
    changed({ pics: [...snap.pics] });
  }, ANSWER_WAIT_MS);
  if (t && t.unref) t.unref();
}
function update(id, fn) {
  const rec = byId.get(id);
  if (!rec) return;
  fn(rec);
  changed({ pics: [...snap.pics] });
}

/** A teammate's picture reached this app (card = 'card:<module>:<n>'). via: 'fast' | 'server'. */
export function picArrived(card, id, { from, via, sentAt } = {}) {
  if (!id || byId.has(id)) return; // the second copy of one picture
  add({ id, card, from, via, own: false, t0: perf(), wall: Date.now(), trip: via === 'fast' ? tripFrom(from, sentAt) : null, fetch: null, load: null, read: null, answer: null, done: false });
}
/** A picture pasted here, as the card hands it to the room. */
export function picOwn(card, id) {
  if (!id) return;
  add({ id, card, from: null, via: 'here', own: true, t0: perf(), wall: Date.now(), trip: null, fetch: null, load: 0, read: null, answer: null, done: false });
}
/** Downloading a teammate's picture from the server took this long. */
export function picFetched(id, took) { update(id, (r) => { r.fetch = ms(took); }); }
/** The picture is in the card (the module has it). */
export function picLoaded(id) { update(id, (r) => { if (r.load == null) r.load = ms(perf() - r.t0); }); }

/** A teammate's reading of their picture came in (a shared-reading card). */
export function picRead(id) { update(id, (r) => { if (r.read == null) r.read = ms(perf() - r.t0); r.done = true; }); }

/** The answer a card shows changed (roomBoard.noteAnswer): the newest picture of that card still
 *  waiting gets its time. */
export function answered(card) {
  const rec = snap.pics.find((p) => p.card === card && !p.done && p.load != null);
  if (!rec) return;
  update(rec.id, (r) => { r.answer = ms(perf() - r.t0); r.done = true; });
}

/** For the tests and a room change: forget everything. */
export function resetRoomTiming() {
  samples.clear();
  byId.clear();
  changed({ links: {}, pics: [], change: null });
}

// ── the lines the panel shows (and COPY TIMINGS copies) ──────────────────────────────────────────
const cardName = (card, label) => {
  const m = /^card:([a-z0-9]{2,20}):(\d)$/.exec(card || '');
  return m ? `${label(m[1])} #${Number(m[2]) + 1}` : card;
};
const msText = (v) => (v == null ? '?' : `${v} ms`);

/**
 * The timing line as text, one entry per line. who(id) → a name, label(module) → the module's name,
 * members → the ids in the room now (the link line lists them), me → this player's id.
 */
export function timingLines(t, { me, members = [], who = (id) => id, label = (m) => m, now = Date.now() } = {}) {
  const lines = [];
  const mates = members.filter((id) => id !== me);
  if (mates.length) {
    const parts = mates.map((id) => `${who(id)} ${t.links[id] ? msText(t.links[id].rtt) : 'not measured yet'}`);
    lines.push(`Live link, there and back: ${parts.join(' · ')}`);
  }
  for (const p of t.pics) {
    const bits = [cardName(p.card, label)];
    if (p.own) bits.push('pasted here');
    else {
      bits.push(`from ${who(p.from)}`);
      bits.push(p.via === 'fast' ? 'fast way' : 'from the server');
      if (p.via === 'fast') bits.push(`trip ${p.trip == null ? '? (no ping yet)' : `${p.trip} ms`}`);
      if (p.fetch != null) bits.push(`download ${p.fetch} ms`);
      if (p.read != null) { bits.push(`their reading in after ${p.read} ms`); lines.push(bits.join(' · ')); continue; }
      bits.push(p.load == null ? (p.done ? 'no reading came' : 'waiting…') : `in the card after ${p.load} ms`);
    }
    if (p.answer != null) bits.push(`answer after ${p.answer} ms`);
    else if (p.load != null) bits.push(p.done ? 'same or no new answer' : 'reading…');
    lines.push(bits.join(' · '));
  }
  if (t.change) {
    const ago = Math.max(0, Math.round((now - t.change.at) / 1000));
    lines.push(`Last tap or text from ${who(t.change.from)}: trip ${t.change.trip == null ? '? (no ping yet)' : `${t.change.trip} ms`} · ${ago} s ago`);
  }
  return lines;
}
