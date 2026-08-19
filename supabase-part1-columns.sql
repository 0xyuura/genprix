-- ============================================================================
-- PART 1 of 3 — columns and helpers.
--
-- The full supabase.sql runs as one transaction, so a single failure anywhere
-- rolls back everything and the run can still look like it worked. Split into
-- three, a failure names itself: whichever part errors is the part at fault, and
-- the parts before it stay applied.
--
-- Run this one first. It should end with a table reading three trues.
-- ============================================================================

-- The host's start signal. Null while the field is still gathering.
alter table rooms add column if not exists started_at timestamptz;

-- Which questions a run has already taken. A set, not a cursor: the board shows
-- all ten and the player picks the order, so there is no "current" one.
alter table runs add column if not exists answered text[] not null default '{}';

-- A leaderboard row now belongs to a run and exists before that run has a result.
alter table scores add column if not exists run_id   uuid;
alter table scores add column if not exists finished boolean not null default true;
create unique index if not exists scores_run on scores (run_id) where run_id is not null;

-- Mirrors SESSION_MS in src/game/scoring.ts.
create or replace function session_ms() returns int
  language sql immutable as $$ select 600000 $$;

-- The leaderboard window: two hours, because one was shorter than a community
-- session and the board rolled over mid-event.
create or replace function bucket_seconds() returns int
  language sql immutable as $$ select 7200 $$;

create or replace function bucket_of(t timestamptz) returns bigint
  language sql stable as $$ select floor(extract(epoch from t) / bucket_seconds())::bigint $$;

alter table scores alter column hour_bucket set default bucket_of(now());
create index if not exists scores_hour_rank on scores (hour_bucket, score desc, total_ms asc);

-- How much of the session is left for a room. A room nobody has started yet has
-- the whole thing in front of it.
create or replace function room_remaining_ms(p_room rooms)
returns int language sql stable
security definer set search_path = public, extensions, pg_temp as $$
  select case
    when p_room.started_at is null then session_ms()
    else greatest(0, session_ms()
         - floor(extract(epoch from (now() - p_room.started_at)) * 1000)::int)
  end;
$$;

-- Report — all three must read true.
select 'rooms.started_at' as column_added,
       exists (select 1 from information_schema.columns
               where table_name = 'rooms' and column_name = 'started_at')::text as ok
union all
select 'runs.answered',
       exists (select 1 from information_schema.columns
               where table_name = 'runs' and column_name = 'answered')::text
union all
select 'scores.run_id + scores.finished',
       (exists (select 1 from information_schema.columns
                where table_name = 'scores' and column_name = 'run_id')
        and exists (select 1 from information_schema.columns
                    where table_name = 'scores' and column_name = 'finished'))::text;
