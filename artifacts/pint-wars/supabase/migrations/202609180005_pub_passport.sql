-- First version of the Pub Passport uses existing pint-log coordinates.
-- Pub names and addresses remain nullable until a places provider is added.
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
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  return query
  select
    format(
      '%s,%s',
      round(pint_log.latitude::numeric, 4),
      round(pint_log.longitude::numeric, 4)
    ) as location_key,
    null::text as pub_name,
    null::text as address,
    avg(pint_log.latitude)::double precision as latitude,
    avg(pint_log.longitude)::double precision as longitude,
    count(*)::bigint as pint_count,
    max(pint_log.logged_at) as most_recent_visit
  from public.pint_logs as pint_log
  where pint_log.user_id = auth.uid()
    and pint_log.latitude is not null
    and pint_log.longitude is not null
  group by
    round(pint_log.latitude::numeric, 4),
    round(pint_log.longitude::numeric, 4)
  order by max(pint_log.logged_at) desc;
end;
$$;

revoke execute on function public.get_my_pub_passport() from public;
grant execute on function public.get_my_pub_passport() to authenticated;