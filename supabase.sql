-- ============================================================================
-- GenLayer Grand Prix — Supabase schema, RLS, and server-authoritative RPCs.
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Then set the admin passcode:   select set_admin_passcode(null, '<ADMIN_PASSCODE>');
--
-- Safe to re-run on a live database: tables use IF NOT EXISTS, new columns use
-- ADD COLUMN IF NOT EXISTS, functions use CREATE OR REPLACE, and every policy and
-- view is dropped before it is recreated.
--
-- Three rules this file enforces that the browser cannot be trusted with:
--   1. Nobody races until the host starts the room. Players join, wait on the
--      grid, and the ten minutes then run for the whole field from one instant.
--   2. Joining is what puts a name on the leaderboard, not finishing. Everyone
--      who took a seat is visible for the whole session, still racing or not.
--   3. The board clears every two hours, by tagging each row with a window and
--      only ever showing the current one. No cron job, nothing to remember.
-- ============================================================================

-- Extensions go in their own schema, which is where a managed Postgres (Supabase,
-- Neon) already keeps them. Installing into `public` is what most tutorials do and
-- it is why `search_path = public, extensions, pg_temp` below has to name `extensions` too:
-- without it crypt(), gen_salt() and levenshtein() are invisible to every
-- SECURITY DEFINER function here, and passcode checks fail with
-- "function gen_salt(unknown) does not exist".
create schema if not exists extensions;
create extension if not exists pgcrypto     with schema extensions; -- crypt(), gen_salt()
create extension if not exists fuzzystrmatch with schema extensions; -- levenshtein()
create extension if not exists unaccent      with schema extensions; -- diacritics stripping

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists config (
  id           int primary key default 1,
  active_round int not null default 1,
  constraint config_singleton check (id = 1)
);
insert into config (id, active_round) values (1, 1) on conflict (id) do nothing;

-- Private: never exposed to anon. Holds the bcrypt passcode hash.
create table if not exists admin_config (
  id            int primary key default 1,
  passcode_hash text,
  constraint admin_singleton check (id = 1)
);
insert into admin_config (id) values (1) on conflict (id) do nothing;

-- Private: brute-force attempt log for admin lockout.
create table if not exists admin_attempts (
  id         bigserial primary key,
  created_at timestamptz not null default now()
);

-- Private: full questions incl. the hidden accepted answers.
create table if not exists questions (
  round       int  not null,
  order_idx   int  not null,
  qid         text not null,
  prompt      text not null,
  accepted    text[] not null,
  hint        text,
  primary key (round, order_idx),
  unique (round, qid)
);
-- Upgrade from an earlier schema: the admin no longer writes per-question
-- explanations, so the column and its not-null constraint have to go.
alter table questions drop column if exists explanation;

-- Private: in-flight run state. Token gates every answer/finish call.
create table if not exists runs (
  id                uuid primary key default gen_random_uuid(),
  token             uuid not null default gen_random_uuid(),
  round             int  not null,
  username          text not null,
  avatar_seed       text not null,
  server_started_at timestamptz not null default now(),
  question_served_at timestamptz not null default now(),
  current_index     int  not null default 0,
  score             int  not null default 0,
  correct           int  not null default 0,
  streak            int  not null default 0,
  finished          bool not null default false,
  finished_at       timestamptz,
  created_at        timestamptz not null default now()
);
-- Which questions this run has already taken. A set, not a cursor: the board
-- shows all ten and the player picks the order, so there is no "current" one.
-- `current_index` above is the cursor it replaced, left in place rather than
-- dropped out from under a live database.
alter table runs add column if not exists answered text[] not null default '{}';

-- Hints are counted here rather than in the browser, so a reload cannot refill
-- them. Must track HINTS_PER_SESSION in src/game/scoring.ts.
alter table runs add column if not exists hints_used int not null default 0;

-- Finalized leaderboard rows. One per run, written by join_room the moment a
-- player takes a seat and updated as they answer and when they finish.
create table if not exists scores (
  id          bigserial primary key,
  round       int  not null,
  username    text not null,
  avatar_seed text not null,
  score       int  not null,
  correct     int  not null,
  total_ms    int  not null,
  hour_bucket bigint not null default floor(extract(epoch from now()) / 3600),
  created_at  timestamptz not null default now()
);
-- The row now belongs to a run and exists before that run has a result.
alter table scores add column if not exists run_id   uuid;
alter table scores add column if not exists finished boolean not null default true;
create unique index if not exists scores_run on scores (run_id) where run_id is not null;

