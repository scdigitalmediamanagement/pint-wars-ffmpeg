-- Exclude removed memberships from league pint totals while preserving retired history.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.

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
    and membership.status <> 'removed'
  group by membership.user_id;
end;
$$;
