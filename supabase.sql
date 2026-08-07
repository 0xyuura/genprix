-- ============================================================================
-- GenLayer Grand Prix — Supabase schema, RLS, and server-authoritative RPCs.
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Then set the admin passcode:   select set_admin_passcode(null, '713962');
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
  created_at  timestamptz not null default now()
);
create index if not exists scores_round_rank on scores (round, score desc, total_ms asc);

-- ---------------------------------------------------------------------------
-- Row Level Security: default-deny everywhere. Anon reads only via views/config.
-- ---------------------------------------------------------------------------
alter table config          enable row level security;
alter table admin_config    enable row level security;
alter table admin_attempts  enable row level security;
alter table questions       enable row level security;
alter table runs            enable row level security;
alter table scores          enable row level security;

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
  select round, username, avatar_seed, score, correct, total_ms, created_at from scores;

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
  v_limit   int := 20000;  -- ms, mirrors TIME_LIMIT_MS
  v_grace   int := 25000;  -- ms, hard server timeout (limit + latency buffer)
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
  v_run   runs%rowtype;
  v_score int;
  v_total int;
  v_rank  int;
  v_max   int := 3375;  -- MAX_SCORE_PER_ROUND anti-cheat clamp
begin
  select * into v_run from runs where id = p_run_id and token = p_token for update;
  if not found then raise exception 'invalid run or token'; end if;

  v_score := least(v_run.score, v_max);

  if not v_run.finished then
    v_total := floor(extract(epoch from (now() - v_run.server_started_at)) * 1000)::int;
    update runs set finished = true, finished_at = now() where id = v_run.id;
    insert into scores (round, username, avatar_seed, score, correct, total_ms)
    values (v_run.round, v_run.username, v_run.avatar_seed, v_score, v_run.correct, v_total);
  else
    v_total := floor(extract(epoch from (v_run.finished_at - v_run.server_started_at)) * 1000)::int;
  end if;

  select count(*) + 1 into v_rank from scores
  where round = v_run.round
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
revoke all on function answer_question(uuid, uuid, text, text) from public;
revoke all on function finish_run(uuid, uuid)           from public;
revoke all on function admin_get_questions(text)        from public;
revoke all on function admin_publish_questions(text, jsonb, boolean) from public;
revoke all on function set_admin_passcode(text, text)   from public;

grant execute on function start_run(text, text)                        to anon, authenticated;
grant execute on function answer_question(uuid, uuid, text, text)      to anon, authenticated;
grant execute on function finish_run(uuid, uuid)                       to anon, authenticated;
grant execute on function admin_get_questions(text)                    to anon, authenticated;
grant execute on function admin_publish_questions(text, jsonb, boolean) to anon, authenticated;
grant execute on function set_admin_passcode(text, text)               to anon, authenticated;
-- normalize_text / answer_matches / admin_check_lockout / admin_verify: internal only.

-- ============================================================================
-- After running: seed the first round's questions from the app's /admin panel
-- (paste them in and hit Save), or insert them manually. Then set the passcode:
--   select set_admin_passcode(null, '713962');
-- ============================================================================
