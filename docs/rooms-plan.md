# Colab mode: rooms (plan, to build by hand)

Written 2026-11-25. It's for the "squad mode" idea from 2026-11-24, with the change asked for that
day: players make a **room** (a lobby with a code), and only people in that room share data. It
is not one big pool that everyone's data goes into.

Nothing here is built yet. The file names are where each piece would go in this repo.

## Decisions (2026-11-25)

| Question | Answer |
|---|---|
| Who can create a room | **Everyone** who is logged in |
| Room size | **2–4.** The host picks 2, 3 or 4 when creating; 4 is the most |
| Invites | **The host** invites: the code and the invite link are shown to the host only |
| What is shared | **Everything** about the game while you're in a room: manuals, word lists, module pictures, counts, what's typed or tapped in a module, answers |
| Who can press New game in a room | **Only the host** |
| Answers board and pictures in the first version | **Yes.** The defuser pastes the bomb's module pictures and the helper pastes the manuals, in the same room. They work together through the app, and the Discord game channel stays clean |
| Heist | **Stays out** |

Both confirmed: the host picks the size, and the module cards are mirrored (layer 3).

What stays on each device: only things that aren't the game. That's your theme, auto-copy, the needy
reminder, which modules the picker hides, and the letter shapes the app has learned. They're about your
device and your taste, and sharing them would restyle a friend's app.

---

## 1. What players see

1. **Create.** Someone presses **👥 ROOM → Create room** in the top bar, next to the serial and
   NEW GAME. They pick the size (2, 3 or 4; 4 is the default). The app shows the room's code:
   `K7QX-2M`.
2. **Invite (host only).** The host's **📋 Copy invite** button copies a Discord-ready line:
   `Join my bomb room: K7QX2M → https://<site>/#play=bomb&room=K7QX2M`
   - Members don't see the code or the button.
   - After joining, the app takes `room=` out of the address bar, so a member can't pass the room on
     by accident. The host can also lock the room.
3. **Join.** A friend opens the link, or presses **👥 ROOM → Join** and types the code. They have
   to be logged in, as for the rest of the site. A full room says `ROOM FULL (4/4)`.
4. **In the room.** The room bar shows each member's Discord avatar, a dot for who is online, and
   the module they have open right now.
   - Each member can tag themselves **💣 Defuser** or **📖 Helper**. That's only a label: anyone
     can paste anything.
5. **The helper pastes manuals.** The serial, the Astrology map and list, the Laundry manual, the
   Circuit, Knobs and Wire Sequence tables, and the rest of the per-game data reach everyone within
   a second. Each one says where it came from, e.g. `FROM YUZA · 2 min ago`.
6. **The defuser pastes the bomb's modules.** A Password screenshot pasted into Password #2 shows
   up in Password #2 in everyone's app (the mirrored cards in layer 3). Each app has the manual and
   the module picture, so each one works out the same answer by itself.
7. **Room board.** A list in the room bar: every module card, who pasted its picture, and its
   answer. `PASSWORD #2 · CLOCK · Dixie`. Tap a row to jump to that card.
8. **New game:** only the host can press it. It clears the game data for the whole room (more in
   section 8).
9. **Leave.** Each member can leave. The host can **End room**, which closes it for everyone.
   Rooms close by themselves after 6 hours with no activity.

Each room is its own space. Two squads playing two bombs at the same time never see each other's
manuals or modules. One person is in at most one room at a time. Solo play works exactly as now.

---

## 2. Room generation

