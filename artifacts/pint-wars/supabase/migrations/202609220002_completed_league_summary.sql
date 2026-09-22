-- Add a read-only completed Pint War summary without creating a snapshot table.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.

create or replace function public.get_league_summary(p_league_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  summary jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  if not public.is_league_viewer(p_league_id) then
    raise exception 'You are not allowed to view this Pint War';
  end if;

  if not exists (
    select 1
    from public.leagues as league
    where league.id = p_league_id
      and league.status = 'completed'
  ) then
    raise exception 'This Pint War is not completed';
  end if;

  with eligible_members as (
    select
      membership.id,
      membership.user_id,
      membership.role,
      membership.status,
      membership.joined_at,
      profile.display_name
    from public.league_memberships as membership
    join public.profiles as profile
      on profile.id = membership.user_id
    where membership.league_id = p_league_id
      and membership.status <> 'removed'
  ),
  score_totals as (
    select totals.user_id, totals.pint_total
    from public.get_league_pint_totals(p_league_id) as totals
  ),
  member_scores as (
    select
      member.id,
      member.user_id,
      member.role,
      member.status,
      member.joined_at,
      member.display_name,
      coalesce(score.pint_total, 0)::bigint as points
    from eligible_members as member
    left join score_totals as score
      on score.user_id = member.user_id
  ),
  league_events as (
    select score_event.event_type, score_event.points
    from public.league_score_events as score_event
    join eligible_members as member
      on member.user_id = score_event.user_id
    where score_event.league_id = p_league_id
  ),
  visited_pubs as (
    select distinct
      pint_log.pub_provider,
      pint_log.pub_place_id
    from public.pint_logs as pint_log
    join eligible_members as member
      on member.user_id = pint_log.user_id
    where pint_log.league_id = p_league_id
      and pint_log.pub_provider is not null
      and pint_log.pub_place_id is not null
  )
  select jsonb_build_object(
    'league',
    jsonb_build_object(
      'id', league.id,
      'name', league.name,
      'host_id', league.host_id,
      'capacity', league.capacity,
      'is_free', league.is_free,
      'status', league.status,
      'starts_at', league.starts_at,
      'ends_at', league.ends_at,
      'created_at', league.created_at,
      'completed_at', league.completed_at
    ),
    'stats',
    jsonb_build_object(
      'player_count', (select count(*) from eligible_members),
      'total_pints', (select count(*) from league_events where event_type = 'PINT_LOGGED'),
      'pubs_visited', (select count(*) from visited_pubs),
      'new_pub_bonuses', (select count(*) from league_events where event_type = 'NEW_PUB'),
      'reviews', (select count(*) from league_events where event_type = 'PUB_REVIEW'),
      'total_points', coalesce((select sum(points) from league_events), 0)
    ),
    'leaderboard',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', member.id,
            'user_id', member.user_id,
            'role', member.role,
            'status', member.status,
            'joined_at', member.joined_at,
            'display_name', member.display_name,
            'points', member.points
          )
          order by member.points desc, member.joined_at asc, member.user_id asc
        )
        from member_scores as member
      ),
      '[]'::jsonb
    )
  )
  into summary
  from public.leagues as league
  where league.id = p_league_id;

  return summary;
end;
$$;

revoke execute on function public.get_league_summary(uuid) from public, anon;
grant execute on function public.get_league_summary(uuid) to authenticated;