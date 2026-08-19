-- ============================================================================
-- PART 4 of 4 — server-side hints. Run PARTS 1-3 first.
--
-- Already applied to the live project on 2026-08-20; this file is here so a
-- fresh install can be brought to the same place, and so the change is readable
-- in the repo rather than only in the database.
--
-- Why it exists: in secure mode the client is sent prompts and hints, never
-- `accepted`. The hint button masked accepted[0] anyway, which is undefined
-- there, and the resulting TypeError was thrown inside a React state updater —
-- so it did not surface as a failed hint, it unmounted the entire app and left
-- the player staring at a black screen mid-race.
--
-- The mask now comes from here, and so does the count of hints spent, which
-- means a reload no longer refills them.
--
-- Ends with a table reading three trues and one false.
-- ============================================================================

alter table runs add column if not exists hints_used int not null default 0;

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

revoke all on function mask_answer(text) from public, anon, authenticated;
revoke all on function reveal_hint(uuid, uuid, text) from public, anon, authenticated;
grant execute on function reveal_hint(uuid, uuid, text) to anon, authenticated;
-- mask_answer stays ungranted: it masks any string handed to it, which is only
-- useful to somebody who already has the answer.

notify pgrst, 'reload schema';

-- Report — the first three true, the last false.
select 'runs.hints_used exists' as check,
       (to_regclass('public.runs') is not null
        and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'runs'
                      and column_name = 'hints_used'))::text as ok
union all
select 'mask matches the client (i _ ... _ t)',
       (mask_answer('intelligent') = 'i _ _ _ _ _ _ _ _ _ t')::text
union all
select 'anon can call reveal_hint',
       has_function_privilege('anon', 'public.reveal_hint(uuid,uuid,text)', 'execute')::text
union all
select 'anon CANNOT call mask_answer — must be false',
       has_function_privilege('anon', 'public.mask_answer(text)', 'execute')::text;
