-- Harden league joins against concurrent capacity races and stale invite state.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.

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
  league_is_free boolean;
  league_status public.league_status;
  league_starts_at timestamptz;
  league_ends_at timestamptz;
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

  -- Serialize joins for this league before checking its lifecycle or capacity.
  select
    league.capacity,
    league.is_free,
    league.status,
    league.starts_at,
    league.ends_at
  into
    league_capacity,
    league_is_free,
    league_status,
    league_starts_at,
    league_ends_at
  from public.leagues as league
  where league.id = invite_row.league_id
  for update;

  if not found then
    raise exception 'Invite code is invalid or expired';
  end if;

  if league_status <> 'active'
    or league_starts_at > now()
    or league_ends_at <= now()
  then
    raise exception 'This Pint War is not active';
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

  if league_is_free then
    perform public.consume_free_trial(auth.uid());
  end if;

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
