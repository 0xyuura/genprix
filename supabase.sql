-- ============================================================================
-- GenLayer Grand Prix — Supabase schema, RLS, and server-authoritative RPCs.
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Then set the admin passcode:   select set_admin_passcode(null, '<ADMIN_PASSCODE>');
-- ============================================================================

create extension if not exists pgcrypto;      -- crypt(), gen_salt(), gen_random_uuid()
create extension if not exists fuzzystrmatch; -- levenshtein()
create extension if not exists unaccent;      -- diacritics stripping

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

-- Private: full questions incl. hidden answers/explanations.
create table if not exists questions (
  round       int  not null,
  order_idx   int  not null,
  qid         text not null,
  prompt      text not null,
  accepted    text[] not null,
  hint        text,
  explanation text not null,
  primary key (round, order_idx),
  unique (round, qid)
);

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

-- Finalized leaderboard rows. Written ONLY by finish_run.
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
-- Global leaderboard is bucketed by clock hour so it auto-resets every hour.
create index if not exists scores_hour_rank on scores (hour_bucket, score desc, total_ms asc);

-- Admin-created game rooms. The ACTIVE room is the newest one; its share code is
-- how players join. Players cannot start a game unless an active room exists.
--
-- A code is SINGLE USE: it hosts exactly one game. finish_run flips the room to
-- 'done', after which the code can never start another round, and join_room also
-- refuses a name that has already raced in that room. Hosts create a fresh room
-- per round — that is what stops replaying the same questions to farm the board.
create table if not exists rooms (
  code       text primary key,
  round      int  not null,
  status     text not null default 'open' check (status in ('open', 'done')),
  closed_at  timestamptz,
  created_at timestamptz not null default now()
);
-- Upgrade path for databases created before the single-use rule shipped.
alter table rooms add column if not exists status    text not null default 'open';
alter table rooms add column if not exists closed_at timestamptz;

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
-- No anon policy on rooms => join/create/status go through RPCs only.

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

