-- Pint Wars scoring foundation: immutable, auditable score events.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.
--
-- Locked rules represented here:
--   PINT_LOGGED = 1 point
--   NEW_PUB     = 2 points, at most once per player and pub globally
--   PUB_REVIEW  = 3 points, at most once per player and pub globally
--
-- This migration creates only the ledger and its historical base events.
-- Live scoring RPCs, totals, notifications, and UI are updated separately.

do $$
begin
  if to_regclass('public.league_score_events') is not null then
    raise exception
      'Scoring ledger migration refused: public.league_score_events already exists';
  end if;
end
$$;

create table public.league_score_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (
    event_type in ('PINT_LOGGED', 'NEW_PUB', 'PUB_REVIEW')
  ),
  points integer not null check (points > 0),
  pint_log_id uuid references public.pint_logs(id) on delete restrict,
  review_id uuid,
  pub_provider text,
  pub_place_id text,
  created_at timestamptz not null default now(),
  constraint league_score_events_type_points_check check (
    (event_type = 'PINT_LOGGED' and points = 1)
    or (event_type = 'NEW_PUB' and points = 2)
    or (event_type = 'PUB_REVIEW' and points = 3)
  ),
  constraint league_score_events_source_check check (
    (event_type = 'PINT_LOGGED'
      and pint_log_id is not null
      and review_id is null)
    or
    (event_type = 'NEW_PUB'
      and pint_log_id is not null
      and review_id is null
      and pub_provider = 'google_places'
      and pub_place_id is not null
      and char_length(pub_place_id) between 1 and 500)
    or
    (event_type = 'PUB_REVIEW'
      and pint_log_id is not null
      and review_id is not null
      and pub_provider = 'google_places'
      and pub_place_id is not null
      and char_length(pub_place_id) between 1 and 500)
  )
);

comment on table public.league_score_events is
  'Immutable Pint Wars score ledger. Bonus uniqueness is global per player and pub; league_id attributes each event to the league score.';
comment on column public.league_score_events.event_type is
  'PINT_LOGGED (+1), NEW_PUB (+2), or PUB_REVIEW (+3).';
comment on column public.league_score_events.pint_log_id is
  'Source pint log. Required for base and pub bonus events; retained as an immutable audit reference.';
comment on column public.league_score_events.review_id is
  'Source review identifier for PUB_REVIEW. It is intentionally not a foreign key so deleting a review cannot delete or invalidate its historical award.';
comment on column public.league_score_events.pub_provider is
  'Stable pub identity provider captured when a pub-specific event is awarded.';
comment on column public.league_score_events.pub_place_id is
  'Stable pub identity captured when a pub-specific event is awarded.';

create unique index league_score_events_pint_log_unique_idx
  on public.league_score_events(pint_log_id)
  where event_type = 'PINT_LOGGED';

create unique index league_score_events_new_pub_unique_idx
  on public.league_score_events(user_id, pub_provider, pub_place_id)
  where event_type = 'NEW_PUB';

create unique index league_score_events_pub_review_unique_idx
  on public.league_score_events(user_id, pub_provider, pub_place_id)
  where event_type = 'PUB_REVIEW';

create index league_score_events_league_user_idx
  on public.league_score_events(league_id, user_id, created_at);

create index league_score_events_user_pub_idx
  on public.league_score_events(user_id, pub_provider, pub_place_id)
  where event_type in ('NEW_PUB', 'PUB_REVIEW');

create or replace function public.reject_league_score_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'League score events are immutable';
end;
$$;

revoke execute on function public.reject_league_score_event_mutation() from public, anon, authenticated;

create trigger league_score_events_immutable
before update or delete on public.league_score_events
for each row
execute function public.reject_league_score_event_mutation();

alter table public.league_score_events enable row level security;

revoke all on public.league_score_events from public, anon, authenticated;
grant select on public.league_score_events to authenticated;

create policy "players can read their own score events"
  on public.league_score_events
  for select
  to authenticated
  using (user_id = auth.uid());

-- Backfill only the historical +1 base event. Historical NEW_PUB and PUB_REVIEW
-- bonuses are intentionally not inferred or awarded.
insert into public.league_score_events (
  league_id,
  user_id,
  event_type,
  points,
  pint_log_id,
  review_id,
  pub_provider,
  pub_place_id,
  created_at
)
select
  pint_log.league_id,
  pint_log.user_id,
  'PINT_LOGGED',
  1,
  pint_log.id,
  null,
  pint_log.pub_provider,
  pint_log.pub_place_id,
  pint_log.logged_at
from public.pint_logs as pint_log;

do $$
declare
  pint_log_count bigint;
  base_event_count bigint;
  bonus_event_count bigint;
begin
  select count(*) into pint_log_count
  from public.pint_logs;

  select count(*) into base_event_count
  from public.league_score_events
  where event_type = 'PINT_LOGGED';

  select count(*) into bonus_event_count
  from public.league_score_events
  where event_type in ('NEW_PUB', 'PUB_REVIEW');

  if base_event_count <> pint_log_count then
    raise exception
      'Scoring ledger backfill verification failed: expected % PINT_LOGGED events, found %',
      pint_log_count,
      base_event_count;
  end if;

  if bonus_event_count <> 0 then
    raise exception
      'Scoring ledger backfill verification failed: expected zero historical bonus events, found %',
      bonus_event_count;
  end if;

  raise notice
    'Scoring ledger backfilled % PINT_LOGGED events; no historical bonus events created',
    base_event_count;
end
$$;