// 👥 ROOM in the top bar: create a room (2, 3 or 4 players), join one by code or invite link, see who's
// in it, and what the room shares this game (docs/rooms-plan.md §1). Status is said in the bar itself
// (the bomb app has no toasts). Shown on the site to everyone (never in the offline bomb.html); rooms are
// the one part that needs a Discord login, so a guest's panel is a login button.
import React, { useEffect, useRef, useState } from 'react';
import {
  useRoom, roomsAvailable, bootRoom, createRoom, joinRoom, leaveRoom, endRoom, lockRoom, setRole, nameOf,
  inviteLine, setNewGameFn, loginHref, recheckAccess, pendingInvite, kickMember,
} from './roomClient.js';
import { useAnswerBoard, openCard } from './roomBoard.js';
import { useRoomFromAll, shareMine } from './roomSync.js';
import { useSharedCards, useCardUpdating } from './roomCards.js';
import { useRoomLevelInfo, goToRoomLevel } from './roomLevel.js';
import { useRoomTiming, timingLines } from './roomTiming.js';
import { roomKeyLabel, showCode, levelName, levelSig } from './roomKeys.js';
import { startNewGame } from '../newGame.js';
import { MODULE_REGISTRY } from '../moduleRegistry.js';

setNewGameFn(startNewGame);

const moduleLabel = (id) => {
  const m = MODULE_REGISTRY.find((x) => x.id === id);
  return m ? m.name : id;
};
const ROLES = { defuser: '💣 DEFUSER', helper: '📖 HELPER' };

