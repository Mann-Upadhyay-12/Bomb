// The level a room plays (docs/rooms-plan.md): the host's. A room made on a level (1.2, or one from
// GENERATE LEVEL) opens that level for everyone who joins; a room made in ALL MODULES opens all
// modules. When the host picks another level, everyone in the room goes to it. A member can still look
// at another level; the room panel shows the room's and takes them back (GO TO IT).
//
// The item is `level` (roomKeys.js: levelOk / levelValue), kept across New games, written by the host
// only (api/room.js).
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { roomPart, roomWrite, inRoom, roomNow, TAB } from './roomClient.js';
import { LEVEL_KEY, levelOk, levelValue, levelSig } from './roomKeys.js';

let roomLevel = null;  // the room's level; null = none yet (a room from before levels)
let mine = null;       // the level this app shows now (App tells it through useRoomLevel)
let open = null;       // App's: show this level
let waiting = null;    // a level to show once App is ready
const listeners = new Set();
let snap = { room: null, mine: null };
function changed() {
  snap = { room: roomLevel, mine };
  listeners.forEach((l) => l());
}

const isHost = () => { const S = roomNow(); return Boolean(S.room && S.room.host === S.room.me); };

function show(v) {
  if (levelSig(v) === levelSig(mine)) return;
  if (open) open(v); else waiting = v;
}

/** The host's level is the room's: sent, and kept here at once. */
function send(v) {
  roomLevel = v;
  changed();
  roomWrite('put', { key: LEVEL_KEY, value: v }, null, { t: 'put', key: LEVEL_KEY, value: v }).catch(() => {});
}

/** The room's level from the server: kept, and shown when it is new to this app (joining, a reload, the
 *  host picking another). Re-reads of the same level (polling, a member joining) move nobody. */
function arrive(v, first) {
  if (!levelOk(v)) return;
  const fresh = levelSig(v) !== levelSig(roomLevel);
  roomLevel = v;
  changed();
  if (first || fresh) show(v);
}

roomPart({
  onItems(items, { first, created }) {
    // a room this app just made: the level on screen is the room's
    if (created) { if (mine) send(mine); return; }
    const it = items.find((i) => i.key === LEVEL_KEY);
    if (it) arrive(it.value, first);
    else if (first) { roomLevel = null; changed(); }
  },
  onMessage(msg) {
    if (msg.t !== 'put' || msg.key !== LEVEL_KEY || msg.tab === TAB) return;
    // straight from an app (not checked by the server): only the host's counts
    if (msg.fast && msg.from !== (roomNow().room || {}).host) return;
    arrive(msg.value, false);
  },
  onLeave() { roomLevel = null; waiting = null; changed(); },
});

/**
 * In App: `activeMission` is the level on screen (null = ALL MODULES); `openLevel(mission)` and
 * `openAll()` are App's own ways to change it. The host's change becomes the room's; the room's level
 * is opened here when it arrives.
 */
export function useRoomLevel(activeMission, openLevel, openAll) {
  const fns = useRef(null);
  fns.current = { openLevel, openAll };
  useEffect(() => {
    open = (v) => (v.all ? fns.current.openAll() : fns.current.openLevel(v));
    if (waiting) { const v = waiting; waiting = null; show(v); }
    return () => { open = null; };
  }, []);
  useEffect(() => {
    mine = levelValue(activeMission);
    // only a change while in the room is sent (opening the app on ALL MODULES before the room has
    // loaded isn't the host picking it)
    if (inRoom() && isHost() && levelSig(mine) !== levelSig(roomLevel)) send(mine);
    else changed();
  }, [activeMission]);
}

/** For the room panel: { room: the room's level or null, mine: this app's }. */
export const useRoomLevelInfo = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snap);

/** The room panel's GO TO IT: show the room's level. */
export function goToRoomLevel() { if (roomLevel) show(roomLevel); }
