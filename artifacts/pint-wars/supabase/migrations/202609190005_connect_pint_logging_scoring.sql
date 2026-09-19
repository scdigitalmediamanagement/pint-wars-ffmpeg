-- Connect the trusted pint-proof logging path to the scoring ledger.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.
--
-- This migration depends on:
--   202609190004_create_league_score_events.sql
--
-- It awards only new scoring events:
--   PINT_LOGGED = 1 point for every accepted pint
--   NEW_PUB     = 2 points once per player and Google Places pub globally
--
-- Historical PINT_LOGGED events are backfilled by the ledger migration.
-- Historical NEW_PUB events and review bonuses are intentionally not created here.

do $$
begin
  if to_regclass('public.league_score_events') is null then
    raise exception
      'Pint logging scoring migration requires public.league_score_events; apply the scoring ledger migration first';
  end if;
end
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

  if not exists (
    select 1
    from public.league_memberships as membership
    where membership.league_id = p_league_id
      and membership.user_id = p_user_id
      and membership.status = 'active'
  ) then
    raise exception 'You are not an active member of this league';
  end if;

  if not exists (
    select 1
    from public.leagues as league
    where league.id = p_league_id
      and league.status = 'active'
      and league.starts_at <= now()
      and league.ends_at > now()
  ) then
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

  -- This insert is intentionally not conflict-tolerant. Every accepted pint
  -- must have exactly one base score event or the whole transaction rolls back.
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

  -- The partial unique index on (user_id, pub_provider, pub_place_id) for
  -- NEW_PUB events serializes concurrent first visits and makes the second
  -- attempt a no-op. The event points to the pint that discovered the pub.
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

-- Legacy client-callable overloads remain non-authoritative. New pint logs
-- must use the server-only verified path above so scoring cannot be bypassed.
revoke execute on function public.log_pint(
  uuid,
  text,
  double precision,
  double precision
) from public, anon, authenticated;

revoke execute on function public.log_pint(
  uuid,
  text,
  double precision,
  double precision,
  text,
  text,
  text,
  text,
  double precision,
  double precision
) from public, anon, authenticated;