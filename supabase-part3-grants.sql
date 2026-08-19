-- ============================================================================
-- PART 3 of 3 — the board's public view and who may call what. Run PART 2 first.
--
-- This part is what makes the new functions visible at all: PostgREST filters
-- its schema cache by the caller's privileges, so a function anon cannot execute
-- is reported as "Could not find the function" (PGRST202) rather than as a
-- permission error. Same for a view anon cannot select (PGRST205).
--
-- Ends with a table that must read exactly one false: start_run.
-- ============================================================================

-- The board the app reads: the score rows, plus what a shared board needs to be
-- honest — which run each row belongs to, and whether that run is finished or
-- still out on track.
drop view if exists leaderboard_public;
create view leaderboard_public as
  select run_id, round, username, avatar_seed, score, correct, total_ms,
         finished, hour_bucket, created_at
  from scores;

grant select on leaderboard_public to anon, authenticated;

-- Revoking from PUBLIC alone is not enough on a managed Postgres: Supabase's
-- default privileges hand EXECUTE on every function in `public` straight to the
-- `anon` and `authenticated` roles, and a grant to a named role survives a
-- revoke from PUBLIC. Strip all three, then grant back only what the client calls.
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

grant execute on function get_active_room()                             to anon, authenticated;
grant execute on function join_room(text, text, text)                   to anon, authenticated;
grant execute on function room_lobby(text)                              to anon, authenticated;
grant execute on function answer_question(uuid, uuid, text, text)       to anon, authenticated;
grant execute on function finish_run(uuid, uuid)                        to anon, authenticated;
grant execute on function start_game(text, text)                        to anon, authenticated;
grant execute on function admin_get_questions(text)                     to anon, authenticated;
grant execute on function admin_publish_questions(text, jsonb, boolean)  to anon, authenticated;
grant execute on function create_room(text, jsonb)                      to anon, authenticated;
-- start_game is on that list because the passcode is the lock, exactly as it is
-- for create_room: admin_verify checks it against the bcrypt hash under a
-- 5-attempt lockout, and a wrong one gets nothing.
--
-- start_run stays ungranted: it opens a run with no room code, bypassing the
-- room, the 15-minute clock and one-run-per-name.

notify pgrst, 'reload schema';

-- Report — every line true EXCEPT the last, which must be false.
select 'anon can call join_room' as check,
       has_function_privilege('anon', 'public.join_room(text,text,text)', 'execute')::text as ok
union all
select 'anon can call room_lobby',
       has_function_privilege('anon', 'public.room_lobby(text)', 'execute')::text
union all
select 'anon can call start_game (passcode still required)',
       has_function_privilege('anon', 'public.start_game(text,text)', 'execute')::text
union all
select 'anon can read leaderboard_public',
       has_table_privilege('anon', 'public.leaderboard_public', 'select')::text
union all
select 'leaderboard window is 2h',
       (bucket_seconds() = 7200)::text
union all
select 'anon CANNOT call start_run — must be false',
       has_function_privilege('anon', 'public.start_run(text,text)', 'execute')::text;
