-- Stage 1: authenticated account de-identification.
-- Apply this migration manually in Supabase. It is intentionally not applied
-- by the app.
--
-- The RPC deliberately retains the profile UUID because historical foreign
-- keys and the immutable score ledger depend on it. Storage deletion and Auth
-- neutralization are performed by the trusted API server after this function
-- succeeds.

-- Preserve moderation reports authored by other users when a review is
-- deleted as part of the review author's account de-identification.
alter table public.pub_review_reports
  alter column review_id drop not null;

alter table public.pub_review_reports
  drop constraint if exists pub_review_reports_review_id_fkey;

alter table public.pub_review_reports
  add constraint pub_review_reports_review_id_fkey
  foreign key (review_id)
  references public.pub_reviews(id)
  on delete set null;

create or replace function public.delete_my_account()
returns table (storage_prefix text, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleting_user_id uuid := auth.uid();
  active_host_league_id uuid;
begin
  if deleting_user_id is null then
    raise exception 'You must be signed in';
  end if;

  -- Lock the profile first. This serializes account de-identification with
  -- new foreign-key-backed records for this user.
  perform 1
  from public.profiles
  where id = deleting_user_id
  for update;

  if not found then
    raise exception 'Your profile could not be found';
  end if;

  -- Lock every relevant league before its membership rows, matching the lock
  -- order used by the existing scoring and retirement paths. The operation is
  -- intentionally not based on ends_at: a league remains active until its
  -- existing completion logic marks it completed.
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
  from public.league_memberships
  where user_id = deleting_user_id
  order by league_id, id
  for update;

  perform 1
  from public.league_invites
  where created_by = deleting_user_id
  order by id
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

  -- Keep pint-log rows because immutable score events reference them. Remove
  -- the personal proof and location fields while retaining stable venue
  -- identity for historical summaries.
  update public.pint_logs
  set photo_path = 'deleted/' || id::text,
      content_sha256 = null,
      latitude = null,
      longitude = null,
      pub_latitude = null,
      pub_longitude = null
  where user_id = deleting_user_id;

  -- Reviews are user-authored content and may be removed safely: the score
  -- ledger intentionally stores review_id without a foreign key. Reports on
  -- these reviews retain their rows and become unattached through the
  -- ON DELETE SET NULL constraint above.
  delete from public.pub_reviews
  where user_id = deleting_user_id;

  delete from public.notifications
  where user_id = deleting_user_id;

  -- Revoke only currently active invite codes. Expired and historical invite
  -- rows remain available for audit and continue to reference the retained
  -- de-identified profile.
  update public.league_invites
  set revoked_at = now()
  where created_by = deleting_user_id
    and revoked_at is null
    and expires_at > now();

  -- Retain the stable profile UUID for historical foreign keys. Auth
  -- neutralization is deliberately performed by the trusted API server.
  update public.profiles
  set display_name = 'Deleted player',
      avatar_url = null,
      free_trial_used_at = null,
      updated_at = now()
  where id = deleting_user_id;

  return query
  select deleting_user_id::text || '/', deleting_user_id;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;