-- Admin-created game rooms. The ACTIVE room is the newest one; its share code is
-- how players join. Players cannot start a game unless an active room exists.
--
-- A code is a SESSION: it opens for ROOM_TTL (15 minutes) and seats ROOM_CAPACITY
-- (1000) players, one run each. It ends when the clock or the seats run out —
-- never because somebody finished, since a code is meant to carry a crowd through
-- the same questions at once. join_room still refuses a name that already raced in
-- that room, which is what stops replaying the questions to farm the board. Hosts
-- create a fresh room for the next round.
--
-- Both limits are enforced here, on the server's own clock and its own count, so
-- neither can be argued with from a browser.
create table if not exists rooms (
  code       text primary key,
  round      int  not null,
  status     text not null default 'open' check (status in ('open', 'done')),
  closed_at  timestamptz,
  created_at timestamptz not null default now()
);
-- Legacy columns from when a finished run retired the code. Nothing writes them
-- now; they are left in place rather than dropped out from under a live database.
-- A room an old build marked 'done' stays unjoinable regardless: it is long past
-- its 15 minutes.
alter table rooms add column if not exists status    text not null default 'open';
alter table rooms add column if not exists closed_at timestamptz;
-- When the host dropped the lights. Null while the field is still gathering.
alter table rooms add column if not exists started_at timestamptz;

-- The limits, in one place so the RPCs below cannot drift apart.
create or replace function room_ttl() returns interval
  language sql immutable as $$ select interval '15 minutes' $$;
create or replace function room_capacity() returns int
  language sql immutable as $$ select 1000 $$;
-- Mirrors SESSION_MS in src/game/scoring.ts.
create or replace function session_ms() returns int
  language sql immutable as $$ select 600000 $$;

-- The leaderboard window. Two hours, because one was shorter than a community
-- session: a host opens a code, waits for people to arrive, runs the quiz — and
-- the board used to roll over while the last players were still typing, cutting
-- one event in half. Rows written before this change carry a one-hour bucket
-- number, which no longer matches any window, so the board starts clean.
create or replace function bucket_seconds() returns int
  language sql immutable as $$ select 7200 $$;
create or replace function bucket_of(t timestamptz) returns bigint
  language sql stable as $$ select floor(extract(epoch from t) / bucket_seconds())::bigint $$;

alter table scores alter column hour_bucket set default bucket_of(now());
create index if not exists scores_hour_rank on scores (hour_bucket, score desc, total_ms asc);

-- Is this room still taking players? Clock and seats, nothing else. Starting a
-- room does not close it: latecomers can still join a race already under way,
-- they simply inherit whatever is left of the field's ten minutes.
create or replace function room_is_live(p_room rooms)
returns boolean language sql stable
security definer set search_path = public, extensions, pg_temp as $$
  select p_room.created_at > now() - room_ttl()
     and (select count(*) from runs where round = p_room.round) < room_capacity();
$$;

-- How much of the session is left for a room, in milliseconds. A room nobody has
-- started yet has the whole thing in front of it.
create or replace function room_remaining_ms(p_room rooms)
returns int language sql stable
security definer set search_path = public, extensions, pg_temp as $$
  select case
    when p_room.started_at is null then session_ms()
    else greatest(0, session_ms()
         - floor(extract(epoch from (now() - p_room.started_at)) * 1000)::int)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: default-deny everywhere. Anon reads only via views/config.
-- ---------------------------------------------------------------------------
alter table config          enable row level security;
alter table admin_config    enable row level security;
alter table admin_attempts  enable row level security;
alter table questions       enable row level security;
alter table runs            enable row level security;
alter table scores          enable row level security;
alter table rooms           enable row level security;
-- No anon policy on rooms => join/create/start/status go through RPCs only.

-- Only config is directly readable by anon (just the active round number).
drop policy if exists config_read on config;
create policy config_read on config for select to anon, authenticated using (true);
-- No policies on admin_config, admin_attempts, questions, runs, scores => anon denied.

-- Column-filtered public views (run as owner => bypass base-table RLS).
drop view if exists questions_public;
create view questions_public as
  select qid as id, round, order_idx, prompt, hint from questions;

