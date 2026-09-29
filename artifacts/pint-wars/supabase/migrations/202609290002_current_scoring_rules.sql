-- Change future scoring awards without rewriting immutable historical events.
-- Apply manually in Supabase when ready; this migration is not applied by the app.
-- Existing NEW_PUB (+2) and PUB_REVIEW (+3) ledger rows remain unchanged.

begin;

do $preflight$
declare
  totals_definition text;
  completion_definition text;
begin
  if to_regclass('public.league_score_events') is null
     or to_regclass('public.pub_review_bonus_guards') is null then
    raise exception 'Current scoring migration requires the immutable score ledger and durable review guards';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leagues'
      and column_name = 'duration_days'
      and data_type = 'integer'
  ) or to_regprocedure('public.create_paid_league(text,uuid,integer)') is null then
    raise exception 'Apply the paid-league duration migration before the scoring migration';
  end if;

  if to_regprocedure(
       'public.log_pint_verified(uuid,uuid,text,text,double precision,double precision,text,text,text,text,double precision,double precision)'
     ) is null
     or to_regprocedure(
       'public.create_pub_review(text,text,uuid,smallint,smallint,smallint,smallint,boolean,smallint,smallint,text)'
     ) is null
     or to_regprocedure('public.get_league_pint_totals(uuid)') is null
     or to_regprocedure('public.notify_league_completed()') is null then
    raise exception 'Current scoring RPC definitions are missing; inspect deployed migration history before proceeding';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.league_score_events'::regclass
      and conname = 'league_score_events_type_points_check'
  ) then
    raise exception 'Expected score-event points constraint is missing';
  end if;

  if to_regclass('public.league_score_events_pub_review_unique_idx') is null
     or not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.pub_review_bonus_guards'::regclass
         and contype = 'p'
         and pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, pub_provider, pub_place_id)'
     ) then
    raise exception 'Global per-player/per-pub review bonus protections are missing';
  end if;

  if exists (
    select 1
    from public.league_score_events
    where (event_type = 'PINT_LOGGED' and points <> 1)
       or (event_type = 'NEW_PUB' and points <> 2)
       or (event_type = 'PUB_REVIEW' and points not in (1, 3))
  ) then
    raise exception 'Unexpected historical score values found; refusing to rewrite or discard them';
  end if;

  totals_definition := lower(pg_get_functiondef('public.get_league_pint_totals(uuid)'::regprocedure));
  if position('league_score_events' in totals_definition) = 0
     or position('sum(score_event.points)' in totals_definition) = 0 then
    raise exception 'Leaderboard totals must continue to sum the immutable score ledger';
  end if;

  completion_definition := lower(pg_get_functiondef('public.notify_league_completed()'::regprocedure));
  if position('league_score_events' in completion_definition) = 0
     or position('sum(score_event.points)' in completion_definition) = 0 then
    raise exception 'Completed-war winner notifications must continue to sum the immutable score ledger';
  end if;
end
$preflight$;

-- Keep historical values valid, while allowing new PUB_REVIEW events to be +1.
alter table public.league_score_events
  drop constraint league_score_events_type_points_check;

alter table public.league_score_events
  add constraint league_score_events_type_points_check
  check (
    (event_type = 'PINT_LOGGED' and points = 1)
    or (event_type = 'NEW_PUB' and points = 2)
    or (event_type = 'PUB_REVIEW' and points in (1, 3))
  );

comment on table public.league_score_events is
  'Immutable score facts. Current rules: PINT_LOGGED = +1 and PUB_REVIEW = +1 once per player and pub; visiting a pub has no separate award. Historical NEW_PUB (+2) and PUB_REVIEW (+3) rows remain unchanged.';

comment on column public.league_score_events.points is
  'Points recorded by the immutable event. New pint and review events are +1; retired NEW_PUB (+2) and historical PUB_REVIEW (+3) values are preserved.';

-- The ledger constraint accepts old values for history; this trigger ensures
-- every new row follows the current rules, including service-role writes.
create or replace function public.enforce_current_score_event_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'NEW_PUB' then
    raise exception 'NEW_PUB score events are disabled; pub visits do not earn bonus points'
      using errcode = '23514';
  end if;

  if new.event_type = 'PINT_LOGGED' and new.points <> 1 then
    raise exception 'Every PINT_LOGGED score event must be worth one point'
      using errcode = '23514';
  end if;

  if new.event_type = 'PUB_REVIEW' and new.points <> 1 then
    raise exception 'Every new PUB_REVIEW score event must be worth one point'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_current_score_event_rules()
  from public, anon, authenticated;

