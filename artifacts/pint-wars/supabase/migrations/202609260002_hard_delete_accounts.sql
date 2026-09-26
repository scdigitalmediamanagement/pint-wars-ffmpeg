-- Account deletion: remove the Auth identity and re-key retained history to a
-- fresh, unlinked "Deleted player" profile. Score values and purchase records
-- are preserved; no league is ended by this function.
-- Apply this migration manually in Supabase. It is intentionally not applied
-- by the app.

-- Keep the Auth-to-profile mapping private. Active accounts continue to use
-- matching UUIDs in the existing app schema, while deleted history receives a
-- new profile UUID with no Auth mapping.
create table if not exists public.profile_auth_links (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profile_auth_links enable row level security;
revoke all on public.profile_auth_links from public, anon, authenticated;
grant all on public.profile_auth_links to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Player')
  );

  insert into public.profile_auth_links (auth_user_id, profile_id)
  values (new.id, new.id);

  return new;
end;
$$;

insert into public.profile_auth_links (auth_user_id, profile_id)
select auth_user.id, profile.id
from auth.users as auth_user
join public.profiles as profile on profile.id = auth_user.id
on conflict (auth_user_id) do nothing;

-- The profile UUID is no longer itself an Auth foreign key: deleted-player
-- tombstones have no corresponding Auth user.
do $$
declare
  auth_profile_constraint record;
begin
  for auth_profile_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::regclass
  loop
    execute pg_catalog.format(
      'alter table public.profiles drop constraint %I',
      auth_profile_constraint.conname
    );
  end loop;
end;
$$;

-- The ledger remains immutable except for a transaction-local, user-scoped
-- change to user_id during account deletion. All score facts must be identical.
create or replace function public.reject_league_score_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and pg_catalog.current_setting('pint_wars.account_deletion_rekey', true) = 'on'
    and old.user_id = auth.uid()
    and new.user_id <> old.user_id
    and (pg_catalog.to_jsonb(new) - 'user_id')
      = (pg_catalog.to_jsonb(old) - 'user_id')
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = new.user_id
        and profile.deidentified_at is null
        and not exists (
          select 1
          from public.profile_auth_links as auth_link
          where auth_link.profile_id = profile.id
        )
    )
  then
    return new;
  end if;

  raise exception 'League score events are immutable';
end;
$$;

revoke execute on function public.reject_league_score_event_mutation()
  from public, anon, authenticated;

-- Completed jobs retain no old Auth UUID or storage prefix. While a job is
-- pending, these are needed only to finish Storage cleanup and Auth deletion.
alter table public.account_deletion_jobs
  add column if not exists auth_deleted_at timestamptz;

alter table public.account_deletion_jobs
  drop constraint if exists account_deletion_jobs_user_id_fkey;

alter table public.account_deletion_jobs
  alter column user_id drop not null,
  alter column storage_prefix drop not null;

alter table public.account_deletion_jobs
  drop constraint if exists account_deletion_jobs_storage_prefix_check;

alter table public.account_deletion_jobs
  add constraint account_deletion_jobs_identity_check
  check (
    (user_id is not null and storage_prefix = user_id::text || '/')
    or
    (user_id is null and storage_prefix is null and auth_deleted_at is not null)
  );

drop index if exists public.account_deletion_jobs_pending_idx;
create index account_deletion_jobs_pending_idx
  on public.account_deletion_jobs(updated_at)
  where storage_cleaned_at is null or auth_deleted_at is null;