drop view if exists scores_public;
create view scores_public as
  select round, username, avatar_seed, score, correct, total_ms, hour_bucket, created_at from scores;

-- The board the app reads. Same rows, plus what a shared board needs to be
-- honest: which run each row belongs to, and whether that run is finished or
-- still out on track.
drop view if exists leaderboard_public;
create view leaderboard_public as
  select run_id, round, username, avatar_seed, score, correct, total_ms,
         finished, hour_bucket, created_at
  from scores;

grant select on questions_public   to anon, authenticated;
grant select on scores_public      to anon, authenticated;
grant select on leaderboard_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Mirror of the client-side normalize(): lower, de-accent, strip punctuation, collapse.
create or replace function normalize_text(t text)
returns text language sql immutable
set search_path = public, extensions, pg_temp as $$
  select trim(regexp_replace(
           regexp_replace(lower(unaccent(coalesce(t, ''))), '[^a-z0-9[:space:]]', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;

-- Fuzzy answer match mirroring checkAnswer (exact OR Levenshtein<=1 for len>=4).
create or replace function answer_matches(p_answer text, p_accepted text[])
returns boolean language sql immutable
set search_path = public, extensions, pg_temp as $$
  select case when normalize_text(p_answer) = '' then false else exists (
    select 1 from unnest(p_accepted) a
    where normalize_text(p_answer) = normalize_text(a)
       or (length(normalize_text(a)) >= 4
           and levenshtein(normalize_text(p_answer), normalize_text(a)) <= 1)
  ) end;
$$;

-- Raise if too many recent failed admin attempts (5 per 15 min => locked).
create or replace function admin_check_lockout()
returns void language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
begin
  if (select count(*) from admin_attempts where created_at > now() - interval '15 minutes') >= 5 then
    raise exception 'admin locked: too many attempts, try again later';
  end if;
end;
$$;

-- Verify passcode against bcrypt hash; log + raise on mismatch. Constant-ish via crypt.
create or replace function admin_verify(p_passcode text)
returns void language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare h text;
begin
  perform admin_check_lockout();
  select passcode_hash into h from admin_config where id = 1;
  if h is null then
    raise exception 'admin passcode not configured';
  end if;
  if crypt(coalesce(p_passcode, ''), h) = h then
    return;
  end if;
  insert into admin_attempts default values;
  raise exception 'invalid admin passcode';
end;
$$;

-- ---------------------------------------------------------------------------
-- Run lifecycle RPCs (server-authoritative scoring)
-- ---------------------------------------------------------------------------
create or replace function start_run(p_username text, p_avatar_seed text)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare
  v_round int;
  v_name  text;
  v_run   runs%rowtype;
  v_q     questions%rowtype;
begin
  v_name := trim(coalesce(p_username, ''));
  if length(v_name) < 2 or length(v_name) > 20 then
    raise exception 'invalid username';
  end if;
  select active_round into v_round from config where id = 1;
  if not exists (select 1 from questions where round = v_round and order_idx = 0) then
    raise exception 'no questions configured for the active round';
  end if;

  insert into runs (round, username, avatar_seed)
  values (v_round, v_name, coalesce(p_avatar_seed, ''))
  returning * into v_run;

  select * into v_q from questions where round = v_round and order_idx = 0;

  return jsonb_build_object(
    'run_id', v_run.id,
    'token',  v_run.token,
    'index',  0,
    'question', jsonb_build_object('id', v_q.qid, 'prompt', v_q.prompt, 'hint', v_q.hint)
  );
end;
$$;

-- Is there an active room right now? (Players need one to start.) Never leaks the code.
create or replace function get_active_room()
returns jsonb language sql stable
security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object(
    'open', exists (
      select 1 from rooms r
      where r.created_at = (select max(created_at) from rooms)
        and room_is_live(r)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- join_room: take a seat, take the whole board, and wait for the host.
--
-- Joining does three things: it opens a run, it hands over all ten questions
-- (prompts and hints only — the accepted answers never leave this database), and
-- it writes the player's leaderboard row straight away, so the room roster and
-- the board agree from the first second instead of the board being a list of
-- whoever happened to finish.
-- ---------------------------------------------------------------------------
create or replace function join_room(p_code text, p_username text, p_avatar_seed text)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare
  v_name   text;
  v_active rooms%rowtype;
  v_run    runs%rowtype;
begin
  v_name := trim(coalesce(p_username, ''));
  if length(v_name) < 2 or length(v_name) > 20 then
    raise exception 'invalid username';
  end if;

  select * into v_active from rooms order by created_at desc limit 1;
  if not found then raise exception 'no active room — ask the admin to open one'; end if;
  if v_active.code <> upper(trim(coalesce(p_code, ''))) then
    raise exception 'room not found or closed';
  end if;
  -- The clock, then the player, then the seats: a returning name deserves the
  -- reason that is actually about them, not "room full".
  if v_active.created_at <= now() - room_ttl() then
    raise exception 'this quiz has ended — a code runs for 15 minutes, ask the host for a new code';
  end if;
  if exists (
    select 1 from runs
    where round = v_active.round and lower(trim(username)) = lower(v_name)
  ) then
    raise exception 'you already raced in this room — ask the host for a new code';
  end if;
  if (select count(*) from runs where round = v_active.round) >= room_capacity() then
    raise exception 'this room is full — ask the host for a new code';
  end if;
  if not exists (select 1 from questions where round = v_active.round) then
    raise exception 'room has no questions';
  end if;

  -- The run's clock is the room's clock. Someone who joined ten minutes before
  -- the host started must not lose those ten minutes; someone who joins after
  -- the start inherits only what is left, and gets no fresh session for being late.
  insert into runs (round, username, avatar_seed, server_started_at)
  values (v_active.round, v_name, coalesce(p_avatar_seed, ''),
          coalesce(v_active.started_at, now()))
  returning * into v_run;

  insert into scores (run_id, round, username, avatar_seed, score, correct, total_ms, finished)
  values (v_run.id, v_active.round, v_name, coalesce(p_avatar_seed, ''), 0, 0, 0, false);

  return jsonb_build_object(
    'run_id', v_run.id,
    'token',  v_run.token,
    'started', v_active.started_at is not null,
    'remaining_ms', room_remaining_ms(v_active),
    -- The accepted answers stay on the server. Only prompts and hints travel.
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object('id', qid, 'prompt', prompt, 'hint', hint)
                                order by order_idx), '[]'::jsonb)
      from questions where round = v_active.round
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- room_lobby: who is holding this code, and has the host set them off yet.
-- Anyone with the code can read it — that is the point of a community quiz, and
-- the roster is the same list the leaderboard already shows.
-- ---------------------------------------------------------------------------
create or replace function room_lobby(p_code text)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare v_room rooms%rowtype;
begin
  select * into v_room from rooms where code = upper(trim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('started', false, 'remaining_ms', session_ms(),
                              'players', '[]'::jsonb, 'count', 0, 'expires_in_ms', 0);
  end if;

  return jsonb_build_object(
    'started',      v_room.started_at is not null,
    'remaining_ms', room_remaining_ms(v_room),
    'count',        (select count(*) from runs where round = v_room.round),
    'expires_in_ms', greatest(0, floor(extract(epoch from
                       (v_room.created_at + room_ttl() - now())) * 1000)::bigint),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object('username', username,
                                                   'avatar_seed', avatar_seed)
                                order by created_at), '[]'::jsonb)
      from runs where round = v_room.round
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- start_game: the host drops the lights.
--
-- Everyone already in the room has their clock reset to this instant, so nobody
-- is punished for arriving early. Pressing it twice changes nothing — the second
-- press must not hand the field a fresh ten minutes.
-- ---------------------------------------------------------------------------
create or replace function start_game(p_passcode text, p_code text)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare
  v_room rooms%rowtype;
  v_at   timestamptz;
  v_n    int;
begin
  perform admin_verify(p_passcode);

  select * into v_room from rooms where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'no room with that code'; end if;
  if v_room.created_at <= now() - room_ttl() then
    raise exception 'this code has expired — open a new room';
  end if;

  if v_room.started_at is null then
    v_at := now();
    update rooms set started_at = v_at where code = v_room.code;
    update runs set server_started_at = v_at
      where round = v_room.round and not finished;
  else
    v_at := v_room.started_at;
  end if;

  select count(*) into v_n from runs where round = v_room.round;
  return jsonb_build_object('ok', true, 'started_at', v_at, 'players', v_n);
end;
$$;

-- ---------------------------------------------------------------------------
-- answer_question: any question, once each, until the session clock runs out.
--
-- Two rules that used to live here are gone. The cursor is gone, because the
-- board lets a player choose the order. The 13-second per-question timeout is
-- gone with it: it made sense when each question had its own countdown, and with
-- one ten-minute session and a free order it only punished thinking. The session
-- deadline is what is enforced now, still on the server's own clock.
-- ---------------------------------------------------------------------------
create or replace function answer_question(p_run_id uuid, p_token uuid, p_question_id text, p_answer text)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare
  v_run     runs%rowtype;
  v_q       questions%rowtype;
  v_room    rooms%rowtype;
  v_correct bool;
  v_pts     int;
  v_grace   interval := interval '20 seconds';  -- latency allowance
begin
  select * into v_run from runs where id = p_run_id and token = p_token for update;
  if not found then raise exception 'invalid run or token'; end if;
  if v_run.finished then raise exception 'run already finished'; end if;

  -- No answering before the host has started the room.
  select * into v_room from rooms where round = v_run.round order by created_at desc limit 1;
  if found and v_room.started_at is null then
    raise exception 'the host has not started this room yet';
  end if;

  -- The session, not the question, is what is timed.
  if now() > v_run.server_started_at + (session_ms() || ' milliseconds')::interval + v_grace then
    raise exception 'session is over';
  end if;

  select * into v_q from questions where round = v_run.round and qid = p_question_id;
  if not found then raise exception 'no such question in this round'; end if;
  if p_question_id = any(v_run.answered) then
    raise exception 'question already answered';
  end if;

  v_correct := answer_matches(p_answer, v_q.accepted);
  -- A wrong answer costs the attempt but does not consume the question: the
  -- board lets a player try again, and the client already tracks attempts.
  v_pts := case when v_correct then 1000 else 0 end;

  update runs set
    score    = score + v_pts,
    correct  = correct + (case when v_correct then 1 else 0 end),
    streak   = case when v_correct then streak + 1 else 0 end,
    answered = case when v_correct then array_append(answered, p_question_id) else answered end
  where id = v_run.id
  returning * into v_run;

  -- Keep the board live. A leaderboard on a screen at the front of the room is
  -- worth more than one that only moves when somebody finishes.
  update scores set score = v_run.score, correct = v_run.correct
   where run_id = v_run.id and not finished;

  return jsonb_build_object(
    'correct',        v_correct,
    'points_awarded', v_pts,
    'correct_answer', case when v_correct then v_q.accepted[1] else null end,
    'new_score',      v_run.score,
    'correct_count',  v_run.correct,
    'answered',       to_jsonb(v_run.answered)
  );
end;
$$;

create or replace function finish_run(p_run_id uuid, p_token uuid)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare
  v_run    runs%rowtype;
  v_score  int;
  v_total  int;
  v_rank   int;
  v_bucket bigint;
  v_session int := session_ms();
  -- Anti-cheat clamp; must track MAX_SCORE in src/game/scoring.ts:
  -- 10×1000 per correct + 500 time + 300 accuracy + 100 speed = 10900.
  v_max    int := 10900;
begin
  select * into v_run from runs where id = p_run_id and token = p_token for update;
  if not found then raise exception 'invalid run or token'; end if;

  -- The window this player has belonged to since they joined. Keeping it fixed
  -- means a run that straddles a boundary does not jump to a board its rivals
  -- are not on.
  select hour_bucket into v_bucket from scores where run_id = v_run.id;

  if not v_run.finished then
    v_total  := floor(extract(epoch from (now() - v_run.server_started_at)) * 1000)::int;
    v_bucket := coalesce(v_bucket, bucket_of(now()));
    -- Time bonus is paid from the server's own clock, so a faked duration can
    -- never buy places. The typing bonus is client-side only (the server does
    -- not see keystrokes), which is why it is capped well under one answer.
    v_score  := least(
      v_run.score + round(500 * greatest(0, v_session - v_total)::numeric / v_session)::int,
      v_max
    );
    update runs set finished = true, finished_at = now() where id = v_run.id;

    -- The row already exists: it was written when this player joined. Update it
    -- rather than inserting, or everyone who joined would be listed twice.
    update scores set score = v_score, correct = v_run.correct,
                      total_ms = v_total, finished = true
     where run_id = v_run.id;
    if not found then
      insert into scores (run_id, round, username, avatar_seed, score, correct,
                          total_ms, hour_bucket, finished)
      values (v_run.id, v_run.round, v_run.username, v_run.avatar_seed,
              v_score, v_run.correct, v_total, v_bucket, true);
    end if;
    -- The room is deliberately left open: everyone else holding this code still
    -- has to be able to race. It closes on its own clock, or when the seats fill.
  else
    v_total  := floor(extract(epoch from (v_run.finished_at - v_run.server_started_at)) * 1000)::int;
    v_bucket := coalesce(v_bucket, bucket_of(v_run.finished_at));
    -- Replaying finish_run returns the row that was already written, never a new one.
    select score into v_score from scores where run_id = v_run.id;
    v_score := coalesce(v_score, least(v_run.score, v_max));
  end if;

  -- Rank within the current window's global board: highest score first, and the
  -- faster run wins a tie. Score already puts completion above everything else.
  -- Only finished runs can be ahead of you — a player still out on track has no
  -- time yet, and a zero would otherwise outrank everyone who crossed the line.
  select count(*) + 1 into v_rank from scores
  where hour_bucket = v_bucket
    and (score > v_score or (score = v_score and finished and total_ms < v_total));

  return jsonb_build_object(
    'score', v_score, 'correct', v_run.correct, 'total_ms', v_total, 'rank', v_rank
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- mask_answer / reveal_hint: the first and last letter, and nothing else.
--
-- The mask has to be built here. The client is sent prompts and hints, never
-- `accepted`, so a browser asked to mask an answer it was quite correctly never
-- given had nothing to work with — and threw, inside a React state updater,
-- which unmounted the app and left a black screen mid-race.
-- ---------------------------------------------------------------------------
create or replace function mask_answer(p_answer text)
returns text language plpgsql immutable
set search_path = public, pg_temp as $$
declare
  v_chars text[];
  v_last  int;
  v_out   text[] := '{}';
  i       int;
  ch      text;
begin
  v_chars := regexp_split_to_array(btrim(coalesce(p_answer, '')), '');
  v_last  := array_length(v_chars, 1);
  if v_last is null then return ''; end if;
  for i in 1..v_last loop
    ch := v_chars[i];
    if ch = ' ' then
      v_out := array_append(v_out, ' ');
    elsif i = 1 or i = v_last then
      v_out := array_append(v_out, ch);
    else
      v_out := array_append(v_out, '_');
    end if;
  end loop;
  -- Joined with spaces, exactly as maskAnswer does in src/game/quiz.ts, so the
  -- local and shared modes read identically on screen.
  return array_to_string(v_out, ' ');
end;
$$;

create or replace function reveal_hint(p_run_id uuid, p_token uuid, p_question_id text)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare
  v_run runs%rowtype;
  v_q   questions%rowtype;
  v_max int := 2;   -- must track HINTS_PER_SESSION in src/game/scoring.ts
begin
  select * into v_run from runs where id = p_run_id and token = p_token for update;
  if not found then raise exception 'invalid run or token'; end if;
  if v_run.finished then raise exception 'run already finished'; end if;

  select * into v_q from questions where round = v_run.round and qid = p_question_id;
  if not found then raise exception 'no such question in this round'; end if;
  if p_question_id = any(v_run.answered) then
    raise exception 'question already answered';
  end if;

  if v_run.hints_used >= v_max then
    raise exception 'both hints spent';
  end if;

  update runs set hints_used = hints_used + 1 where id = v_run.id returning * into v_run;

  return jsonb_build_object(
    'mask',       mask_answer(v_q.accepted[1]),
    'hints_left', greatest(0, v_max - v_run.hints_used)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs (passcode + lockout protected)
-- ---------------------------------------------------------------------------
create or replace function admin_get_questions(p_passcode text)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare v_round int; v_out jsonb;
begin
  perform admin_verify(p_passcode);
  select active_round into v_round from config where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', qid, 'prompt', prompt, 'accepted', accepted,
           'hint', coalesce(hint, '')
         ) order by order_idx), '[]'::jsonb)
    into v_out from questions where round = v_round;
  return v_out;
end;
$$;

create or replace function admin_publish_questions(p_passcode text, p_questions jsonb, p_bump boolean)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare
  v_round  int;
  v_target int;
  v_len    int;
  v_elem   jsonb;
  v_i      int := 0;
begin
  perform admin_verify(p_passcode);

  if jsonb_typeof(p_questions) <> 'array' then raise exception 'questions must be an array'; end if;
  v_len := jsonb_array_length(p_questions);
  if v_len < 1 or v_len > 20 then raise exception 'questions must contain 1..20 items'; end if;

  -- validate each element
  for v_elem in select * from jsonb_array_elements(p_questions) loop
    if coalesce(v_elem->>'prompt', '') = '' then raise exception 'each question needs a prompt'; end if;
    if jsonb_typeof(v_elem->'accepted') <> 'array'
       or jsonb_array_length(v_elem->'accepted') < 1 then
      raise exception 'each question needs at least one accepted answer';
    end if;
  end loop;

  select active_round into v_round from config where id = 1;
  v_target := case when p_bump then v_round + 1 else v_round end;

  delete from questions where round = v_target;

  for v_elem in select * from jsonb_array_elements(p_questions) loop
    insert into questions (round, order_idx, qid, prompt, accepted, hint)
    values (
      v_target,
      v_i,
      coalesce(nullif(v_elem->>'id', ''), 'q' || (v_i + 1)),
      v_elem->>'prompt',
      array(select jsonb_array_elements_text(v_elem->'accepted')),
      nullif(v_elem->>'hint', '')
    );
    v_i := v_i + 1;
  end loop;

  if p_bump then
    update config set active_round = v_target where id = 1;
  end if;

  return jsonb_build_object('ok', true, 'round', v_target);
end;
$$;

-- Admin: publish a set of questions AND open a new room, returning a shareable code.
-- This becomes the active game; players join via join_room(code) and then wait
-- on the grid until start_game(code).
create or replace function create_room(p_passcode text, p_questions jsonb)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare
  v_round int;
  v_len   int;
  v_elem  jsonb;
  v_i     int := 0;
  v_code  text;
  v_try   int := 0;
begin
  perform admin_verify(p_passcode);

  if jsonb_typeof(p_questions) <> 'array' then raise exception 'questions must be an array'; end if;
  v_len := jsonb_array_length(p_questions);
  if v_len < 1 or v_len > 20 then raise exception 'questions must contain 1..20 items'; end if;
  for v_elem in select * from jsonb_array_elements(p_questions) loop
    if coalesce(v_elem->>'prompt', '') = '' then raise exception 'each question needs a prompt'; end if;
    if jsonb_typeof(v_elem->'accepted') <> 'array'
       or jsonb_array_length(v_elem->'accepted') < 1 then
      raise exception 'each question needs at least one accepted answer';
    end if;
  end loop;

  select active_round + 1 into v_round from config where id = 1;
  delete from questions where round = v_round;
  for v_elem in select * from jsonb_array_elements(p_questions) loop
    insert into questions (round, order_idx, qid, prompt, accepted, hint)
    values (
      v_round, v_i,
      coalesce(nullif(v_elem->>'id', ''), 'q' || (v_i + 1)),
      v_elem->>'prompt',
      array(select jsonb_array_elements_text(v_elem->'accepted')),
      nullif(v_elem->>'hint', '')
    );
    v_i := v_i + 1;
  end loop;
  update config set active_round = v_round where id = 1;

  -- unique 6-char code (hex, upper). Retry on the rare collision.
  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from rooms where code = v_code);
    v_try := v_try + 1;
    if v_try > 10 then raise exception 'could not allocate a room code'; end if;
  end loop;
  -- started_at stays null: the room opens for people to gather in, and the host
  -- starts it when the field is ready.
  insert into rooms (code, round) values (v_code, v_round);

  return jsonb_build_object('code', v_code, 'round', v_round);
end;
$$;

create or replace function set_admin_passcode(p_current text, p_new text)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare h text;
begin
  if length(coalesce(p_new, '')) < 4 then raise exception 'new passcode too short'; end if;
  select passcode_hash into h from admin_config where id = 1;
  if h is not null then
    perform admin_verify(p_current);  -- must know current passcode to rotate
  end if;
  update admin_config set passcode_hash = crypt(p_new, gen_salt('bf')) where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: expose only the intended RPCs, and only to the roles that call them.
-- ---------------------------------------------------------------------------
-- Revoking from PUBLIC alone is not enough on a managed Postgres. Supabase's
-- default privileges hand EXECUTE on every function in `public` straight to the
-- `anon` and `authenticated` roles, and a grant to a named role survives a
-- revoke from PUBLIC. Skipping these two role names left start_run callable by
-- anyone with the anon key — which is every visitor, since the key ships in the
-- browser bundle — and start_run is the one function that opens a run with no
-- room code, bypassing the room, the 15-minute clock and one-run-per-name.
--
-- So: strip everything from all three, then grant back the ones the client
-- actually calls.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- The client calls exactly these. Each one either needs no secret (get_active_room,
-- room_lobby), carries a run token, or checks the admin passcode itself.
grant execute on function get_active_room()                            to anon, authenticated;
grant execute on function join_room(text, text, text)                  to anon, authenticated;
grant execute on function room_lobby(text)                             to anon, authenticated;
grant execute on function answer_question(uuid, uuid, text, text)      to anon, authenticated;
grant execute on function finish_run(uuid, uuid)                       to anon, authenticated;
grant execute on function reveal_hint(uuid, uuid, text)                to anon, authenticated;
-- mask_answer stays ungranted: it masks any string handed to it, which is only
-- useful to somebody who already has the answer.
grant execute on function start_game(text, text)                       to anon, authenticated;
grant execute on function admin_get_questions(text)                    to anon, authenticated;
grant execute on function admin_publish_questions(text, jsonb, boolean) to anon, authenticated;
grant execute on function create_room(text, jsonb)                     to anon, authenticated;
-- start_game is on that list because the passcode is the lock, exactly as it is
-- for create_room: the browser sends a passcode, admin_verify checks it against
-- the bcrypt hash under a 5-attempt lockout, and a wrong one gets nothing.
--
-- Deliberately NOT granted, and each for its own reason:
--   start_run          — players must come through join_room, which requires a room.
--   set_admin_passcode — while no hash exists it accepts a null current passcode, so
--                        exposing it lets the first stranger to find the project claim
--                        admin. Set it from the SQL editor instead (bottom of this file).
--   normalize_text / answer_matches / admin_verify / admin_check_lockout /
--   room_ttl / room_capacity / room_is_live / room_remaining_ms / session_ms /
--   bucket_seconds / bucket_of — internals. answer_matches in particular would
--                        let anyone test candidate answers offline.

-- PostgREST caches the schema; tell it to look again, or the new RPCs answer 404
-- for a minute or two after this file runs.
notify pgrst, 'reload schema';

-- ============================================================================
-- One more step, and it has to be done from this SQL editor rather than the app,
-- because set_admin_passcode is not exposed to anon (see the grants above):
--
--   select set_admin_passcode(null, '<ADMIN_PASSCODE>');
--
-- Use the same value as VITE_ADMIN_PASSCODE. Until it is set, the admin panel
-- cannot be unlocked. After it is set, rotating it requires the current one.
-- Re-running this file does NOT reset an existing passcode.
--
-- Then open /admin in the app, paste the ten questions, hit Save, and open a
-- room. Read the code out, watch the grid fill up, and press Start.
-- ============================================================================

-- Report: every line should read true.
select 'runs.answered exists' as check,
       exists (select 1 from information_schema.columns
               where table_name = 'runs' and column_name = 'answered')::text as value
union all
select 'rooms.started_at exists',
       exists (select 1 from information_schema.columns
               where table_name = 'rooms' and column_name = 'started_at')::text
union all
select 'scores.run_id exists',
       exists (select 1 from information_schema.columns
               where table_name = 'scores' and column_name = 'run_id')::text
union all
select 'join_room hands over all questions',
       (pg_get_functiondef('public.join_room(text,text,text)'::regprocedure) like '%''questions''%')::text
union all
select 'leaderboard window is 2h',
       (bucket_seconds() = 7200)::text
union all
select 'anon can call room_lobby',
       has_function_privilege('anon', 'public.room_lobby(text)', 'execute')::text
union all
select 'anon can call start_game (passcode still required)',
       has_function_privilege('anon', 'public.start_game(text,text)', 'execute')::text
union all
select 'anon CANNOT call start_run (want false)',
       has_function_privilege('anon', 'public.start_run(text,text)', 'execute')::text;