grant select on questions_public to anon, authenticated;
grant select on scores_public   to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Mirror of the client-side normalize(): lower, de-accent, strip punctuation, collapse.
create or replace function normalize_text(t text)
returns text language sql immutable
set search_path = public, pg_temp as $$
  select trim(regexp_replace(
           regexp_replace(lower(unaccent(coalesce(t, ''))), '[^a-z0-9[:space:]]', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;

-- Fuzzy answer match mirroring checkAnswer (exact OR Levenshtein<=1 for len>=4).
create or replace function answer_matches(p_answer text, p_accepted text[])
returns boolean language sql immutable
set search_path = public, pg_temp as $$
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
security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from admin_attempts where created_at > now() - interval '15 minutes') >= 5 then
    raise exception 'admin locked: too many attempts, try again later';
  end if;
end;
$$;

-- Verify passcode against bcrypt hash; log + raise on mismatch. Constant-ish via crypt.
create or replace function admin_verify(p_passcode text)
returns void language plpgsql
security definer set search_path = public, pg_temp as $$
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
security definer set search_path = public, pg_temp as $$
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
security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'open', exists (select 1 from rooms where status = 'open')
  );
$$;

-- Join the active room by its shared code, then start a run for that room's questions.
create or replace function join_room(p_code text, p_username text, p_avatar_seed text)
returns jsonb language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_name   text;
  v_active rooms%rowtype;
  v_run    runs%rowtype;
  v_q      questions%rowtype;
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
  -- Single use: the code dies with the run it hosted.
  if v_active.status <> 'open' then
    raise exception 'this code has already been played — ask the host for a new code';
  end if;
  if exists (
    select 1 from runs
    where round = v_active.round and lower(trim(username)) = lower(v_name)
  ) then
    raise exception 'you already raced in this room — ask the host for a new code';
  end if;
  if not exists (select 1 from questions where round = v_active.round and order_idx = 0) then
    raise exception 'room has no questions';
  end if;

  insert into runs (round, username, avatar_seed)
  values (v_active.round, v_name, coalesce(p_avatar_seed, ''))
  returning * into v_run;

  select * into v_q from questions where round = v_active.round and order_idx = 0;

  return jsonb_build_object(
    'run_id', v_run.id,
    'token',  v_run.token,
    'index',  0,
    'question', jsonb_build_object('id', v_q.qid, 'prompt', v_q.prompt, 'hint', v_q.hint)
  );
end;
$$;

create or replace function answer_question(p_run_id uuid, p_token uuid, p_question_id text, p_answer text)
returns jsonb language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_run    runs%rowtype;
  v_q      questions%rowtype;
  v_next   questions%rowtype;
  v_elapsed int;
  v_correct bool;
  v_speed   int;
  v_pts     int;
  v_streak  int;
  v_limit   int := 10000;  -- ms, mirrors TIME_LIMIT_MS
  v_grace   int := 13000;  -- ms, hard server timeout (limit + latency buffer)
begin
  select * into v_run from runs where id = p_run_id and token = p_token for update;
  if not found then raise exception 'invalid run or token'; end if;
  if v_run.finished then raise exception 'run already finished'; end if;

  select * into v_q from questions where round = v_run.round and order_idx = v_run.current_index;
  if not found then raise exception 'no active question'; end if;
  if v_q.qid <> p_question_id then raise exception 'question out of order'; end if;

  v_elapsed := floor(extract(epoch from (now() - v_run.question_served_at)) * 1000)::int;

  if v_elapsed > v_grace then
    v_correct := false;  -- timed out server-side
  else
    v_correct := answer_matches(p_answer, v_q.accepted);
  end if;

  if v_correct then
    v_speed  := round(100 * (v_limit - least(v_elapsed, v_limit))::numeric / v_limit);
    v_streak := v_run.streak + 1;
    v_pts    := 100 + v_speed + 25 * v_streak;
  else
    v_streak := 0;
    v_pts    := 0;
  end if;

  update runs set
    score = score + v_pts,
    correct = correct + (case when v_correct then 1 else 0 end),
    streak = v_streak,
    current_index = current_index + 1,
    question_served_at = now()
  where id = v_run.id
  returning * into v_run;

  select * into v_next from questions where round = v_run.round and order_idx = v_run.current_index;

  return jsonb_build_object(
    'correct', v_correct,
    'points_awarded', v_pts,
    'correct_answer', v_q.accepted[1],
    'explanation', v_q.explanation,
    'new_score', v_run.score,
    'correct_count', v_run.correct,
    'index', v_run.current_index,
    'next_question', case when found
      then jsonb_build_object('id', v_next.qid, 'prompt', v_next.prompt, 'hint', v_next.hint)
      else null end
  );
end;
$$;

create or replace function finish_run(p_run_id uuid, p_token uuid)
returns jsonb language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_run    runs%rowtype;
  v_score  int;
  v_total  int;
  v_rank   int;
  v_bucket bigint;
  -- Anti-cheat clamp; must track MAX_SCORE in src/game/scoring.ts:
  -- 10×100 base + 600s×5 time bonus + 200 WPM×2 typing bonus = 4400.
  v_max    int := 4400;
begin
  select * into v_run from runs where id = p_run_id and token = p_token for update;
  if not found then raise exception 'invalid run or token'; end if;

  v_score := least(v_run.score, v_max);

  if not v_run.finished then
    v_total  := floor(extract(epoch from (now() - v_run.server_started_at)) * 1000)::int;
    v_bucket := floor(extract(epoch from now()) / 3600)::bigint;
    update runs set finished = true, finished_at = now() where id = v_run.id;
    insert into scores (round, username, avatar_seed, score, correct, total_ms, hour_bucket)
    values (v_run.round, v_run.username, v_run.avatar_seed, v_score, v_run.correct, v_total, v_bucket);
    -- Burn the room code: one code hosts one game, so no second round can start.
    update rooms set status = 'done', closed_at = now()
    where round = v_run.round and status = 'open';
  else
    v_total  := floor(extract(epoch from (v_run.finished_at - v_run.server_started_at)) * 1000)::int;
    v_bucket := floor(extract(epoch from v_run.finished_at) / 3600)::bigint;
  end if;

  -- Rank within the current hour's global board.
  select count(*) + 1 into v_rank from scores
  where hour_bucket = v_bucket
    and (score > v_score or (score = v_score and total_ms < v_total));

  return jsonb_build_object(
    'score', v_score, 'correct', v_run.correct, 'total_ms', v_total, 'rank', v_rank
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs (passcode + lockout protected)
-- ---------------------------------------------------------------------------
create or replace function admin_get_questions(p_passcode text)
returns jsonb language plpgsql
security definer set search_path = public, pg_temp as $$
declare v_round int; v_out jsonb;
begin
  perform admin_verify(p_passcode);
  select active_round into v_round from config where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', qid, 'prompt', prompt, 'accepted', accepted,
           'hint', coalesce(hint, ''), 'explanation', explanation
         ) order by order_idx), '[]'::jsonb)
    into v_out from questions where round = v_round;
  return v_out;