| Thing | Choice | Why |
|---|---|---|
| Code | 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 characters: no 0/O, 1/I/L) | Easy to read out on Discord voice and to type on a phone. 31⁶ ≈ 887 million codes |
| Shown as | `K7QX-2M` | Easier to read. Typed with or without the dash, any case |
| Made by | the server (`crypto.getRandomValues`, rejection sampling so every character is equally likely) | The client never picks codes |
| Unique | among **open** rooms only (`unique (code) where ended_at is null`) | A code is free again once its room ends |
| Collision | try again (the database's unique index says so) up to 5 times | Almost never happens |
| Secret topic | a second random value, 128 bits, that only members get | The live channel's name. Knowing the code isn't enough to listen; you have to join through the server |
| Who can create | everyone who is logged in and allowed (`accessFor` → allowed) | Decided 2026-11-25 |
| Size | the host picks 2, 3 or 4 (4 is the default); the host counts | Decided 2026-11-25 |
| Lifetime | ends when the host ends it, or 6 h after the last write or join | Old rooms clean themselves up |
| Host | the creator; passed to the longest-joined member if the host leaves | Someone can always end or lock the room, and start a new game |
| Lock | the host can lock the room: no new joins | For when the squad is complete |

---

## 3. What is shared: four layers (1–3 in the first version, 4 right after)

### Layer 1: game data (the helper's side)

This is the list `src/core/newGame.js` already keeps, since it's exactly "what changes every game":

- `GAME_SAVED`: the serial, Astrology map and list, Circuit legend, Knobs table, Wire Sequence
  table, Piano codes, Button checklist, Hangman words, Logic values.
- `GAME_MEMORY`: the Simon table, Batteries table, Wire Placement table, Laundry manual, and Button
  facts.
- The Maze manual strip (`mazeManualStore`) and the Symbols helper grids (`stripStore`).

Almost all of it goes through **one file**, `src/core/sharedSetting.js` (`setSharedSetting`,
`useSharedState`'s setter). That's the one place to hook in.

```js
// src/core/room/roomSync.js (sketch)
export const ROOM_KEYS = new Set([...GAME_SAVED, ...GAME_MEMORY].map(([k]) => k));
// sharedSetting.js calls this after every local set:
export function localSet(key, value) {
  if (!inRoom() || !ROOM_KEYS.has(key) || applyingRemote) return;
  queuePut(key, value);           // debounced ~300 ms per key (typing in a manual box)
}
// a message from the room → apply without sending it back (no echo loop)
function onRemote({ key, value, from, at }) {
  applyingRemote = true;
  // setSharedSetting for GAME_SAVED keys; for GAME_MEMORY keys add a setSharedState(key, value)
  // export to sharedSetting.js, next to peekSharedState (the ⚑ report added that one)
  try { /* apply */ } finally { applyingRemote = false; }
  provenance.set(key, { from, at });  // for the "FROM YUZA" chip
}
```

The word lists that stay the same every game are shared too (everything is shared in a room).
That's Password (`bombvision_password_words`), Who's on First (`bombvision_wof_rules_v2`) and
Word Search (`bombvision_search_words_v2`). Put them in a `ROOM_KEPT` list next to `ROOM_KEYS`.
- They aren't cleared by New game, so a room keeps them across games.
- On joining, the room's copy wins, as for the rest.

Not shared: the device's own settings (theme, auto-copy, needy reminder, hidden modules), learned
letter shapes, and Heist.

### Layer 2: answers board

- 28 of the 31 modules show their answer through `AnswerPanel`. Make it publish
  `{ module, card, answer, at }` when the answer changes. `report.js` already finds answers the same
  way, through `.stamp-word`.
- With mirrored cards, every app should work out the same answer. When two members' answers for the
  same card **differ**, the board shows both in red. That catches a misread picture or a stale
  manual on one side.

### Layer 3: mirrored module cards (the defuser's side)

**What changed from the first draft:**
- The first draft kept everyone's modules separate and put pictures only on the board, behind an
  "Open in my app" button. That was meant for several people solving different modules on their own.
- That isn't how you play. One bomb is shared: the defuser sees it and the helper sees the manuals.
  Password #2 is the same physical module for everyone.
- So in a room, **the module cards are the room's cards**.

| What | In a room |
|---|---|
| "Modules to solve" count for each module (App's `setGroupCounts`) | shared, so everyone has the same Password #1–#4 |
| A picture pasted into a card | uploaded and sent to the room. Every app loads it into the same card through the existing `InstanceContext.inject` |
| A card's CLEAR | clears that card for the room (it's one module) |
| What the solver does with it | runs on every device (no answers are sent to make answers; the board only compares them) |

Where pictures come from:
- Every picture a module takes goes through one spot: `took()` in `src/core/Dropzone.jsx`, the same
  spot the ⚑ report uses (`noteInput`). Hook in there.
- A **link** (phones paste Discord links) is shared as it is.
- A **file** (a PC Ctrl+V or a drop) goes to `/api/room/picture`. A 440×440 module picture is
  100–300 KB, far under Vercel's 4.5 MB request limit.
  - The server stores it in a private Supabase Storage bucket at `rooms/<room>/<id>.png`.
  - It sends members a signed link valid for a day.
  - The room's pictures are deleted when it ends.

Two members pasting into the same card at once: the last one wins, and both see it. That's the same
as two people pasting the same manual.

### Layer 4: what's typed or tapped inside a module

Pictures aren't the only input. Most modules also take something by hand. Examples:
- Hangman's guessed letters;
- Simon's presses;
- Password letters typed in;
- Complex Wires' switches;
- Battleship's shots;
- a corrected misread.

"Everything is shared" includes these. They live inside each module (its own `useState`), so they
need one change per module, not one central hook:

```js
// src/core/room/useCardState.js (sketch)
// Solo: exactly useState. In a room: the value is the room's, for this module + card + name.
export function useCardState(name, initial) {
  const inst = useInstance();                       // card number in a group
  const key = `state:${moduleId}:${inst ? inst.index : 0}:${name}`;
  // solo → useState(initial); room → value from the room store, set() also queues a put (debounced)
}
```

In each module, swap `useState` → `useCardState` for the inputs that a teammate should see. Leave
purely visual state alone (which panel is open, hover). A quick count of the hand inputs in each
module's `.jsx` (`<input>`, `<textarea>`, `<select>`, and tap handlers that set state) puts the
most work in:
- Complex Wires (9);
- Batteries (8);
- Diagram (7);
- Wire Placement, Button and Piano (6 each);
- Laundry and Symbols (5 each).

Chess, Cube, Limbo, Mines, Morse and Queens take only pictures, so layer 3 already covers them.

---

## 4. How it's wired

```
 player's browser                       Vercel (api/)                         Supabase
 ───────────────                       ─────────────                         ────────
 👥 ROOM bar ── POST /api/room/create ─▶ session ✓ access ✓ ──insert──▶ bomb_rooms / members
             ── POST /api/room/join ───▶ code → room, size ✓, member ✓ ◀── (returns topic, URL, publishable key)
 paste manual ─ POST /api/room/put ────▶ member ✓, key ✓, size ✓ ──upsert─▶ bomb_room_items
 paste module ─ POST /api/room/picture ▶ member ✓, image ✓ ──upload──▶ Storage (private) → signed link
                                          └── broadcast (REST, secret key) ─▶ Realtime topic
 every member ◀──────────────── websocket: Realtime "broadcast" + "presence" on the topic ◀──┘
 reload / reconnect ─ GET /api/room/state ▶ everything in bomb_room_items for this game
```

Why writes go through the server instead of browsers writing to Supabase directly:

- The site's login is your own Discord session cookie (`lib/session.js`), not Supabase Auth. The
  server can already check "logged in, allowed, member of this room" with `readSession` +
  `accessFor`, the same way `api/report.js` does. Supabase can't check that by itself.
- The tables stay closed: RLS on with no policies, like `bomb_users`. Only the server's secret key
  reaches them.
- Browsers only **listen** on the live channel. Its name is the secret topic, so only members
  know it. The publishable key that the listening needs is public by design. It can't read any
  table.
- Late joiners and reloads read `/api/room/state`. Broadcast messages aren't stored, but
  `bomb_room_items` is.

Live part: Supabase **Realtime** (you already use Supabase).

- **Broadcast** sends "key X changed" and "card Y has a new picture". The server sends it through
  Realtime's REST broadcast endpoint with the secret key; check the current Supabase docs for the
  exact path.
- **Presence** shows who is online, which module they have open, and their 💣 / 📖 tag. That one
  comes straight from the browsers and never touches the database.
- Client library: `@supabase/realtime-js` (or `supabase-js`), loaded only when someone joins a
  room. Solo players don't download it.

If you later want stricter access, use private channels with Realtime authorization, where Supabase
checks each listener. That needs a Supabase-accepted JWT for each user (Supabase Auth, or minting
one from your session). It's more work, and not needed for game manuals.

---

## 5. Database (Supabase → SQL Editor)

```sql
-- supabase/bomb_rooms.sql (sketch)
create table public.bomb_rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                 -- K7QX2M
  topic       text not null,                 -- 128-bit secret, the Realtime channel name
  host_id     text not null,                 -- discord_id
  size        int  not null default 4 check (size between 2 and 4),
  game        int  not null default 1,       -- bumped by New game (host only)
  locked      boolean not null default false,
  created_at  timestamptz not null default now(),
  last_active timestamptz not null default now(),
  ended_at    timestamptz
);
create unique index bomb_rooms_open_code on public.bomb_rooms (code) where ended_at is null;

create table public.bomb_room_members (
  room_id    uuid references public.bomb_rooms(id) on delete cascade,
  discord_id text not null,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  kicked     boolean not null default false,
  primary key (room_id, discord_id)
);

create table public.bomb_room_items (
  room_id    uuid references public.bomb_rooms(id) on delete cascade,
  game       int  not null,
  key        text not null,                  -- a ROOM_KEYS key, 'count:password',
                                             -- 'card:password:2' (picture link), 'answer:password:2:<id>'
  value      jsonb,
  from_id    text not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, game, key)
);

alter table public.bomb_rooms        enable row level security;  -- no policies: server only
alter table public.bomb_room_members enable row level security;
alter table public.bomb_room_items   enable row level security;
```

Supabase Storage: a **private** bucket `rooms`.

Old rooms: a Vercel Schedule (hourly) ends rooms idle for 6 h and deletes rooms ended more than a
day ago, along with their items (through `on delete cascade`) and their pictures (Storage).

---

## 6. API (one file each in `api/room/`, all like `api/report.js`)

Every endpoint checks `sameOrigin`, then `readSession`, then `accessFor` (allowed), then room
membership.

| Endpoint | Does | Notes |
|---|---|---|
| `POST /api/room/create` `{ size }` | makes a room (size 2–4, default 4), you're host and member | returns `{ code, topic, game, size, realtime: { url, key } }`. One open room per person: you leave your old one |
| `POST /api/room/join` `{ code }` | adds you as a member | 404 for an unknown or ended code, 423 locked, 409 full, 403 kicked. Returns `{ topic, … }` **without** the code (only the host gets it, from create / state) |
| `GET /api/room/state` | members + every item of the current game | for first load, reloads and reconnects |
| `POST /api/room/put` `{ key, value }` | upserts one item, then broadcasts it | the key must be a ROOM_KEYS / ROOM_KEPT key, `count:`, `state:`, `answer:` or `clear:`, and the value at most ~64 KB. About 10 a second per person |
| `POST /api/room/picture` (multipart: module, card, image) | stores the picture, then puts `card:<module>:<n>` with its signed link | PNG / JPEG / WebP only, at most 3 MB (the same checks as `lib/report.js`) |
| `POST /api/room/new-game` | **host only** (403 for anyone else): bumps `game`, broadcasts `new-game` | everyone's app runs `startNewGame()` |
| `POST /api/room/leave` | marks you as left | the host's role passes on, and the room ends when the last member leaves |
| `POST /api/room/kick` `{ id }`, `/lock`, `/end` | host only | a kick also **changes the topic**: the others re-read `/state` and get the new one, the kicked person gets 403 |

Shared code goes in `lib/rooms.js`: code generation, the allow-list, `rest()` like `lib/users.js`,
the Storage upload, and the broadcast call.

---

## 7. Client pieces (`src/core/room/`)

| File | Job |
|---|---|
| `roomClient.js` | join / leave, holds `{ code, topic, game, size, members, host }`, connects to Realtime, re-reads `/state` after a reconnect, gets the room from `#…&room=CODE` (`currentGame()` already reads the hash with `URLSearchParams`) |
| `roomSync.js` | Layer 1: the bridge to `sharedSetting.js` (above): debounce, echo guard, provenance |
| `roomCards.js` | Layer 3: module counts, card pictures in (inject) and out (from `took()`), CLEAR |
| `useCardState.js` | Layer 4: `useState` that is the room's while in a room |
| `RoomBar.jsx` | the 👥 ROOM button and bar: create (size 2/3/4), join, members with 💣 / 📖, presence, code, copy invite, leave / end. Status goes **in the bar** (no toasts, as in the rest of the bomb app) |
| `RoomBoard.jsx` | Layer 2: answers per module card, red when two members' answers differ |
| `FromChip.jsx` | `FROM YUZA · 2 min ago` next to a manual's status and on a card that got its picture from the room |

Hide all of it in `bomb.html` (`__BOMB_ONLY__`, the offline copy) and when not logged in
(`window.__BB_ACCOUNT__` is missing).

---

## 8. New game in a room (host only)

Today, in solo play, **🆕 NEW GAME** in the top bar takes two presses within 4 seconds. It
forgets everything that changes from one game to the next (`GAME_ITEMS` in `newGame.js`):
- the serial;
- every manual and table (Astrology map and list, Circuit, Knobs, Wire Sequence, Piano, Button,
  Hangman, Logic, Simon, Batteries, Wire Placement, Laundry, the Maze strip, the Symbols grids);
- every module's screenshots and answers.

In a room, all of that is shared, so New game wipes it **for every member at once**. A helper
pressing it by mistake mid-bomb would empty the defuser's manuals. That's why only the host can.

- **Host:** the same button and the same two presses. The server bumps the room's `game` number,
  and every member's app runs `startNewGame()`. Their button flashes `✓ NEW GAME STARTED (by Mann)`.
- **Everyone else:** the button is greyed out and says `HOST STARTS NEW GAMES` on hover or tap.
  It doesn't clear their own copy either. The room would send the data straight back, and a
  half-cleared app is worse than a full one.
- **A single wrong module picture:** anyone can still press that card's **CLEAR**, which clears that
  one card for the room. New game is only for the next game.
- **Host away:** the host role passes to the next member when the host leaves. While the host
  is still in the room, though, nobody else can start a new game.

---

## 9. Things that will go wrong (plan for them)

- **Two people paste the same manual** or into the same card. The last write wins, per key. The
  chip shows whose copy is in use.
- **Echo loop.** A remote value is applied with `setSharedSetting` or `inject`. That must not send
  it back out, so use the `applyingRemote` guard.
- **Typing in a manual box** would send on every key press. Debounce per key, about 300 ms after
  the last change.
- **Joining mid-game with your own data.** The room's values win. Your local values for keys the
  room doesn't have stay on your device and are **not** uploaded on their own, since they could be
  from the last game. A **Share my manuals** button can send them on purpose.
- **Reconnect** (phone locked, Wi-Fi blip): Realtime reconnects. Always re-read `/state`
  afterwards, because messages sent while you were away are gone.
- **Two tabs, same person.** That counts as one member (by Discord ID) towards the room size.
- **New game races** (the host presses it while another member pastes). Items are stored per `game`,
  so a paste tagged with the old game number is ignored.
- **Supabase free plan.** Realtime has limits on connections at once and messages a month, and
  Storage has a size limit. 4-person rooms are far under them, but check the pricing page.
  Pictures go through Storage, never inside a broadcast.
- **Discord links expire** (`ex=` in the link). A phone's pasted link works for about a day.
  That's fine within a game. Uploaded files are signed for a day too.

---

## 10. Build order (each phase works on its own)

| Phase | Build | Done when |
|---|---|---|
| 1 | Tables + `lib/rooms.js` + create (size) / join / leave / state + `RoomBar` with members, presence and 💣 / 📖 (no syncing yet) | two browsers in one room see each other come and go; a full room and an ended code say so |
| 2 | Layer 1: `put` + broadcast + `roomSync.js`, serial first, then every `ROOM_KEYS` key, provenance chips, host-only New game | the helper pastes the star list, and the defuser's Astrology shows LOADED within a second. A reload keeps it. A non-host's New game is greyed out |
| 3 | Layer 3: shared counts, picture links, then file uploads (`/api/room/picture`), CLEAR per card | the defuser's Password #2 screenshot opens in the helper's Password #2, and both show the same answer |
| 4 | Layer 2: the answers board, with red when answers differ | the board lists every solved card and who pasted it |
| 5 | Kick, lock, end, host hand-over, topic change on kick, hourly clean-up schedule (rooms + pictures) | a kicked tab stops getting updates; idle rooms and their pictures are gone |
| 6 | Layer 4: `useCardState`, then module by module (start with the ones you use most in a room) | a Hangman letter guessed on one phone shows on the other's Hangman |

Tests to write as you go, in `tests/rooms.test.js`, in the style of `tests/auth.test.js` with
fake Supabase replies:

- code alphabet and length;
- size 2–4, and refusing a 5th member;
- join refused when locked, full, kicked or ended;
- New game refused for a non-host;
- `put` refuses keys outside the allow-list and values that are too big;
- `picture` refuses non-image types;
- a kick changes the topic;
- `state` only returns the current game's items.
