-- Stage 2: private pint-proof photos and one point per authenticated pint log.
create table if not exists public.pint_logs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  photo_path text not null unique check (char_length(photo_path) between 1 and 500),
  logged_at timestamptz not null default now(),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180)
);

create index if not exists pint_logs_league_id_idx on public.pint_logs(league_id);
create index if not exists pint_logs_league_user_idx on public.pint_logs(league_id, user_id);

alter table public.pint_logs enable row level security;
revoke insert, update, delete on public.pint_logs from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pint-proofs',
  'pint-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "players can upload their own pint proofs" on storage.objects;
create policy "players can upload their own pint proofs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pint-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.league_memberships as membership
      where membership.user_id = auth.uid()
        and membership.league_id::text = (storage.foldername(name))[2]
        and membership.status = 'active'
    )
  );

drop policy if exists "players can read their own pint proofs" on storage.objects;
create policy "players can read their own pint proofs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pint-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "players can delete their own pint proofs" on storage.objects;
create policy "players can delete their own pint proofs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pint-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.log_pint(
  p_league_id uuid,
  p_photo_path text,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns table (pint_id uuid, logged_at timestamptz)
language plpgsql
security definer
set search_path = public
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

  insert into public.pint_logs as pint_log (
    league_id,
    user_id,
    photo_path,
    latitude,
    longitude
  )
  values (
    p_league_id,
    auth.uid(),
    p_photo_path,
    p_latitude,
    p_longitude
  )
  returning pint_log.id, pint_log.logged_at into new_pint_id, new_logged_at;

  return query select new_pint_id, new_logged_at;
end;
$$;

create or replace function public.get_league_pint_totals(p_league_id uuid)
returns table (user_id uuid, pint_total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  return query
  select
    membership.user_id,
    count(pint_log.id)::bigint
  from public.league_memberships as membership
  left join public.pint_logs as pint_log
    on pint_log.league_id = membership.league_id
   and pint_log.user_id = membership.user_id
  where membership.league_id = p_league_id
  group by membership.user_id;
end;
$$;

revoke execute on function public.log_pint(uuid, text, double precision, double precision) from public;
revoke execute on function public.get_league_pint_totals(uuid) from public;
grant execute on function public.log_pint(uuid, text, double precision, double precision) to authenticated;
grant execute on function public.get_league_pint_totals(uuid) to authenticated;