drop trigger if exists enforce_current_score_event_rules
  on public.league_score_events;

create trigger enforce_current_score_event_rules
before insert on public.league_score_events
for each row
execute function public.enforce_current_score_event_rules();

-- Preserve the server-authoritative pint flow, but stop creating NEW_PUB rows.
create or replace function public.log_pint_verified(
  p_user_id uuid,
  p_league_id uuid,
  p_photo_path text,
  p_content_sha256 text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_pub_provider text default null,
  p_pub_place_id text default null,
  p_pub_name text default null,
  p_pub_address text default null,
  p_pub_latitude double precision default null,
  p_pub_longitude double precision default null
)
returns table (pint_id uuid, logged_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_pint_id uuid;
  new_logged_at timestamptz;
  existing_photo_path text;
  locked_league_status public.league_status;
  locked_league_starts_at timestamptz;
  locked_league_ends_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This pint logging function is server-only';
  end if;

  if p_user_id is null then
    raise exception 'The authenticated user is required';
  end if;

  if p_content_sha256 is null
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'The pint proof content hash is invalid';
  end if;

  -- Completion and scoring serialize on the league row. If completion owns
  -- the lock first, this reads the completed status and rejects the pint.
  select
    league.status,
    league.starts_at,
    league.ends_at
  into
    locked_league_status,
    locked_league_starts_at,
    locked_league_ends_at
  from public.leagues as league
  where league.id = p_league_id
  for update;

  if not found then
    raise exception 'This Pint War was not found';
  end if;

  if not exists (
    select 1
    from public.league_memberships as membership
    where membership.league_id = p_league_id
      and membership.user_id = p_user_id
      and membership.status = 'active'
  ) then
    raise exception 'You are not an active member of this league';
  end if;

  if locked_league_status <> 'active'
     or locked_league_starts_at > now()
     or locked_league_ends_at <= now() then
    raise exception 'This Pint War is not active';
  end if;

  if p_photo_path not like p_user_id::text || '/' || p_league_id::text || '/%' then
    raise exception 'The pint proof path is invalid';
  end if;

  if not exists (
    select 1
    from storage.objects as proof
    where proof.bucket_id = 'pint-proofs'
      and proof.name = p_photo_path
  ) then
    raise exception 'The pint proof photo was not found';
  end if;

  select pint_log.photo_path
    into existing_photo_path
  from public.pint_logs as pint_log
  where pint_log.user_id = p_user_id
    and pint_log.league_id = p_league_id
    and pint_log.content_sha256 = p_content_sha256
  limit 1;

  if existing_photo_path is not null then
    raise exception 'This photo has already been used in this Pint War.'
      using errcode = 'P0001', detail = existing_photo_path;
  end if;

  if (
    p_pub_provider is null
    and p_pub_place_id is null
    and p_pub_name is null
    and p_pub_address is null
    and p_pub_latitude is null
    and p_pub_longitude is null
  ) then
    null;
  elsif (
    p_pub_provider is distinct from 'google_places'
    or p_pub_place_id is null
    or p_pub_name is null
    or p_pub_address is null
    or p_pub_latitude is null
    or p_pub_longitude is null
    or char_length(p_pub_place_id) not between 1 and 500
    or char_length(p_pub_name) not between 1 and 500
    or char_length(p_pub_address) not between 0 and 1000
    or p_pub_latitude not between -90 and 90
    or p_pub_longitude not between -180 and 180
  ) then
    raise exception 'The selected pub is invalid';
  elsif (
    p_latitude is null
    or p_longitude is null
    or (
      6371000 * 2 * asin(
        sqrt(
          least(
            1,
            greatest(
              0,
              power(sin(radians((p_pub_latitude - p_latitude) / 2)), 2)
              + cos(radians(p_latitude))
                * cos(radians(p_pub_latitude))
                * power(sin(radians((p_pub_longitude - p_longitude) / 2)), 2)
            )
          )
        )
      )
    ) > 750
  ) then
    raise exception 'The selected pub is too far from the logged location';
  end if;

  begin
    insert into public.pint_logs as pint_log (
      league_id,
      user_id,
      photo_path,
      content_sha256,
      latitude,
      longitude,
      pub_provider,
      pub_place_id,
      pub_name,
      pub_address,
      pub_latitude,
      pub_longitude
    )
    values (
      p_league_id,
      p_user_id,
      p_photo_path,
      p_content_sha256,
      p_latitude,
      p_longitude,
      p_pub_provider,
      p_pub_place_id,
      p_pub_name,
      p_pub_address,
      p_pub_latitude,
      p_pub_longitude
    )
    returning pint_log.id, pint_log.logged_at
      into new_pint_id, new_logged_at;
  exception
    when unique_violation then
      select pint_log.photo_path
        into existing_photo_path
      from public.pint_logs as pint_log
      where pint_log.user_id = p_user_id
        and pint_log.league_id = p_league_id
        and pint_log.content_sha256 = p_content_sha256
      limit 1;

      raise exception 'This photo has already been used in this Pint War.'
        using errcode = 'P0001', detail = existing_photo_path;
  end;

  -- Every accepted pint still receives exactly one +1 event.
  insert into public.league_score_events (
    league_id,
    user_id,
    event_type,
    points,
    pint_log_id,
    created_at
  )
  values (
    p_league_id,
    p_user_id,
    'PINT_LOGGED',
    1,
    new_pint_id,
    new_logged_at
  );

  return query select new_pint_id, new_logged_at;
end;
$$;

revoke execute on function public.log_pint_verified(
  uuid, uuid, text, text, double precision, double precision,
  text, text, text, text, double precision, double precision
) from public, anon, authenticated;

grant execute on function public.log_pint_verified(
  uuid, uuid, text, text, double precision, double precision,
  text, text, text, text, double precision, double precision
) to service_role;

-- The persistent player/pub guard and unique indexes still block recreation
-- or concurrent attempts from awarding more than one bonus.
create or replace function public.create_pub_review(
  p_pub_provider text,
  p_pub_place_id text,
  p_pint_log_id uuid,
  p_atmosphere_rating smallint,
  p_pints_drinks_rating smallint,
  p_staff_rating smallint,
  p_music_rating smallint,
  p_would_return boolean,
  p_food_rating smallint default null,
  p_value_rating smallint default null,
  p_review_text text default null
)
returns table (
  review_id uuid,
  pub_provider text,
  pub_place_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  qualifying_pint record;
  new_review_id uuid;
  bonus_already_guarded boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  if p_pub_provider is distinct from 'google_places'
     or nullif(trim(p_pub_place_id), '') is null then
    raise exception 'The pub identity is invalid';
  end if;
  if p_pint_log_id is null then
    raise exception 'A qualifying pint is required to review this pub';
  end if;
  if p_atmosphere_rating not between 1 and 5
    or p_pints_drinks_rating not between 1 and 5
    or p_staff_rating not between 1 and 5
    or p_music_rating not between 1 and 5
    or (p_food_rating is not null and p_food_rating not between 1 and 5)
    or (p_value_rating is not null and p_value_rating not between 1 and 5) then
    raise exception 'Ratings must be between 1 and 5';
  end if;
  if p_review_text is not null and char_length(p_review_text) > 3000 then
    raise exception 'The written review is too long';
  end if;

  -- Keep serialization with completion and pint logging on the league row.
  select
    pint_log.id,
    pint_log.league_id,
    pint_log.pub_provider,
    pint_log.pub_place_id,
    pint_log.pub_name,
    pint_log.pub_address
    into qualifying_pint
  from public.pint_logs as pint_log
  join public.leagues as league
    on league.id = pint_log.league_id
  where pint_log.id = p_pint_log_id
    and pint_log.user_id = auth.uid()
    and league.status = 'active'
    and league.starts_at <= now()
    and league.ends_at > now()
  for update of league;

  if not found then
    raise exception 'The qualifying pint was not found in an active Pint War';
  end if;

  if not exists (
    select 1
    from public.league_memberships as membership
    where membership.league_id = qualifying_pint.league_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  ) then
    raise exception 'You are not an active member of this Pint War';
  end if;

  if qualifying_pint.pub_provider is distinct from 'google_places'
     or qualifying_pint.pub_place_id is null then
    raise exception 'The qualifying pint does not have a confirmed pub identity';
  end if;
  if qualifying_pint.pub_provider is distinct from p_pub_provider
     or qualifying_pint.pub_place_id is distinct from p_pub_place_id then
    raise exception 'The qualifying pint does not match this pub';
  end if;
  if exists (
    select 1
    from public.pub_reviews as review
    where review.user_id = auth.uid()
      and review.pub_provider = p_pub_provider
      and review.pub_place_id = p_pub_place_id
  ) then
    raise exception 'You have already reviewed this pub';
  end if;

  select exists (
    select 1
    from public.pub_review_bonus_guards as guard
    where guard.user_id = auth.uid()
      and guard.pub_provider = p_pub_provider
      and guard.pub_place_id = p_pub_place_id
  )
  into bonus_already_guarded;

  insert into public.pub_reviews (
    user_id, pub_provider, pub_place_id, pub_name, pub_address,
    atmosphere_rating, pints_drinks_rating, staff_rating, music_rating,
    food_rating, value_rating, would_return, review_text
  )
  values (
    auth.uid(), p_pub_provider, p_pub_place_id,
    coalesce(qualifying_pint.pub_name, p_pub_place_id),
    coalesce(qualifying_pint.pub_address, ''),
    p_atmosphere_rating, p_pints_drinks_rating, p_staff_rating, p_music_rating,
    p_food_rating, p_value_rating, p_would_return, nullif(trim(p_review_text), '')
  )
  returning id into new_review_id;

  if not bonus_already_guarded then
    insert into public.league_score_events as score_event (
      league_id,
      user_id,
      event_type,
      points,
      pint_log_id,
      review_id,
      pub_provider,
      pub_place_id
    )
    values (
      qualifying_pint.league_id,
      auth.uid(),
      'PUB_REVIEW',
      1,
      qualifying_pint.id,
      new_review_id,
      p_pub_provider,
      p_pub_place_id
    )
    on conflict (
      user_id,
      (score_event.pub_provider),
      (score_event.pub_place_id)
    )
      where score_event.event_type = 'PUB_REVIEW'
    do nothing;

    insert into public.pub_review_bonus_guards as bonus_guard (
      user_id,
      pub_provider,
      pub_place_id,
      guard_source
    )
    values (
      auth.uid(),
      p_pub_provider,
      p_pub_place_id,
      'scored_review'
    )
    on conflict (
      user_id,
      (bonus_guard.pub_provider),
      (bonus_guard.pub_place_id)
    )
    do nothing;
  end if;

  return query select new_review_id, p_pub_provider, p_pub_place_id;
end;
$$;

revoke execute on function public.create_pub_review(
  text, text, uuid, smallint, smallint, smallint, smallint,
  boolean, smallint, smallint, text
) from public, anon;

grant execute on function public.create_pub_review(
  text, text, uuid, smallint, smallint, smallint, smallint,
  boolean, smallint, smallint, text
) to authenticated;

do $postflight$
declare
  pint_function_definition text;
  review_function_definition text;
begin
  pint_function_definition := pg_get_functiondef(
    'public.log_pint_verified(uuid,uuid,text,text,double precision,double precision,text,text,text,text,double precision,double precision)'::regprocedure
  );
  if position('NEW_PUB' in pint_function_definition) > 0 then
    raise exception 'The verified pint RPC still references the retired NEW_PUB event';
  end if;

  review_function_definition := pg_get_functiondef(
    'public.create_pub_review(text,text,uuid,smallint,smallint,smallint,smallint,boolean,smallint,smallint,text)'::regprocedure
  );
  if position('pub_review_bonus_guards' in lower(review_function_definition)) = 0
     or review_function_definition !~ $pattern$'PUB_REVIEW'\s*,\s*1\s*,\s*qualifying_pint\.id$pattern$ then
    raise exception 'The review RPC does not preserve the one-time +1 bonus rule';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.league_score_events'::regclass
      and tgname = 'enforce_current_score_event_rules'
      and not tgisinternal
  ) then
    raise exception 'The current scoring enforcement trigger is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leagues'
      and column_name = 'duration_days'
  ) or to_regprocedure('public.create_paid_league(text,uuid,integer)') is null then
    raise exception 'The existing paid-league duration schema was not preserved';
  end if;
end
$postflight$;

commit;