end;
$$;

create or replace function admin_publish_questions(p_passcode text, p_questions jsonb, p_bump boolean)
returns jsonb language plpgsql
security definer set search_path = public, pg_temp as $$
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
    if coalesce(v_elem->>'explanation', '') = '' then raise exception 'each question needs an explanation'; end if;
    if jsonb_typeof(v_elem->'accepted') <> 'array'
       or jsonb_array_length(v_elem->'accepted') < 1 then
      raise exception 'each question needs at least one accepted answer';
    end if;
  end loop;

  select active_round into v_round from config where id = 1;
  v_target := case when p_bump then v_round + 1 else v_round end;

  delete from questions where round = v_target;

  for v_elem in select * from jsonb_array_elements(p_questions) loop
    insert into questions (round, order_idx, qid, prompt, accepted, hint, explanation)
    values (
      v_target,
      v_i,
      coalesce(nullif(v_elem->>'id', ''), 'q' || (v_i + 1)),
      v_elem->>'prompt',
      array(select jsonb_array_elements_text(v_elem->'accepted')),
      nullif(v_elem->>'hint', ''),
      v_elem->>'explanation'
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
-- This becomes the active game; players join via join_room(code).
create or replace function create_room(p_passcode text, p_questions jsonb)
returns jsonb language plpgsql
security definer set search_path = public, pg_temp as $$
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
    if coalesce(v_elem->>'explanation', '') = '' then raise exception 'each question needs an explanation'; end if;
    if jsonb_typeof(v_elem->'accepted') <> 'array'
       or jsonb_array_length(v_elem->'accepted') < 1 then
      raise exception 'each question needs at least one accepted answer';
    end if;
  end loop;

  select active_round + 1 into v_round from config where id = 1;
  delete from questions where round = v_round;
  for v_elem in select * from jsonb_array_elements(p_questions) loop
    insert into questions (round, order_idx, qid, prompt, accepted, hint, explanation)
    values (
      v_round, v_i,
      coalesce(nullif(v_elem->>'id', ''), 'q' || (v_i + 1)),
      v_elem->>'prompt',
      array(select jsonb_array_elements_text(v_elem->'accepted')),
      nullif(v_elem->>'hint', ''),
      v_elem->>'explanation'
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
  insert into rooms (code, round) values (v_code, v_round);

  return jsonb_build_object('code', v_code, 'round', v_round);
end;
$$;

create or replace function set_admin_passcode(p_current text, p_new text)
returns jsonb language plpgsql
security definer set search_path = public, pg_temp as $$
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
-- Grants: expose only the intended RPCs to anon. Revoke the rest from public.
-- ---------------------------------------------------------------------------
revoke all on function normalize_text(text)            from public;
revoke all on function answer_matches(text, text[])     from public;
revoke all on function admin_check_lockout()            from public;
revoke all on function admin_verify(text)               from public;
revoke all on function start_run(text, text)            from public;
revoke all on function get_active_room()                from public;
revoke all on function join_room(text, text, text)      from public;
revoke all on function answer_question(uuid, uuid, text, text) from public;
revoke all on function finish_run(uuid, uuid)           from public;
revoke all on function admin_get_questions(text)        from public;
revoke all on function admin_publish_questions(text, jsonb, boolean) from public;
revoke all on function create_room(text, jsonb)         from public;
revoke all on function set_admin_passcode(text, text)   from public;

grant execute on function get_active_room()                            to anon, authenticated;
grant execute on function join_room(text, text, text)                  to anon, authenticated;
grant execute on function answer_question(uuid, uuid, text, text)      to anon, authenticated;
grant execute on function finish_run(uuid, uuid)                       to anon, authenticated;
grant execute on function admin_get_questions(text)                    to anon, authenticated;
grant execute on function admin_publish_questions(text, jsonb, boolean) to anon, authenticated;
grant execute on function create_room(text, jsonb)                     to anon, authenticated;
grant execute on function set_admin_passcode(text, text)               to anon, authenticated;
-- start_run is NOT granted to anon: players must go through join_room (an active room
-- is required). normalize_text / answer_matches / admin_* helpers: internal only.

-- ============================================================================
-- After running: seed the first round's questions from the app's /admin panel
-- (paste them in and hit Save), or insert them manually. Then set the passcode:
--   select set_admin_passcode(null, '<ADMIN_PASSCODE>');
-- ============================================================================
