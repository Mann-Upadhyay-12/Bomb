// Layer 2 of a room (docs/rooms-plan.md): the answers board. Each app tells the room the answer every
// module card shows in it (AnswerPanel → noteAnswer), and the room bar lists the cards with everyone's
// answers. With mirrored cards every app should work out the same answer; when two members' answers
// for one card differ, the board shows both in red: a misread picture or a stale manual on one side.
import { useSyncExternalStore } from 'react';
import { roomPart, roomWrite, inRoom, myId, TAB } from './roomClient.js';
import { ansOf, ansKey, MAX_ANSWER_CHARS } from './roomKeys.js';

const SEND_AFTER_MS = 700; // an answer settles (a solver's second pass, a manual still loading)

// ── this app's answers ──────────────────────────────────────────────────────────────────────────
const local = new Map();       // card key "module:n" → Map(panel id → answer text)
const sent = new Map();        // card key → the answer last sent to the room
const timers = new Map();      // card key → send timer

const cardKey = (module, card) => `${module}:${card}`;
function combined(key) {
  const panels = local.get(key);
  if (!panels) return '';
  return [...panels.values()].filter(Boolean).join(' | ').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER_CHARS);
}

function queueSend(key) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    if (!inRoom()) return;
    const answer = combined(key);
    if ((sent.get(key) || '') === answer) return;
    sent.set(key, answer);
    const [module, card] = key.split(':');
    const fast = { t: 'ans', key: ansKey(module, Number(card), myId()), value: answer ? { a: answer } : null };
    roomWrite('answer', { module, card: Number(card), answer }, null, fast).catch(() => sent.delete(key));
  }, SEND_AFTER_MS));
}

/**
 * AnswerPanel calls this whenever the answer it shows changes ('' or null when it shows none, or
 * unmounts). `where` is the card ({ module, card }, RoomCard's context); `panel` tells apart two
 * answer panels in one card.
 */
export function noteAnswer(where, panel, answer) {
  if (!where || !/^[a-z0-9]{2,20}$/.test(where.module || '')) return;
  const key = cardKey(where.module, where.card || 0);
  let panels = local.get(key);
  if (!panels) { panels = new Map(); local.set(key, panels); }
  if (answer) panels.set(panel, String(answer)); else panels.delete(panel);
  if (!panels.size) local.delete(key);
  if (inRoom()) { queueSend(key); changed(); }
}

// ── everyone's answers (the room's copy) ────────────────────────────────────────────────────────
let remote = new Map();        // card key → Map(member → answer)
let version = 0;
const listeners = new Set();
function changed() { version++; listeners.forEach((l) => l()); }

function setRemote(itemKey, value) {
  const k = ansOf(itemKey);
  if (!k) return;
  const key = cardKey(k.module, k.card);
  const members = new Map(remote.get(key) || []);
  if (value && value.a) members.set(k.member, String(value.a)); else members.delete(k.member);
  if (members.size) remote.set(key, members); else remote.delete(key);
  changed();
}

roomPart({
  onItems(items, { first }) {
    if (first) remote = new Map();
    for (const it of items) if (it.key.startsWith('ans:')) setRemote(it.key, it.value);
    // joining (or back after a reload): the room hears what this app shows now
    if (first) { sent.clear(); for (const key of local.keys()) queueSend(key); }
    changed();
  },
  onMessage(msg) {
    if (msg.t !== 'ans' || !msg.key) return;
    if (msg.tab === TAB) return; // our own: shown from `local` already
    // straight from an app: only its own answers
    if (msg.fast && (ansOf(msg.key) || {}).member !== msg.from) return;
    setRemote(msg.key, msg.value);
  },
  onNewGame() { remote = new Map(); sent.clear(); timers.forEach(clearTimeout); timers.clear(); changed(); },
  onLeave() { remote = new Map(); sent.clear(); timers.forEach(clearTimeout); timers.clear(); changed(); },
});

// ── the board ───────────────────────────────────────────────────────────────────────────────────
let cache = { v: -1, me: null, rows: [] };
/** → [{ module, card, answers: [{ member, answer }], differ }], one row per card anyone has an answer
 *  for, in module then card order. This app's own answers come from what it shows now. */
function boardRows() {
  const me = myId();
  if (cache.v === version && cache.me === me) return cache.rows;
  const keys = new Set([...remote.keys(), ...local.keys()]);
  const rows = [];
  for (const key of keys) {
    const members = new Map(remote.get(key) || []);
    if (me) {
      const mine = combined(key);
      if (mine) members.set(me, mine); else members.delete(me);
    }
    if (!members.size) continue;
    const [module, card] = key.split(':');
    const answers = [...members].map(([member, answer]) => ({ member, answer }));
    const norm = (s) => s.toUpperCase().replace(/\s+/g, ' ').trim();
    rows.push({ module, card: Number(card), answers, differ: new Set(answers.map((a) => norm(a.answer))).size > 1 });
  }
  rows.sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : a.card - b.card));
  cache = { v: version, me, rows };
  return rows;
}
export const useAnswerBoard = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, boardRows);

/** Opens a module card (the board's rows): App.jsx switches to the module and shows the card. */
export function openCard(module, card) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('bb:open-card', { detail: { module, card } }));
}
