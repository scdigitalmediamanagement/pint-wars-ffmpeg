-- Automatic Pint Wars completion foundation.
-- Apply this migration manually in Supabase. It intentionally does not create
-- or schedule a pg_cron job.
--
-- This migration:
--   * adds a privileged, global, idempotent completion function;
--   * makes completion notifications calculate winners from score events;
--   * serializes pint and review scoring with completion on the league row.
--
-- It does not change scoring values, historical score events, payments,
-- Passport, review UI, or the existing notification event keys.

do $$
begin
  if to_regclass('public.league_score_events') is null then
    raise exception
      'Automatic completion migration requires public.league_score_events';
  end if;

  if to_regclass('public.notifications') is null then
    raise exception
      'Automatic completion migration requires public.notifications';
  end if;
end
$$;

create or replace function public.complete_all_expired_leagues()
returns table (
  league_id uuid,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.leagues as league
  set
    status = 'completed',
    completed_at = coalesce(league.completed_at, now())
  where league.status = 'active'
    and league.ends_at <= now()
  returning league.id, league.completed_at;
end;
$$;

-- The scheduler/privileged database execution path owns this function.
-- Do not expose it as a client-callable RPC.
revoke execute on function public.complete_all_expired_leagues() from public, anon, authenticated;

create or replace function public.notify_league_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'active' or new.status <> 'completed' then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    league_id,
    event_key
  )
  select
    membership.user_id,
    'war_finished',
    'Pint War finished',
    new.name || ' has finished.',
    new.id,
    'war_finished:' || new.id::text || ':' || membership.user_id::text
  from public.league_memberships as membership
  where membership.league_id = new.id
    and membership.status <> 'removed'
  on conflict (user_id, event_key) do nothing;

  with scores as (
    select
      membership.user_id,
      coalesce(sum(score_event.points), 0)::bigint as points
    from public.league_memberships as membership
    left join public.league_score_events as score_event
      on score_event.league_id = membership.league_id
     and score_event.user_id = membership.user_id
    where membership.league_id = new.id
      and membership.status <> 'removed'
    group by membership.user_id
  ),
  winners as (
    select score.user_id, score.points
    from scores as score
    where score.points = (select max(scores.points) from scores)
  )
  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    league_id,
    event_key
  )
  select
    winner.user_id,
    'winner',
    case
      when (select count(*) from winners) = 1 then 'You won the Pint War'
      else 'You tied for the win'
    end,
    case
      when (select count(*) from winners) = 1
        then 'You won ' || new.name || ' with ' || winner.points::text ||
          case when winner.points = 1 then ' point.' else ' points.' end
      else 'You tied for the win in ' || new.name || ' with ' || winner.points::text ||
        case when winner.points = 1 then ' point.' else ' points.' end
    end,
    new.id,
    'winner:' || new.id::text || ':' || winner.user_id::text
  from winners as winner
  on conflict (user_id, event_key) do nothing;

  return new;
end;
$$;

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

  -- The existing global first-visit uniqueness and +2 value are unchanged.
  if p_pub_provider = 'google_places'
     and p_pub_place_id is not null then
    insert into public.league_score_events (
      league_id,
      user_id,
      event_type,
      points,
      pint_log_id,
      pub_provider,
      pub_place_id,
      created_at
    )
    values (
      p_league_id,
      p_user_id,
      'NEW_PUB',
      2,
      new_pint_id,
      p_pub_provider,
      p_pub_place_id,
      new_logged_at
    )
    on conflict (user_id, pub_provider, pub_place_id)
      where event_type = 'NEW_PUB'
    do nothing;
  end if;

  return query select new_pint_id, new_logged_at;
end;
$$;

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

  -- Lock the league while checking its active time window. Completion uses
  -- the same league-row lock, so only one side can cross the boundary first.
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
      3,
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