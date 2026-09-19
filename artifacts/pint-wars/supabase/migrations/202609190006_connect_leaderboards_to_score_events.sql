-- Use the immutable scoring ledger for authoritative league totals.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.
--
-- The RPC keeps its existing name and return shape for API compatibility:
--   user_id uuid, pint_total bigint
-- The pint_total value now represents total score points, not raw pint count.

do $$
begin
  if to_regclass('public.league_score_events') is null then
    raise exception
      'Leaderboard scoring migration requires public.league_score_events; apply the scoring ledger migration first';
  end if;
end
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