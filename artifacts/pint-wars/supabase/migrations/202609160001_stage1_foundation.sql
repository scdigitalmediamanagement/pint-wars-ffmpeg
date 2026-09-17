create extension if not exists pgcrypto;

do $$
begin
  create type public.league_status as enum ('active', 'completed');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.membership_role as enum ('host', 'player');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.membership_status as enum ('active', 'retired', 'removed');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  host_id uuid not null references public.profiles(id) on delete restrict,
  capacity integer not null default 8 check (capacity = 8),
  is_free boolean not null default true check (is_free = true),
  status public.league_status not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint leagues_valid_window check (ends_at > starts_at)
);

create table if not exists public.league_memberships (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.membership_role not null default 'player',
  status public.membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  retired_at timestamptz,
  removed_at timestamptz,
  unique (league_id, user_id)
);

create table if not exists public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists league_memberships_user_id_idx on public.league_memberships(user_id);
create index if not exists league_memberships_league_id_idx on public.league_memberships(league_id);
create index if not exists league_invites_code_idx on public.league_invites(code);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Player')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_memberships
    where league_id = p_league_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_league_host(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leagues
    where id = p_league_id
      and host_id = auth.uid()
  );
$$;

create or replace function public.make_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.league_invites where code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.create_free_league(p_name text)
returns table (league_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_league_id uuid;
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  if char_length(trim(p_name)) not between 1 and 80 then
    raise exception 'League name must be between 1 and 80 characters';
  end if;
  if exists (
    select 1 from public.leagues
    where host_id = auth.uid()
      and is_free = true
      and status = 'active'
      and ends_at > now()
  ) then
    raise exception 'You already have an active free league';
  end if;

  insert into public.leagues (name, host_id, capacity, is_free, status, starts_at, ends_at)
  values (trim(p_name), auth.uid(), 8, true, 'active', now(), now() + interval '30 days')
  returning id into new_league_id;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (new_league_id, auth.uid(), 'host', 'active');

  new_code := public.make_invite_code();
  insert into public.league_invites (league_id, created_by, code, expires_at)
  values (new_league_id, auth.uid(), new_code, now() + interval '30 days');

  return query select new_league_id, new_code;
end;
$$;

create or replace function public.create_league_invite(p_league_id uuid)
returns table (invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  league_end timestamptz;
begin
  if not public.is_league_host(p_league_id) then
    raise exception 'Only the host can create invites';
  end if;
  select ends_at into league_end from public.leagues where id = p_league_id;
  new_code := public.make_invite_code();
  insert into public.league_invites (league_id, created_by, code, expires_at)
  values (p_league_id, auth.uid(), new_code, least(league_end, now() + interval '30 days'));
  return query select new_code;
end;
$$;

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

  if exists (
    select 1 from public.league_memberships
    where league_id = invite_row.league_id and user_id = auth.uid()
  ) then
    select status into existing_status
    from public.league_memberships
    where league_id = invite_row.league_id and user_id = auth.uid();
    if existing_status = 'active' then
      return query select invite_row.league_id;
      return;
    end if;
    raise exception 'You are no longer an active member of this league';
  end if;

  select count(*) into active_count
  from public.league_memberships
  where league_id = invite_row.league_id and status = 'active';
  if active_count >= 8 then
    raise exception 'This league is full';
  end if;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (invite_row.league_id, auth.uid(), 'player', 'active');
  return query select invite_row.league_id;
end;
$$;

create or replace function public.complete_expired_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;
  update public.leagues
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where id = p_league_id
    and status = 'active'
    and ends_at <= now();
end;
$$;

create or replace function public.refresh_my_league_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  update public.leagues as l
  set status = 'completed', completed_at = coalesce(l.completed_at, now())
  where l.status = 'active'
    and l.ends_at <= now()
    and exists (
      select 1
      from public.league_memberships as lm
      where lm.league_id = l.id
        and lm.user_id = auth.uid()
    );
end;
$$;

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_memberships enable row level security;
alter table public.league_invites enable row level security;

drop policy if exists "profiles are readable by signed-in users" on public.profiles;
create policy "profiles are readable by signed-in users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members can read their leagues" on public.leagues;
create policy "members can read their leagues"
  on public.leagues for select to authenticated using (public.is_league_member(id) or host_id = auth.uid());

drop policy if exists "members can read league memberships" on public.league_memberships;
create policy "members can read league memberships"
  on public.league_memberships for select to authenticated using (public.is_league_member(league_id) or user_id = auth.uid());

drop policy if exists "hosts can read their invites" on public.league_invites;
create policy "hosts can read their invites"
  on public.league_invites for select to authenticated using (created_by = auth.uid() or public.is_league_host(league_id));

revoke insert, update, delete on public.leagues from authenticated;
revoke insert, update, delete on public.league_memberships from authenticated;
revoke insert, update, delete on public.league_invites from authenticated;

revoke execute on function public.is_league_member(uuid) from public;
revoke execute on function public.is_league_host(uuid) from public;
revoke execute on function public.make_invite_code() from public;
revoke execute on function public.create_free_league(text) from public;
revoke execute on function public.create_league_invite(uuid) from public;
revoke execute on function public.join_league_by_code(text) from public;
revoke execute on function public.complete_expired_league(uuid) from public;
revoke execute on function public.refresh_my_league_statuses() from public;

grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.is_league_host(uuid) to authenticated;
grant execute on function public.create_free_league(text) to authenticated;
grant execute on function public.create_league_invite(uuid) to authenticated;
grant execute on function public.join_league_by_code(text) to authenticated;
grant execute on function public.complete_expired_league(uuid) to authenticated;
grant execute on function public.refresh_my_league_statuses() to authenticated;