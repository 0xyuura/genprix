-- ============================================================================
-- PART 5 of 5 — the host's Clear leaderboard button. Run PARTS 1-4 first.
--
-- Already applied to the live project on 2026-08-20; this file is here so a
-- fresh install can be brought to the same place.
--
-- The board clears itself every two hours. This is for a host running two
-- rounds back to back, who should not have to wait out the window.
--
-- Ends with a table reading two trues.
-- ============================================================================

-- Scoped to the CURRENT window on purpose: "clear the leaderboard" should mean
-- exactly "what is on the screen goes away", not "delete every row this project
-- has ever held".
--
-- It deliberately does NOT touch `runs`. One run per name per room is checked
-- against `runs`, so clearing the board is not a back door into racing the same
-- code twice.
create or replace function admin_clear_leaderboard(p_passcode text)
returns jsonb language plpgsql
security definer set search_path = public, extensions, pg_temp as $$
declare v_n int;
begin
  perform admin_verify(p_passcode);

  delete from scores where hour_bucket = bucket_of(now());
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'cleared', v_n);
end;
$$;

revoke all on function admin_clear_leaderboard(text) from public, anon, authenticated;
-- Granted for the same reason create_room and start_game are: the passcode is
-- the lock, checked against the bcrypt hash under a 5-attempt lockout, and a
-- wrong one gets nothing.
grant execute on function admin_clear_leaderboard(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Report — both true.
select 'admin_clear_leaderboard exists' as check,
       (to_regprocedure('public.admin_clear_leaderboard(text)') is not null)::text as ok
union all
select 'anon can call it (passcode still required)',
       has_function_privilege('anon', 'public.admin_clear_leaderboard(text)', 'execute')::text;
