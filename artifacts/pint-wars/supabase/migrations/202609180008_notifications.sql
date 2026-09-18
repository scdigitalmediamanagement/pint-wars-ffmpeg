-- Stage 3: secure in-app notifications.
-- This migration is intentionally not applied automatically.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (
    notification_type in (
      'player_joined',
      'pint_logged',
      'war_ending_soon',
      'war_finished',
      'winner'
    )
  ),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 500),
  league_id uuid references public.leagues(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  event_key text not null check (char_length(event_key) between 1 and 300),
  unique (user_id, event_key)
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
grant select, update on public.notifications to authenticated;

drop policy if exists "users can read their own notifications" on public.notifications;
create policy "users can read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users can update their own notifications" on public.notifications;
create policy "users can update their own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke insert, delete on public.notifications from authenticated;

create or replace function public.notify_player_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  league_name text;
  player_name text;
  host_user_id uuid;
begin
  if new.role <> 'player' then
    return new;
  end if;

  select league.name, league.host_id
  into league_name, host_user_id
  from public.leagues as league
  where league.id = new.league_id;

  select coalesce(profile.display_name, 'Player')
  into player_name
  from public.profiles as profile
  where profile.id = new.user_id;

  if host_user_id is null or host_user_id = new.user_id then
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
  values (
    host_user_id,
    'player_joined',
    'New player joined',
    player_name || ' joined ' || league_name || '.',
    new.league_id,
    'player_joined:' || new.id::text
  )
  on conflict (user_id, event_key) do nothing;

  return new;
end;
$$;

drop trigger if exists league_membership_joined_notification on public.league_memberships;
create trigger league_membership_joined_notification
  after insert on public.league_memberships
  for each row
  execute function public.notify_player_joined();

create or replace function public.notify_pint_logged()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  league_name text;
  player_name text;
begin
  select league.name
  into league_name
  from public.leagues as league
  where league.id = new.league_id;

  select coalesce(profile.display_name, 'Player')
  into player_name
  from public.profiles as profile
  where profile.id = new.user_id;

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
    'pint_logged',
    'Pint logged',
    player_name || ' logged a pint in ' || league_name || '.',
    new.league_id,
    'pint_logged:' || new.id::text || ':' || membership.user_id::text
  from public.league_memberships as membership
  where membership.league_id = new.league_id
    and membership.status <> 'removed'
    and membership.user_id <> new.user_id
  on conflict (user_id, event_key) do nothing;

  return new;
end;
$$;

drop trigger if exists pint_logged_notification on public.pint_logs;
create trigger pint_logged_notification
  after insert on public.pint_logs
  for each row
  execute function public.notify_pint_logged();

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
      count(pint_log.id)::bigint as pint_total
    from public.league_memberships as membership
    left join public.pint_logs as pint_log
      on pint_log.league_id = membership.league_id
     and pint_log.user_id = membership.user_id
    where membership.league_id = new.id
      and membership.status <> 'removed'
    group by membership.user_id
  ),
  winners as (
    select score.user_id, score.pint_total
    from scores as score
    where score.pint_total = (select max(scores.pint_total) from scores)
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
        then 'You won ' || new.name || ' with ' || winner.pint_total::text ||
          case when winner.pint_total = 1 then ' pint.' else ' pints.' end
      else 'You tied for the win in ' || new.name || ' with ' || winner.pint_total::text ||
        case when winner.pint_total = 1 then ' pint.' else ' pints.' end
    end,
    new.id,
    'winner:' || new.id::text || ':' || winner.user_id::text
  from winners as winner
  on conflict (user_id, event_key) do nothing;

  return new;
end;
$$;

drop trigger if exists league_completed_notification on public.leagues;
create trigger league_completed_notification
  after update of status on public.leagues
  for each row
  execute function public.notify_league_completed();

create or replace function public.ensure_my_league_ending_soon_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
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
    'war_ending_soon',
    'Pint War ending soon',
    league.name || ' finishes soon.',
    league.id,
    'war_ending_soon:' || league.id::text
  from public.league_memberships as membership
  join public.leagues as league on league.id = membership.league_id
  where membership.user_id = auth.uid()
    and membership.status <> 'removed'
    and league.status = 'active'
    and league.ends_at > now()
    and league.ends_at <= now() + interval '24 hours'
  on conflict (user_id, event_key) do nothing;
end;
$$;

create or replace function public.get_my_notifications(p_limit integer default 50)
returns table (
  id uuid,
  notification_type text,
  title text,
  body text,
  league_id uuid,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Notification limit must be between 1 and 100';
  end if;

  perform public.refresh_my_league_statuses();
  perform public.ensure_my_league_ending_soon_notifications();

  return query
  select
    notification.id,
    notification.notification_type,
    notification.title,
    notification.body,
    notification.league_id,
    notification.read_at,
    notification.created_at
  from public.notifications as notification
  where notification.user_id = auth.uid()
  order by notification.created_at desc
  limit p_limit;
end;
$$;

create or replace function public.get_my_unread_notification_count()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  unread_count integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  perform public.refresh_my_league_statuses();
  perform public.ensure_my_league_ending_soon_notifications();

  select count(*)::integer
  into unread_count
  from public.notifications as notification
  where notification.user_id = auth.uid()
    and notification.read_at is null;

  return unread_count;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid();
end;
$$;

revoke execute on function public.notify_player_joined() from public, anon, authenticated;
revoke execute on function public.notify_pint_logged() from public, anon, authenticated;
revoke execute on function public.notify_league_completed() from public, anon, authenticated;
revoke execute on function public.ensure_my_league_ending_soon_notifications() from public, anon;
revoke execute on function public.get_my_notifications(integer) from public, anon;
revoke execute on function public.get_my_unread_notification_count() from public, anon;
revoke execute on function public.mark_notification_read(uuid) from public, anon;

grant execute on function public.ensure_my_league_ending_soon_notifications() to authenticated;
grant execute on function public.get_my_notifications(integer) to authenticated;
grant execute on function public.get_my_unread_notification_count() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;