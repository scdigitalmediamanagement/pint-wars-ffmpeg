-- Stage 1 safety fixes: persistent de-identification state and retryable
-- server-side cleanup state.
-- Apply this migration manually in Supabase. It is intentionally not applied
-- by the app.

alter table public.profiles
  add column if not exists deidentified_at timestamptz;

create table if not exists public.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete restrict,
  storage_prefix text not null,
  deidentified_at timestamptz not null,
  storage_cleaned_at timestamptz,
  auth_neutralized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_jobs_storage_prefix_check
    check (storage_prefix = user_id::text || '/')
);

create index if not exists account_deletion_jobs_pending_idx
  on public.account_deletion_jobs(updated_at)
  where storage_cleaned_at is null or auth_neutralized_at is null;

alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_jobs from public, anon, authenticated;
grant select, update on public.account_deletion_jobs to service_role;

-- All newly created user-owned rows pass through this trigger. This protects
-- both authenticated RPCs and trusted service-role functions without changing
-- existing scoring rules or historical rows.
create or replace function public.reject_deidentified_user_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_user_id uuid;
  profile_deidentified_at timestamptz;
begin
  subject_user_id := case tg_table_name
    when 'leagues' then (to_jsonb(new) ->> 'host_id')::uuid
    when 'league_memberships' then (to_jsonb(new) ->> 'user_id')::uuid
    when 'league_invites' then (to_jsonb(new) ->> 'created_by')::uuid
    when 'pint_logs' then (to_jsonb(new) ->> 'user_id')::uuid
    when 'league_score_events' then (to_jsonb(new) ->> 'user_id')::uuid
    when 'pub_reviews' then (to_jsonb(new) ->> 'user_id')::uuid
    when 'pub_review_bonus_guards' then (to_jsonb(new) ->> 'user_id')::uuid
    when 'pub_review_reports' then (to_jsonb(new) ->> 'reporter_id')::uuid
    when 'paid_league_purchases' then (to_jsonb(new) ->> 'user_id')::uuid
    else null
  end;

  if subject_user_id is not null then
    -- Locking the profile serializes this write with account deletion. The
    -- deletion RPC takes league/membership locks before this profile lock so
    -- it cannot deadlock with the existing league-row write paths.
    select profile.deidentified_at
      into profile_deidentified_at
    from public.profiles as profile
    where profile.id = subject_user_id
    for update;
  end if;

  if profile_deidentified_at is not null
  then
    raise exception 'This account has been de-identified and cannot create new activity';
  end if;

  return new;
end;
$$;

revoke execute on function public.reject_deidentified_user_activity() from public, anon, authenticated;

drop trigger if exists reject_deidentified_league_host on public.leagues;
create trigger reject_deidentified_league_host
before insert on public.leagues
for each row execute function public.reject_deidentified_user_activity();

drop trigger if exists reject_deidentified_membership on public.league_memberships;
create trigger reject_deidentified_membership
before insert on public.league_memberships
for each row execute function public.reject_deidentified_user_activity();

drop trigger if exists reject_deidentified_membership_update on public.league_memberships;
create trigger reject_deidentified_membership_update
before update on public.league_memberships
for each row execute function public.reject_deidentified_user_activity();

drop trigger if exists reject_deidentified_invite on public.league_invites;
create trigger reject_deidentified_invite
before insert on public.league_invites
for each row execute function public.reject_deidentified_user_activity();

drop trigger if exists reject_deidentified_pint_log on public.pint_logs;
create trigger reject_deidentified_pint_log
before insert on public.pint_logs
for each row execute function public.reject_deidentified_user_activity();

drop trigger if exists reject_deidentified_score_event on public.league_score_events;
create trigger reject_deidentified_score_event
before insert on public.league_score_events
for each row execute function public.reject_deidentified_user_activity();

drop trigger if exists reject_deidentified_review on public.pub_reviews;
create trigger reject_deidentified_review
before insert on public.pub_reviews
for each row execute function public.reject_deidentified_user_activity();

drop trigger if exists reject_deidentified_review_bonus_guard on public.pub_review_bonus_guards;
create trigger reject_deidentified_review_bonus_guard
before insert on public.pub_review_bonus_guards
for each row execute function public.reject_deidentified_user_activity();

drop trigger if exists reject_deidentified_review_report on public.pub_review_reports;
create trigger reject_deidentified_review_report
before insert on public.pub_review_reports
for each row execute function public.reject_deidentified_user_activity();

