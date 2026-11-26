-- The site's users (lib/users.js). Paste into Supabase → SQL Editor → Run, once.
create table if not exists public.bomb_users (
  discord_id  text primary key,
  username    text,                  -- Discord display name
  handle      text,                  -- Discord @username
  avatar      text,
  status      text not null default 'allowed' check (status in ('allowed', 'waiting', 'blocked')),
  expires_at  timestamptz,           -- set when allowed for 1 / 7 / 30 days; null = no limit
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

-- Row Level Security on, with no policies: the public (anon) key can't read or change anything.
-- The site's server uses the secret / service_role key, which isn't affected.
alter table public.bomb_users enable row level security;
