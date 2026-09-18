-- Lock new leagues to the 10-day pricing model while allowing historical
-- 8-player leagues to remain readable until they complete.
alter table public.leagues
  alter column capacity set default 4,
  alter column ends_at set default (now() + interval '10 days');

alter table public.leagues
  drop constraint if exists leagues_capacity_check,
  drop constraint if exists leagues_is_free_check,
  drop constraint if exists leagues_locked_plan_check;

alter table public.leagues
  add constraint leagues_locked_plan_check
  check (
    (is_free = true and capacity = 4)
    or
    (is_free = false and capacity in (6, 10, 14, 16))
  ) not valid;

create or replace function public.create_free_league(p_name text)
returns table (league_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_league_id uuid;
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  if char_length(trim(p_name)) not between 1 and 80 then
    raise exception 'League name must be between 1 and 80 characters';
  end if;

  if exists (
    select 1
    from public.leagues as league
    where league.host_id = auth.uid()
      and league.is_free = true
  ) then
    raise exception 'You have already used your free trial';
  end if;

  insert into public.leagues (name, host_id, capacity, is_free, status, starts_at, ends_at)
  values (trim(p_name), auth.uid(), 4, true, 'active', now(), now() + interval '10 days')
  returning id into new_league_id;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (new_league_id, auth.uid(), 'host', 'active');

  new_code := public.make_invite_code();
  insert into public.league_invites (league_id, created_by, code, expires_at)
  values (new_league_id, auth.uid(), new_code, now() + interval '10 days');

  return query select new_league_id, new_code;
end;
$$;

create or replace function public.create_league_invite(p_league_id uuid)
returns table (invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  league_end timestamptz;
begin
  if not public.is_league_host(p_league_id) then
    raise exception 'Only the host can create invites';
  end if;

  select league.ends_at into league_end
  from public.leagues as league
  where league.id = p_league_id;

  new_code := public.make_invite_code();
  insert into public.league_invites (league_id, created_by, code, expires_at)
  values (p_league_id, auth.uid(), new_code, least(league_end, now() + interval '10 days'));

  return query select new_code;
end;
$$;

create or replace function public.join_league_by_code(p_code text)
returns table (league_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.league_invites%rowtype;
  active_count integer;
  existing_status public.membership_status;
  league_capacity integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  select * into invite_row
  from public.league_invites
  where code = upper(trim(p_code))
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'Invite code is invalid or expired';
  end if;

  if exists (
    select 1
    from public.league_memberships as membership
    where membership.league_id = invite_row.league_id
      and membership.user_id = auth.uid()
  ) then
    select membership.status into existing_status
    from public.league_memberships as membership
    where membership.league_id = invite_row.league_id
      and membership.user_id = auth.uid();

    if existing_status = 'active' then
      return query select invite_row.league_id;
      return;
    end if;

    raise exception 'You are no longer an active member of this league';
  end if;

  select league.capacity into league_capacity
  from public.leagues as league
  where league.id = invite_row.league_id;

  select count(*) into active_count
  from public.league_memberships as membership
  where membership.league_id = invite_row.league_id
    and membership.status = 'active';

  if active_count >= league_capacity then
    raise exception 'This league is full';
  end if;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (invite_row.league_id, auth.uid(), 'player', 'active');

  return query select invite_row.league_id;
end;
$$;