drop trigger if exists reject_deidentified_paid_purchase on public.paid_league_purchases;
create trigger reject_deidentified_paid_purchase
before insert on public.paid_league_purchases
for each row execute function public.reject_deidentified_user_activity();

-- Completion and join notifications can be generated for all members. Skip
-- only the de-identified recipient rather than failing the league transaction.
create or replace function public.suppress_deidentified_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.profiles as profile
  where profile.id = new.user_id
  for update;

  if exists (
    select 1
    from public.profiles as profile
    where profile.id = new.user_id
      and profile.deidentified_at is not null
  )
  then
    return null;
  end if;

  return new;
end;
$$;

revoke execute on function public.suppress_deidentified_notification() from public, anon, authenticated;

drop trigger if exists suppress_deidentified_notification on public.notifications;
create trigger suppress_deidentified_notification
before insert on public.notifications
for each row execute function public.suppress_deidentified_notification();

-- A de-identified user cannot edit the profile after the deletion transaction.
drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() and deidentified_at is null)
  with check (id = auth.uid() and deidentified_at is null);

-- Storage upload authorization also checks the persistent database guard.
drop policy if exists "players can upload their own pint proofs" on storage.objects;
create policy "players can upload their own pint proofs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'pint-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.deidentified_at is null
    )
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
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.deidentified_at is null
    )
  );

drop policy if exists "players can delete their own pint proofs" on storage.objects;
create policy "players can delete their own pint proofs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pint-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.deidentified_at is null
    )
  );

-- Replace the original RPC so the de-identification marker and trusted repair
-- job are written in the same transaction as the historical-data scrubbing.
drop function if exists public.delete_my_account();

create function public.delete_my_account()
returns table (job_id uuid, storage_prefix text, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  deleting_user_id uuid := auth.uid();
  active_host_league_id uuid;
  account_deidentified_at timestamptz;
  new_job_id uuid;
begin
  if deleting_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = deleting_user_id
  ) then
    raise exception 'Your profile could not be found';
  end if;

  -- Existing league-row write paths lock their league before the profile
  -- trigger lock. Keep the same order here to avoid a deletion/write deadlock.
  perform 1
  from public.leagues as league
  where league.host_id = deleting_user_id
     or exists (
       select 1
       from public.league_memberships as membership
       where membership.league_id = league.id
         and membership.user_id = deleting_user_id
     )
  order by league.id
  for update;

  perform 1
  from public.league_memberships as membership
  where membership.user_id = deleting_user_id
  order by membership.league_id, membership.id
  for update;

  perform 1
  from public.league_invites as invite
  where invite.created_by = deleting_user_id
  order by invite.id
  for update;

  perform 1
  from public.profiles
  where id = deleting_user_id
  for update;

  select league.id
    into active_host_league_id
  from public.leagues as league
  where league.host_id = deleting_user_id
    and league.status = 'active'
  order by league.id
  limit 1;

  if active_host_league_id is not null then
    raise exception
      'Account deletion is blocked while you host an active Pint War. Finish or end that Pint War first.';
  end if;

  update public.pint_logs as pint_log
  set photo_path = 'deleted/' || id::text,
      content_sha256 = null,
      latitude = null,
      longitude = null,
      pub_latitude = null,
      pub_longitude = null
  where pint_log.user_id = deleting_user_id;

  delete from public.pub_reviews as review
  where review.user_id = deleting_user_id;

  delete from public.notifications as notification
  where notification.user_id = deleting_user_id;

  update public.league_invites as invite
  set revoked_at = now()
  where invite.created_by = deleting_user_id
    and invite.revoked_at is null
    and invite.expires_at > now();

  update public.profiles as profile
  set display_name = 'Deleted player',
      avatar_url = null,
      free_trial_used_at = null,
      deidentified_at = coalesce(deidentified_at, now()),
      updated_at = now()
  where profile.id = deleting_user_id
  returning profile.deidentified_at into account_deidentified_at;

  insert into public.account_deletion_jobs (
    user_id,
    storage_prefix,
    deidentified_at
  )
  values (
    deleting_user_id,
    deleting_user_id::text || '/',
    account_deidentified_at
  )
  on conflict (user_id) do update
    set storage_prefix = excluded.storage_prefix,
        deidentified_at = excluded.deidentified_at,
        updated_at = now()
  returning id into new_job_id;

  return query
  select new_job_id, deleting_user_id::text || '/', deleting_user_id;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;