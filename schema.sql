-- BRAINWAVE MVP — Database Schema
-- Paste this ENTIRE file into Supabase SQL Editor and click Run.

-- ─────────────────────────────────────────────────────────────
--  TABLES
-- ─────────────────────────────────────────────────────────────

create table if not exists rooms (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  host_name    text not null,
  status       text not null default 'waiting',   -- waiting | playing | results | finished
  current_q    int  not null default -1,          -- -1 = not started, 0..N = question index
  phase        text not null default 'lobby',     -- lobby | preview | answer | results | final
  phase_start  timestamptz,                       -- when current phase started (for client-side timer sync)
  questions    jsonb,                             -- array of {q, correct, canonical} selected for this room
  created_at   timestamptz default now()
);

create table if not exists players (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid references rooms(id) on delete cascade,
  name         text not null,
  score        int  not null default 0,
  is_host      boolean not null default false,
  joined_at    timestamptz default now()
);

create table if not exists answers (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid references rooms(id) on delete cascade,
  player_id      uuid references players(id) on delete cascade,
  question_index int  not null,
  answer_text    text not null default '',
  canonical      text not null default '',
  is_correct     boolean not null default false,
  scored         boolean not null default false,
  created_at     timestamptz default now(),
  unique (room_id, player_id, question_index)
);

-- ─────────────────────────────────────────────────────────────
--  INDEXES (speed up common queries)
-- ─────────────────────────────────────────────────────────────
create index if not exists idx_rooms_code      on rooms(code);
create index if not exists idx_players_room    on players(room_id);
create index if not exists idx_answers_room_q  on answers(room_id, question_index);

-- ─────────────────────────────────────────────────────────────
--  ROW LEVEL SECURITY
--  For the MVP we keep it permissive (anyone can read/write).
--  Tighten this before production.
-- ─────────────────────────────────────────────────────────────
alter table rooms    enable row level security;
alter table players  enable row level security;
alter table answers  enable row level security;

-- Drop if re-running
drop policy if exists "rooms_all"    on rooms;
drop policy if exists "players_all"  on players;
drop policy if exists "answers_all"  on answers;

create policy "rooms_all"   on rooms   for all using (true) with check (true);
create policy "players_all" on players for all using (true) with check (true);
create policy "answers_all" on answers for all using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
--  REALTIME PUBLICATION
--  Makes these tables broadcast changes over WebSockets.
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table answers;
