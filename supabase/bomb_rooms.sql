-- Rooms ("colab mode", docs/rooms-plan.md; lib/rooms.js). Paste into Supabase → SQL Editor → Run, once.
-- Needs bomb_users.sql first (a member's name and avatar come from bomb_users).

create table if not exists public.bomb_rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                 -- K7QX2M (shown K7QX-2M)
  topic       text not null,                 -- 128-bit secret: the live channel's name
  host_id     text not null,                 -- discord_id
  size        int  not null default 4 check (size between 2 and 4),
  game        int  not null default 1,       -- bumped by the host's New game
  locked      boolean not null default false,
  created_at  timestamptz not null default now(),
  last_active timestamptz not null default now(),
  ended_at    timestamptz
);
-- a code is unique among open rooms only: it's free again once its room ends
create unique index if not exists bomb_rooms_open_code on public.bomb_rooms (code) where ended_at is null;

create table if not exists public.bomb_room_members (
  room_id    uuid not null references public.bomb_rooms(id) on delete cascade,
  discord_id text not null,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  kicked     boolean not null default false,
  primary key (room_id, discord_id)
);
create index if not exists bomb_room_members_who on public.bomb_room_members (discord_id) where left_at is null;

-- What the room shares: one row per item (src/core/room/roomKeys.js says which keys).
-- game 0 = kept across New games (the Password / Who's on First / Word Search lists).
create table if not exists public.bomb_room_items (
  room_id    uuid not null references public.bomb_rooms(id) on delete cascade,
  game       int  not null,
  key        text not null,
  value      jsonb,
  from_id    text not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, game, key)
);

-- Module pictures pasted as files (base64; a 440×440 module picture is 100–300 KB). They go with the
-- room: a room is deleted a day after it ends (lib/rooms.js cleanup).
create table if not exists public.bomb_room_pictures (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.bomb_rooms(id) on delete cascade,
  mime       text not null,
  data       text not null,
  created_at timestamptz not null default now()
);
create index if not exists bomb_room_pictures_room on public.bomb_room_pictures (room_id);

-- Row Level Security on, with no policies: browsers (the publishable key) can't read or change any of
-- this. Only the site's server, with the secret key, can. Browsers only listen on the live channel.
alter table public.bomb_rooms         enable row level security;
alter table public.bomb_room_members  enable row level security;
alter table public.bomb_room_items    enable row level security;
alter table public.bomb_room_pictures enable row level security;