function ago(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function Avatar({ member }) {
  const [broken, setBroken] = useState(false);
  if (member.avatar && !broken) {
    return <img className="room-avatar" alt="" src={`https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png?size=64`} onError={() => setBroken(true)} referrerPolicy="no-referrer" />;
  }
  return <span className="room-avatar room-avatar-letter">{(member.name || '?').slice(0, 1).toUpperCase()}</span>;
}

/** A button that needs a second press within 4 s (End room). */
function TwoPress({ className, children, again, onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? 'armed' : ''}`} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? again : children}
    </button>
  );
}

const GATES = {
  waiting: ['⏳', 'You’re logged in. The owner has to let your account into rooms first.'],
  blocked: ['🔒', 'Rooms are off for this account. Everything else works as always.'],
  expired: ['⌛', 'Your time with rooms ran out. Ask the owner for more.'],
  error: ['⚠', 'The site couldn’t check your account just now.'],
};

/** Not logged in, or not allowed into rooms yet: what to do about it. */
function Gate({ gate }) {
  const invite = pendingInvite();
  const [checking, setChecking] = useState(false);
  const again = async () => { setChecking(true); try { await recheckAccess(); } finally { setChecking(false); } };
  if (gate === 'guest') {
    return (
      <>
        <div className="room-blurb">
          {invite
            ? <>You’re invited to room <b>{showCode(invite)}</b>. Rooms need a Discord login; you’ll come straight back here and join.</>
            : <>Play one bomb together: everyone in a room gets the manuals, the module pictures and the module counts that anyone pastes. Rooms need a Discord login; everything else works without one.</>}
        </div>
        <div className="room-row">
          <a className="room-btn primary room-login" href={loginHref()}>LOG IN WITH DISCORD</a>
          <span className="room-hint">the site only learns your name and avatar</span>
        </div>
      </>
    );
  }
  const [icon, text] = GATES[gate] || GATES.blocked;
  return (
    <>
      <div className="room-blurb">{icon} {text}</div>
      <div className="room-row">
        <button type="button" className="room-btn" disabled={checking} onClick={again}>{checking ? '…' : '↻ CHECK AGAIN'}</button>
        <a className="room-btn" href="/api/auth/logout">LOG OUT</a>
      </div>
    </>
  );
}

/** The level the room plays: the host picks it (the level they're on); a member who wandered off gets
 *  a way back. */
function LevelRow({ host }) {
  const { room, mine } = useRoomLevelInfo();
  if (!room) return null;
  const away = levelSig(room) !== levelSig(mine);
  return (
    <div className="room-row">
      <span className="room-label">LEVEL</span>
      <b>{levelName(room)}</b>
      {host
        ? <span className="room-hint">yours: everyone in the room is on it, and follows when you pick another</span>
        : away
          ? <><span className="room-hint">you’re on {levelName(mine)}</span><button type="button" className="room-btn" onClick={goToRoomLevel}>GO TO IT</button></>
          : <span className="room-hint">the host’s pick</span>}
    </div>
  );
}

function OutOfRoom({ status }) {
  const [size, setSize] = useState(4);
  const [code, setCode] = useState('');
  const { mine } = useRoomLevelInfo();
  const busy = status === 'joining';
  return (
    <>
      <div className="room-blurb">One bomb, together: everyone in a room gets the manuals, the module pictures and the module counts that anyone pastes. 2–4 players.</div>
      <div className="room-row">
        <span className="room-label">PLAYERS</span>
        {[2, 3, 4].map((n) => (
          <button key={n} type="button" className={`room-chip ${n === size ? 'on' : ''}`} onClick={() => setSize(n)} aria-pressed={n === size}>{n}</button>
        ))}
        <button type="button" className="room-btn primary" disabled={busy} onClick={() => createRoom(size)}>{busy ? '…' : '＋ CREATE ROOM'}</button>
      </div>
      {mine && <div className="room-hint">A room you make plays <b>{levelName(mine)}</b>: everyone who joins opens it. Pick a level in MISSION first to play that one.</div>}
      <form className="room-row" onSubmit={(e) => { e.preventDefault(); joinRoom(code); }}>
        <span className="room-label">CODE</span>
        <input
          className="room-code-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7QX-2M"
          autoCapitalize="characters" autoComplete="off" spellCheck="false" maxLength={80} aria-label="Room code"
        />
        <button type="submit" className="room-btn" disabled={busy || !code.trim()}>JOIN</button>
      </form>
    </>
  );
}

/** The answers board: every card anyone has an answer for, with each member's answer. Answers that
 *  differ between members are red (one of them misread the picture, or has a stale manual). */
/** ⏳ on a board row while a teammate's new picture for that card is read (the answers are about to change). */
function Updating({ module, card }) {
  const u = useCardUpdating(module, card);
  return u ? <span className="room-from room-board-updating">⏳ UPDATING</span> : null;
}

function Board({ room, cards }) {
  const rows = useAnswerBoard();
  if (!rows.length) return null;
  const many = new Set(rows.map((r) => r.module).filter((m, i, all) => all.indexOf(m) !== i));
  const pictureFrom = (r) => cards.find((c) => c.module === r.module && c.card === r.card);
  const who = (id) => (id === room.me ? 'YOU' : nameOf(id).toUpperCase());
  return (
    <div className="room-shared room-board">
      <div className="room-label">ANSWERS</div>
      {rows.map((r) => {
        const pic = pictureFrom(r);
        const label = `${moduleLabel(r.module)}${many.has(r.module) || r.card > 0 ? ` #${r.card + 1}` : ''}`;
        return (
          <button key={`${r.module}:${r.card}`} type="button" className={`room-board-row ${r.differ ? 'differ' : ''}`}
            onClick={() => openCard(r.module, r.card)} title={r.differ ? 'The answers differ: open the card and check its picture and manual' : 'Open this card'}>
            <span className="room-board-card">{label}</span>
            {r.differ
              ? <span className="room-board-ans">{r.answers.map((a) => <span key={a.member} className="room-board-one"><b>{who(a.member)}</b> {a.answer}</span>)}</span>
              : <span className="room-board-ans">{r.answers[0].answer}{r.answers.length > 1 ? <span className="room-board-same"> ✓ {r.answers.length} agree</span> : null}</span>}
            {pic && <span className="room-from">PICTURE FROM {pic.from === room.me ? 'YOU' : nameOf(pic.from).toUpperCase()}</span>}
            <Updating module={r.module} card={r.card} />
          </button>
        );
      })}
    </div>
  );
}

/** TIMING: how long things take, measured on this device (roomTiming.js). COPY TIMINGS puts the lines
 *  on the clipboard, to paste into a chat. */
function Timing({ room }) {
  const t = useRoomTiming();
  const [copied, setCopied] = useState('');
  const who = (id) => (id === room.me ? 'you' : nameOf(id));
  const lines = timingLines(t, { me: room.me, members: room.members.map((m) => m.id), who, label: moduleLabel });
  if (!lines.length) return null;
  const copy = async () => {
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const head = `Bomb room timings · ${nameOf(room.me)} · ${touch ? 'phone' : 'computer'} · ${new Date().toLocaleString()}`;
    try { await navigator.clipboard.writeText([head, ...lines].join('\n')); setCopied('✓ copied'); }
    catch (e) { setCopied('select the lines and copy them'); }
  };
  return (
    <div className="room-shared room-timing">
      <div className="room-row">
        <span className="room-label">TIMING (THIS DEVICE)</span>
        <span className="room-spacer" />
        <button type="button" className="room-btn" onClick={copy}>📋 COPY TIMINGS</button>
        {copied && <span className="room-hint">{copied}</span>}
      </div>
      {lines.map((line, i) => <div key={i} className="room-timing-line">{line}</div>)}
    </div>
  );
}

function InRoom({ S }) {
  const { room, online, role } = S;
  const host = room.host === room.me;
  const from = useRoomFromAll();
  const cards = useSharedCards();
  const [copied, setCopied] = useState('');
  const [sent, setSent] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []); // "2 min ago"

  const copyInvite = async () => {
    const line = inviteLine(room);
    try { await navigator.clipboard.writeText(line); setCopied('✓ COPIED — PASTE IT IN DISCORD'); }
    catch (e) { setCopied(line); } // no clipboard: show it to copy by hand
  };
  const shared = Object.entries(from)
    .map(([key, v]) => ({ key, label: roomKeyLabel(key), ...v }))
    .filter((x) => x.label)
    .sort((a, b) => b.at - a.at);

  return (
    <>
      <div className="room-row room-title-row">
        <span className="room-title">ROOM{host ? ` ${showCode(room.code)}` : ''}</span>
        <span className="room-count">{room.members.length}/{room.size}{room.locked ? ' · 🔒 LOCKED' : ''}</span>
        {host && <button type="button" className="room-btn" onClick={copyInvite}>📋 COPY INVITE</button>}
        {host && <button type="button" className="room-btn" onClick={() => lockRoom(!room.locked)}>{room.locked ? '🔓 UNLOCK' : '🔒 LOCK'}</button>}
      </div>
      {copied && <div className={copied.startsWith('✓') ? 'room-ok' : 'room-invite-line'}>{copied}</div>}
      {!host && <div className="room-note">Only the host ({nameOf(room.host)}) can invite people, pick the level and start a new game.</div>}
      <LevelRow host={host} />

      <ul className="room-members">
        {room.members.map((m) => {
          const on = online[m.id];
          return (
            <li key={m.id} className={`room-member ${on ? 'online' : ''}`}>
              <Avatar member={m} />
              <span className="room-dot" title={on ? 'online' : 'not connected'} />
              <span className="room-name">{m.name}{m.id === room.me ? ' (you)' : ''}</span>
              {m.id === room.host && <span className="room-tag host">HOST</span>}
              {on && on.role && ROLES[on.role] && <span className="room-tag">{ROLES[on.role]}</span>}
              {on && on.module && <span className="room-where">{moduleLabel(on.module)}</span>}
              {host && m.id !== room.me && (
                <TwoPress className="room-kick" again="KICK?" onConfirm={() => kickMember(m.id)}>✕</TwoPress>
              )}
            </li>
          );
        })}
      </ul>

      <div className="room-row">
        <span className="room-label">YOU ARE</span>
        {Object.entries(ROLES).map(([k, label]) => (
          <button key={k} type="button" className={`room-chip ${role === k ? 'on' : ''}`} aria-pressed={role === k} onClick={() => setRole(role === k ? '' : k)}>{label}</button>
        ))}
        <span className="room-hint">only a label: anyone can paste anything</span>
      </div>

      <Board room={room} cards={cards} />

      <div className="room-shared">
        <div className="room-label">SHARED THIS GAME</div>
        {!shared.length && !cards.length && <div className="room-hint">Nothing yet. Manuals and module pictures anyone pastes show up here, and in everyone’s app.</div>}
        {shared.map((x) => (
          <div key={x.key} className="room-shared-row"><span>{x.label}</span><span className="room-from">FROM {x.from === room.me ? 'YOU' : nameOf(x.from).toUpperCase()} · {ago(x.at)}</span></div>
        ))}
        {cards.map((c) => (
          <div key={`${c.module}:${c.card}`} className="room-shared-row">
            <span>{moduleLabel(c.module)} #{c.card + 1}{c.n > 1 ? ` · ${c.n} pictures` : ''}</span>
            <span className="room-from">FROM {c.from === room.me ? 'YOU' : nameOf(c.from).toUpperCase()}{c.at ? ` · ${ago(c.at)}` : ''}</span>
          </div>
        ))}
      </div>

      <Timing room={room} />

      <div className="room-row room-actions">
        <button type="button" className="room-btn" onClick={() => setSent(shareMine())} title="Joining doesn't send what you already had (it may be from the last game). This sends it on purpose.">⇪ SHARE MY MANUALS</button>
        {sent != null && <span className="room-hint">{sent ? `sent ${sent}` : 'nothing to send'}</span>}
        <span className="room-spacer" />
        <button type="button" className="room-btn" onClick={() => leaveRoom()}>LEAVE</button>
        {host && <TwoPress className="room-btn danger" again="PRESS AGAIN TO END" onConfirm={() => endRoom()}>END ROOM</TwoPress>}
      </div>
    </>
  );
}

export function RoomBar() {
  const S = useRoom();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const available = roomsAvailable();

  useEffect(() => { if (available) bootRoom(); }, [available]);
  // an invite link opened while logged out (or not allowed yet): open the panel to say what to do
  useEffect(() => { if (available && S.gate && pendingInvite()) setOpen(true); }, [available, S.gate]);
  // a click outside or Escape closes the panel
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!available) return null;
  const { room, status, error, note } = S;
  const liveWord = status === 'live' ? 'LIVE' : status === 'polling' ? 'CONNECTING…' : '';

  return (
    <div className="room-wrap" ref={wrap}>
      <button
        type="button"
        className={`room-bar-btn ${room ? 'in' : ''} ${status}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={room ? 'Your room: who is in it and what it shares' : S.gate === 'guest' ? 'Play one bomb together with friends (needs a Discord login)' : 'Play one bomb together with friends'}
      >
        <span>👥</span>
        {room
          ? <span>{room.host === room.me ? showCode(room.code) : 'ROOM'} · {room.members.length}/{room.size}</span>
          : <span>ROOM</span>}
        {room && <span className={`room-live ${status}`} title={liveWord} />}
      </button>
      {open && (
        <div className="room-panel" role="dialog" aria-label="Room">
          {S.gate ? <Gate gate={S.gate} /> : room ? <InRoom S={S} /> : <OutOfRoom status={status} />}
          {(error || note || liveWord) && (
            <div className={`room-status ${error ? 'bad' : ''}`}>
              {error || note || (status === 'live' ? '● LIVE — changes reach everyone within a second' : 'Connecting to the room… (changes still arrive every few seconds)')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
