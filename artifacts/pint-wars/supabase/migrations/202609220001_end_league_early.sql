-- Allow the host to complete one active Pint War before its scheduled end.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.

create or replace function public.end_league_early(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_league_status public.league_status;
  locked_league_host_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  select league.status, league.host_id
    into locked_league_status, locked_league_host_id
  from public.leagues as league
  where league.id = p_league_id
  for update;

  if not found then
    raise exception 'This Pint War was not found';
  end if;

  if locked_league_host_id <> auth.uid() then
    raise exception 'Only the league host can end this Pint War';
  end if;

  if locked_league_status <> 'active' then
    raise exception 'This Pint War is already completed';
  end if;

  -- The existing completion trigger performs the unchanged notification and
  -- winner/tie calculation from the historical score events.
  update public.leagues
  set status = 'completed',
      completed_at = coalesce(completed_at, now())
  where id = p_league_id
    and status = 'active';
end;
$$;

revoke execute on function public.end_league_early(uuid) from public, anon;
grant execute on function public.end_league_early(uuid) to authenticated;