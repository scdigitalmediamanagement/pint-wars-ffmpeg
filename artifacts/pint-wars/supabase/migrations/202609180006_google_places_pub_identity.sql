-- Persist an optional Google Places identity alongside the original pint-log GPS.
-- Existing logs and clients can continue using the four-argument log_pint overload.
alter table public.pint_logs
  add column pub_provider text,
  add column pub_place_id text,
  add column pub_name text,
  add column pub_address text,
  add column pub_latitude double precision,
  add column pub_longitude double precision;

alter table public.pint_logs
  add constraint pint_logs_pub_identity_check check (
    (
      pub_provider is null
      and pub_place_id is null
      and pub_name is null
      and pub_address is null
      and pub_latitude is null
      and pub_longitude is null
    )
    or
    (
      pub_provider = 'google_places'
      and char_length(pub_place_id) between 1 and 500
      and char_length(pub_name) between 1 and 500
      and char_length(pub_address) between 0 and 1000
      and pub_latitude between -90 and 90
      and pub_longitude between -180 and 180
    )
  );

create index pint_logs_user_pub_identity_idx
  on public.pint_logs(user_id, pub_provider, pub_place_id)
  where pub_provider is not null and pub_place_id is not null;

create or replace function public.log_pint(
  p_league_id uuid,
  p_photo_path text,
  p_latitude double precision,
  p_longitude double precision,
  p_pub_provider text,
  p_pub_place_id text,
  p_pub_name text,
  p_pub_address text,
  p_pub_latitude double precision,
  p_pub_longitude double precision
)
returns table (pint_id uuid, logged_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_pint_id uuid;
  new_logged_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  if not exists (
    select 1
    from public.league_memberships as membership
    where membership.league_id = p_league_id
      and membership.user_id = auth.uid()
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

  if p_photo_path not like auth.uid()::text || '/' || p_league_id::text || '/%' then
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

  insert into public.pint_logs as pint_log (
    league_id,
    user_id,
    photo_path,
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
    auth.uid(),
    p_photo_path,
    p_latitude,
    p_longitude,
    p_pub_provider,
    p_pub_place_id,
    p_pub_name,
    p_pub_address,
    p_pub_latitude,
    p_pub_longitude
  )
  returning pint_log.id, pint_log.logged_at into new_pint_id, new_logged_at;

  return query select new_pint_id, new_logged_at;
end;
$$;

create or replace function public.log_pint(
  p_league_id uuid,
  p_photo_path text,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns table (pint_id uuid, logged_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select result.pint_id, result.logged_at
  from public.log_pint(
    p_league_id,
    p_photo_path,
    p_latitude,
    p_longitude,
    null,
    null,
    null,
    null,
    null,
    null
  ) as result;
$$;

create or replace function public.get_my_pub_passport()
returns table (
  location_key text,
  pub_name text,
  address text,
  latitude double precision,
  longitude double precision,
  pint_count bigint,
  most_recent_visit timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  return query
  with passport_logs as (
    select
      case
        when pint_log.pub_provider is not null and pint_log.pub_place_id is not null
          then 'place:' || pint_log.pub_provider || ':' || pint_log.pub_place_id
        else format(
          'location:%s,%s',
          round(pint_log.latitude::numeric, 4),
          round(pint_log.longitude::numeric, 4)
        )
      end as location_key,
      pint_log.pub_name,
      pint_log.pub_address as address,
      coalesce(pint_log.pub_latitude, pint_log.latitude) as latitude,
      coalesce(pint_log.pub_longitude, pint_log.longitude) as longitude,
      pint_log.logged_at
    from public.pint_logs as pint_log
    where pint_log.user_id = auth.uid()
      and (
        (
          pint_log.pub_provider is not null
          and pint_log.pub_place_id is not null
        )
        or
        (
          pint_log.latitude is not null
          and pint_log.longitude is not null
        )
      )
  )
  select
    passport_log.location_key,
    (array_agg(passport_log.pub_name order by passport_log.logged_at desc))[1] as pub_name,
    (array_agg(passport_log.address order by passport_log.logged_at desc))[1] as address,
    avg(passport_log.latitude)::double precision as latitude,
    avg(passport_log.longitude)::double precision as longitude,
    count(*)::bigint as pint_count,
    max(passport_log.logged_at) as most_recent_visit
  from passport_logs as passport_log
  group by passport_log.location_key
  order by max(passport_log.logged_at) desc;
end;
$$;

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
) from public, anon;
revoke execute on function public.log_pint(
  uuid,
  text,
  double precision,
  double precision
) from public, anon;
revoke execute on function public.get_my_pub_passport() from public, anon;

grant execute on function public.log_pint(
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
) to authenticated;
grant execute on function public.log_pint(
  uuid,
  text,
  double precision,
  double precision
) to authenticated;
grant execute on function public.get_my_pub_passport() to authenticated;