create or replace function public.delete_my_account()
returns table (job_id uuid, storage_prefix text, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  deleting_auth_user_id uuid := auth.uid();
  deleting_profile_id uuid;
  tombstone_profile_id uuid := pg_catalog.gen_random_uuid();
  active_host_league_id uuid;
  account_deidentified_at timestamptz;
  new_job_id uuid;
  pending_job public.account_deletion_jobs%rowtype;
begin
  if deleting_auth_user_id is null then
    raise exception 'You must be signed in';
  end if;

  select auth_link.profile_id
    into deleting_profile_id
  from public.profile_auth_links as auth_link
  where auth_link.auth_user_id = deleting_auth_user_id;

  if deleting_profile_id is null then
    select deletion_job.*
      into pending_job
    from public.account_deletion_jobs as deletion_job
    where deletion_job.user_id = deleting_auth_user_id
      and deletion_job.auth_deleted_at is null
    for update;

    if found then
      return query
      select pending_job.id, pending_job.storage_prefix, deleting_auth_user_id;
      return;
    end if;

    raise exception 'Your profile could not be found';
  end if;

  -- Existing league writes lock the league, then membership, then profile.
  -- Keep that order to avoid a deletion/write deadlock.
  perform 1
  from public.leagues as league
  where league.host_id = deleting_profile_id
     or exists (
       select 1
       from public.league_memberships as membership
       where membership.league_id = league.id
         and membership.user_id = deleting_profile_id
     )
  order by league.id
  for update;

  perform 1
  from public.league_memberships as membership
  where membership.user_id = deleting_profile_id
  order by membership.league_id, membership.id
  for update;

  perform 1
  from public.league_invites as invite
  where invite.created_by = deleting_profile_id
  order by invite.id
  for update;

  select profile.deidentified_at
    into account_deidentified_at
  from public.profiles as profile
  where profile.id = deleting_profile_id
  for update;

  if not found then
    select deletion_job.*
      into pending_job
    from public.account_deletion_jobs as deletion_job
    where deletion_job.user_id = deleting_auth_user_id
      and deletion_job.auth_deleted_at is null
    for update;

    if found then
      return query
      select pending_job.id, pending_job.storage_prefix, deleting_auth_user_id;
      return;
    end if;

    raise exception 'Your profile could not be found';
  end if;

  select league.id
    into active_host_league_id
  from public.leagues as league
  where league.host_id = deleting_profile_id
    and league.status = 'active'
  order by league.id
  limit 1;

  if active_host_league_id is not null then
    raise exception
      'Account deletion is blocked while you host an active Pint War. Finish or end that Pint War first.';
  end if;

  account_deidentified_at := coalesce(account_deidentified_at, now());

  insert into public.profiles (
    id,
    display_name,
    avatar_url,
    free_trial_used_at,
    deidentified_at,
    created_at,
    updated_at
  )
  values (
    tombstone_profile_id,
    'Deleted player',
    null,
    null,
    null,
    now(),
    now()
  );

  update public.pint_logs as pint_log
  set user_id = tombstone_profile_id,
      photo_path = 'deleted/' || pint_log.id::text,
      content_sha256 = null,
      latitude = null,
      longitude = null,
      pub_latitude = null,
      pub_longitude = null
  where pint_log.user_id = deleting_profile_id;

  -- Reports authored by the deleted account are user-generated content.
  delete from public.pub_review_reports as report
  where report.reporter_id = deleting_profile_id;

  delete from public.pub_reviews as review
  where review.user_id = deleting_profile_id;

  delete from public.notifications as notification
  where notification.user_id = deleting_profile_id;

  update public.leagues as league
  set host_id = tombstone_profile_id
  where league.host_id = deleting_profile_id;

  update public.league_memberships as membership
  set user_id = tombstone_profile_id
  where membership.user_id = deleting_profile_id;

  update public.league_invites as invite
  set revoked_at = case
        when invite.revoked_at is null and invite.expires_at > now() then now()
        else invite.revoked_at
      end,
      created_by = tombstone_profile_id
  where invite.created_by = deleting_profile_id;

  update public.pub_review_bonus_guards as bonus_guard
  set user_id = tombstone_profile_id
  where bonus_guard.user_id = deleting_profile_id;

  update public.paid_league_purchases as purchase
  set user_id = tombstone_profile_id
  where purchase.user_id = deleting_profile_id;

  perform pg_catalog.set_config(
    'pint_wars.account_deletion_rekey',
    'on',
    true
  );

  update public.league_score_events as score_event
  set user_id = tombstone_profile_id
  where score_event.user_id = deleting_profile_id;

  perform pg_catalog.set_config(
    'pint_wars.account_deletion_rekey',
    'off',
    true
  );

  update public.profiles as tombstone
  set deidentified_at = account_deidentified_at,
      updated_at = now()
  where tombstone.id = tombstone_profile_id;

  delete from public.profiles as profile
  where profile.id = deleting_profile_id;

  insert into public.account_deletion_jobs (
    user_id,
    storage_prefix,
    deidentified_at,
    auth_deleted_at
  )
  values (
    deleting_auth_user_id,
    deleting_auth_user_id::text || '/',
    account_deidentified_at,
    null
  )
  on conflict (user_id) do update
    set storage_prefix = excluded.storage_prefix,
        deidentified_at = excluded.deidentified_at,
        auth_deleted_at = null,
        updated_at = now()
  returning id into new_job_id;

  return query
  select
    new_job_id,
    deleting_auth_user_id::text || '/',
    deleting_auth_user_id;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- The previous de-identification flow may have left jobs whose profile still
-- carries the original Auth UUID. The API invokes this service-role-only repair
-- before Auth deletion. It reuses the same locked user RPC and its league-first
-- lock order; jobs already re-keyed by the current RPC are a no-op.
create or replace function public.rekey_account_deletion_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_auth_user_id uuid;
  linked_profile_id uuid;
  profile_deidentified_at timestamptz;
  previous_auth_subject text;
begin
  select deletion_job.user_id
    into pending_auth_user_id
  from public.account_deletion_jobs as deletion_job
  where deletion_job.id = p_job_id
    and deletion_job.auth_deleted_at is null
    and deletion_job.user_id is not null
    and deletion_job.storage_prefix = deletion_job.user_id::text || '/';

  if pending_auth_user_id is null then
    return;
  end if;

  select auth_link.profile_id, profile.deidentified_at
    into linked_profile_id, profile_deidentified_at
  from public.profile_auth_links as auth_link
  join public.profiles as profile on profile.id = auth_link.profile_id
  where auth_link.auth_user_id = pending_auth_user_id;

  -- The current user RPC already removed this mapping and re-keyed all rows.
  if linked_profile_id is null then
    return;
  end if;

  if profile_deidentified_at is null then
    raise exception 'Account deletion job does not reference a de-identified profile';
  end if;

  previous_auth_subject := pg_catalog.current_setting(
    'request.jwt.claim.sub',
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    pending_auth_user_id::text,
    true
  );

  perform public.delete_my_account();

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(previous_auth_subject, ''),
    true
  );
end;
$$;

revoke execute on function public.rekey_account_deletion_job(uuid)
  from public, anon, authenticated;
grant execute on function public.rekey_account_deletion_job(uuid)
  to service_role;