-- Add league-only player retirement without changing historical logs or scores.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.

create or replace function public.is_league_viewer(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_memberships as membership
    where membership.league_id = p_league_id
      and membership.user_id = auth.uid()
      and membership.status in ('active', 'retired')
  );
$$;

create or replace function public.retire_from_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_league_status public.league_status;
  locked_league_host_id uuid;
  locked_league_starts_at timestamptz;
  locked_league_ends_at timestamptz;
  locked_membership_id uuid;
  locked_membership_role public.membership_role;
  locked_membership_status public.membership_status;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  -- Keep the lock order aligned with the scoring paths that serialize on the
  -- league row before checking membership status.
  select
    league.status,
    league.host_id,
    league.starts_at,
    league.ends_at
  into
    locked_league_status,
    locked_league_host_id,
    locked_league_starts_at,
    locked_league_ends_at
  from public.leagues as league
  where league.id = p_league_id
  for update;

  if not found then
    raise exception 'This Pint War was not found';
  end if;

  if locked_league_host_id = auth.uid() then
    raise exception 'The league host cannot retire from this Pint War';
  end if;

  if locked_league_status <> 'active'
     or locked_league_starts_at > now()
     or locked_league_ends_at <= now() then
    raise exception 'This Pint War is not active';
  end if;

  select
    membership.id,
    membership.role,
    membership.status
  into
    locked_membership_id,
    locked_membership_role,
    locked_membership_status
  from public.league_memberships as membership
  where membership.league_id = p_league_id
    and membership.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'You are not a member of this Pint War';
  end if;

  if locked_membership_role = 'host' then
    raise exception 'The league host cannot retire from this Pint War';
  end if;

  if locked_membership_status <> 'active' then
    raise exception 'You are not an active member of this Pint War';
  end if;

  update public.league_memberships
  set status = 'retired',
      retired_at = now()
  where id = locked_membership_id;
end;
$$;

-- Retired members can read their league and historical totals, but the
-- existing active-only predicate remains the authorization boundary for
-- actions that can create new score events.
drop policy if exists "members can read their leagues" on public.leagues;
create policy "members can read their leagues"
  on public.leagues for select to authenticated
  using (public.is_league_viewer(id) or host_id = auth.uid());

drop policy if exists "members can read league memberships" on public.league_memberships;
create policy "members can read league memberships"
  on public.league_memberships for select to authenticated
  using (public.is_league_viewer(league_id) or user_id = auth.uid());

