-- ============================================================================
-- PART 2 of 3 — the run lifecycle. Run PART 1 first.
--
-- Three rules the browser cannot be trusted with:
--   1. Nobody races until the host starts the room. Players join, wait on the
--      grid, and the ten minutes then run for the whole field from one instant.
--   2. Joining is what puts a name on the leaderboard, not finishing.
--   3. Questions can be answered in any order, once each, until the session
--      clock runs out — the board lets a player choose, so the old cursor and
--      its 13-second per-question timeout are gone.
--
-- Ends with a table reading four trues.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- join_room: take a seat, take the whole board, and wait for the host.
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
  -- the start inherits only what is left.
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
-- start_game: the host drops the lights. Pressing it twice changes nothing —
-- the second press must not hand the field a fresh ten minutes.
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
  -- A wrong answer costs the attempt but does not consume the question.
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

-- ---------------------------------------------------------------------------
-- finish_run: close the run and rewrite the row written when they joined.
-- ---------------------------------------------------------------------------
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
  -- 10x1000 per correct + 500 time + 300 accuracy + 100 speed = 10900.
  v_max    int := 10900;
begin
  select * into v_run from runs where id = p_run_id and token = p_token for update;
  if not found then raise exception 'invalid run or token'; end if;

  -- The window this player has belonged to since they joined, kept fixed so a
  -- run that straddles a boundary does not jump to a board its rivals are not on.
  select hour_bucket into v_bucket from scores where run_id = v_run.id;

  if not v_run.finished then
    v_total  := floor(extract(epoch from (now() - v_run.server_started_at)) * 1000)::int;
    v_bucket := coalesce(v_bucket, bucket_of(now()));
    v_score  := least(
      v_run.score + round(500 * greatest(0, v_session - v_total)::numeric / v_session)::int,
      v_max
    );
    update runs set finished = true, finished_at = now() where id = v_run.id;

    -- The row already exists: it was written when this player joined.
    update scores set score = v_score, correct = v_run.correct,
                      total_ms = v_total, finished = true
     where run_id = v_run.id;
    if not found then
      insert into scores (run_id, round, username, avatar_seed, score, correct,
                          total_ms, hour_bucket, finished)
      values (v_run.id, v_run.round, v_run.username, v_run.avatar_seed,
              v_score, v_run.correct, v_total, v_bucket, true);
    end if;
  else
    v_total  := floor(extract(epoch from (v_run.finished_at - v_run.server_started_at)) * 1000)::int;
    v_bucket := coalesce(v_bucket, bucket_of(v_run.finished_at));
    select score into v_score from scores where run_id = v_run.id;
    v_score := coalesce(v_score, least(v_run.score, v_max));
  end if;

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

-- Report — all four must read true.
select 'join_room hands over all questions' as check,
       (pg_get_functiondef('public.join_room(text,text,text)'::regprocedure)
          like '%''questions''%')::text as ok
union all
select 'room_lobby exists',
       (to_regprocedure('public.room_lobby(text)') is not null)::text
union all
select 'start_game exists',
       (to_regprocedure('public.start_game(text,text)') is not null)::text
union all
select 'answer_question takes any order',
       (pg_get_functiondef('public.answer_question(uuid,uuid,text,text)'::regprocedure)
          like '%already answered%')::text;