create or replace function public.get_league_pint_totals(p_league_id uuid)
returns table (user_id uuid, pint_total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_league_viewer(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  return query
  select
    membership.user_id,
    coalesce(sum(score_event.points), 0)::bigint
  from public.league_memberships as membership
  left join public.league_score_events as score_event
    on score_event.league_id = membership.league_id
   and score_event.user_id = membership.user_id
  where membership.league_id = p_league_id
    and membership.status <> 'removed'
  group by membership.user_id;
end;
$$;

-- The dashboard refreshes expired leagues before reading them. Allowing a
-- retired member to perform that existing completion transition preserves
-- historical access without granting any scoring capability.
create or replace function public.complete_expired_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_viewer(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  update public.leagues
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where id = p_league_id
    and status = 'active'
    and ends_at <= now();
end;
$$;

-- The final pint logging RPC already requires an active membership and is
-- intentionally not redefined here.
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

  -- Locking the league keeps this check serialized with completion and pint
  -- logging, which use the same league-row lock.
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

revoke execute on function public.is_league_viewer(uuid) from public, anon;
grant execute on function public.is_league_viewer(uuid) to authenticated;

revoke execute on function public.retire_from_league(uuid) from public, anon;
grant execute on function public.retire_from_league(uuid) to authenticated;

revoke execute on function public.create_pub_review(
  text,
  text,
  uuid,
  smallint,
  smallint,
  smallint,
  smallint,
  boolean,
  smallint,
  smallint,
  text
) from public, anon;

grant execute on function public.create_pub_review(
  text,
  text,
  uuid,
  smallint,
  smallint,
  smallint,
  smallint,
  boolean,
  smallint,
  smallint,
  text
) to authenticated;
-- Add league-only player retirement without changing historical logs or scores.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.

create or replace function public.is_league_viewer(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_memberships as membership
    where membership.league_id = p_league_id
      and membership.user_id = auth.uid()
      and membership.status in ('active', 'retired')
  );
$$;

create or replace function public.retire_from_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_league_status public.league_status;
  locked_league_host_id uuid;
  locked_league_starts_at timestamptz;
  locked_league_ends_at timestamptz;
  locked_membership_id uuid;
  locked_membership_role public.membership_role;
  locked_membership_status public.membership_status;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  -- Keep the lock order aligned with the scoring paths that serialize on the
  -- league row before checking membership status.
  select
    league.status,
    league.host_id,
    league.starts_at,
    league.ends_at
  into
    locked_league_status,
    locked_league_host_id,
    locked_league_starts_at,
    locked_league_ends_at
  from public.leagues as league
  where league.id = p_league_id
  for update;

  if not found then
    raise exception 'This Pint War was not found';
  end if;

  if locked_league_host_id = auth.uid() then
    raise exception 'The league host cannot retire from this Pint War';
  end if;

  if locked_league_status <> 'active'
     or locked_league_starts_at > now()
     or locked_league_ends_at <= now() then
    raise exception 'This Pint War is not active';
  end if;

  select
    membership.id,
    membership.role,
    membership.status
  into
    locked_membership_id,
    locked_membership_role,
    locked_membership_status
  from public.league_memberships as membership
  where membership.league_id = p_league_id
    and membership.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'You are not a member of this Pint War';
  end if;

  if locked_membership_role = 'host' then
    raise exception 'The league host cannot retire from this Pint War';
  end if;

  if locked_membership_status <> 'active' then
    raise exception 'You are not an active member of this Pint War';
  end if;

  update public.league_memberships
  set status = 'retired',
      retired_at = now()
  where id = locked_membership_id;
end;
$$;

-- Retired members can read their league and historical totals, but the
-- existing active-only predicate remains the authorization boundary for
-- actions that can create new score events.
drop policy if exists "members can read their leagues" on public.leagues;
create policy "members can read their leagues"
  on public.leagues for select to authenticated
  using (public.is_league_viewer(id) or host_id = auth.uid());

drop policy if exists "members can read league memberships" on public.league_memberships;
create policy "members can read league memberships"
  on public.league_memberships for select to authenticated
  using (public.is_league_viewer(league_id) or user_id = auth.uid());

create or replace function public.get_league_pint_totals(p_league_id uuid)
returns table (user_id uuid, pint_total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_league_viewer(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  return query
  select
    membership.user_id,
    coalesce(sum(score_event.points), 0)::bigint
  from public.league_memberships as membership
  left join public.league_score_events as score_event
    on score_event.league_id = membership.league_id
   and score_event.user_id = membership.user_id
  where membership.league_id = p_league_id
    and membership.status <> 'removed'
  group by membership.user_id;
end;
$$;

-- The dashboard refreshes expired leagues before reading them. Allowing a
-- retired member to perform that existing completion transition preserves
-- historical access without granting any scoring capability.
create or replace function public.complete_expired_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_viewer(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  update public.leagues
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where id = p_league_id
    and status = 'active'
    and ends_at <= now();
end;
$$;

-- The final pint logging RPC already requires an active membership and is
-- intentionally not redefined here.
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

  -- Locking the league keeps this check serialized with completion and pint
  -- logging, which use the same league-row lock.
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

revoke execute on function public.is_league_viewer(uuid) from public, anon;
grant execute on function public.is_league_viewer(uuid) to authenticated;

revoke execute on function public.retire_from_league(uuid) from public, anon;
grant execute on function public.retire_from_league(uuid) to authenticated;

revoke execute on function public.create_pub_review(
  text,
  text,
  uuid,
  smallint,
  smallint,
  smallint,
  smallint,
  boolean,
  smallint,
  smallint,
  text
) from public, anon;

grant execute on function public.create_pub_review(
  text,
  text,
  uuid,
  smallint,
  smallint,
  smallint,
  smallint,
  boolean,
  smallint,
  smallint,
  text
) to authenticated;
