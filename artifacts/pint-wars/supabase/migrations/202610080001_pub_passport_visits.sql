-- Standalone Passport visits. Apply transactionally after the existing migrations.
-- No changes to log_pint_verified, create_pub_review, or the scoring ledger.
begin;

create table public.pub_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pub_provider text not null check (pub_provider = 'google_places'),
  pub_place_id text not null check (char_length(trim(pub_place_id)) between 1 and 500),
  pub_name text not null check (char_length(trim(pub_name)) between 1 and 500),
  pub_address text not null default '' check (char_length(pub_address) <= 1000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  photo_path text not null unique check (
    char_length(photo_path) between 1 and 500
    and split_part(photo_path, '/', 1) = user_id::text
    and split_part(photo_path, '/', 2) = 'passport'
    and array_length(string_to_array(photo_path, '/'), 1) = 3
    and split_part(photo_path, '/', 3) <> ''
  ),
  visited_at timestamptz not null default now()
);
create index pub_visits_user_pub_idx
  on public.pub_visits(user_id, pub_provider, pub_place_id, visited_at desc);
alter table public.pub_visits enable row level security;
revoke all on public.pub_visits from public, anon, authenticated;
grant select on public.pub_visits to authenticated;
create policy "players can read their own passport visits"
  on public.pub_visits for select to authenticated
  using (user_id = auth.uid());

-- Match the existing profile-row guard without replacing any War trigger.
create function public.guard_passport_visit_account()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  profile_deidentified_at timestamptz;
begin
  select profile.deidentified_at into profile_deidentified_at
  from public.profiles as profile where profile.id = new.user_id for update;
  if not found then raise exception 'Your profile could not be found'; end if;
  if profile_deidentified_at is not null then
    raise exception 'This account has been de-identified and cannot create new activity';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_passport_visit_account() from public, anon, authenticated;
create trigger reject_deidentified_passport_visit before insert on public.pub_visits
  for each row execute function public.guard_passport_visit_account();

-- The bucket is already private. These additional policies do not broaden the
-- league-bound War upload policy. Reads are owner-only; no public photo access.
create policy "players can upload their own passport photos"
  on storage.objects for insert to authenticated with check (
    bucket_id = 'pint-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'passport'
    and array_length(storage.foldername(name), 1) = 2
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deidentified_at is null)
  );
create policy "players can read their own passport photos"
  on storage.objects for select to authenticated using (
    bucket_id = 'pint-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'passport'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deidentified_at is null)
  );
create policy "players can discard unsaved passport photos"
  on storage.objects for delete to authenticated using (
    bucket_id = 'pint-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'passport'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deidentified_at is null)
  );
-- Account deletion already recursively removes pint-proofs/<auth-user-id>/.
-- pub_visits cascade when delete_my_account deletes the original profile.

create function public.log_passport_visit(
  p_pub_provider text, p_pub_place_id text, p_pub_name text, p_pub_address text,
  p_latitude double precision, p_longitude double precision, p_photo_path text
)
returns table (visit_id uuid, visited_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare saved_visit public.pub_visits%rowtype;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  -- Serialize with account deletion before reading the object or saving metadata.
  perform 1 from public.profiles p
  where p.id = auth.uid() and p.deidentified_at is null for update;
  if not found then raise exception 'Your account is unavailable'; end if;
  if p_pub_provider is distinct from 'google_places'
     or p_pub_place_id is null or char_length(trim(p_pub_place_id)) not between 1 and 500
     or p_pub_name is null or char_length(trim(p_pub_name)) not between 1 and 500
     or p_pub_address is null or char_length(p_pub_address) > 1000
     or p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'The selected pub is invalid';
  end if;
  if p_photo_path is null
     or split_part(p_photo_path, '/', 1) is distinct from auth.uid()::text
     or split_part(p_photo_path, '/', 2) is distinct from 'passport'
     or array_length(string_to_array(p_photo_path, '/'), 1) <> 3
     or split_part(p_photo_path, '/', 3) = '' then
    raise exception 'Exactly one Passport photo is required';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'pint-proofs' and o.name = p_photo_path
  ) then raise exception 'The Passport photo was not found'; end if;

  -- A retry of the same photo is idempotent; a fresh photo creates a repeat visit.
  insert into public.pub_visits as v (
    user_id, pub_provider, pub_place_id, pub_name, pub_address, latitude, longitude, photo_path
  ) values (
    auth.uid(), p_pub_provider, p_pub_place_id, trim(p_pub_name), p_pub_address,
    p_latitude, p_longitude, p_photo_path
  ) on conflict (photo_path) do nothing
  returning v.* into saved_visit;
  if not found then
    select v.* into saved_visit from public.pub_visits v
    where v.user_id = auth.uid() and v.photo_path = p_photo_path
      and v.pub_provider = p_pub_provider and v.pub_place_id = p_pub_place_id;
    if not found then raise exception 'This photo already belongs to another visit'; end if;
  end if;
  return query select saved_visit.id, saved_visit.visited_at;
end;
$$;
revoke execute on function public.log_passport_visit(text,text,text,text,double precision,double precision,text)
  from public, anon;
grant execute on function public.log_passport_visit(text,text,text,text,double precision,double precision,text)
  to authenticated;

create function public.create_passport_pub_review(
  p_pub_provider text, p_pub_place_id text,
  p_atmosphere_rating smallint, p_pints_drinks_rating smallint,
  p_staff_rating smallint, p_music_rating smallint, p_would_return boolean,
  p_food_rating smallint default null, p_value_rating smallint default null,
  p_review_text text default null
)
returns table (review_id uuid, pub_provider text, pub_place_id text)
language plpgsql security definer set search_path = ''
as $$
declare latest_visit public.pub_visits%rowtype; new_review_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  perform 1 from public.profiles p
  where p.id = auth.uid() and p.deidentified_at is null for update;
  if not found then raise exception 'Your account is unavailable'; end if;
  if p_pub_provider is distinct from 'google_places' or nullif(trim(p_pub_place_id), '') is null then
    raise exception 'The pub identity is invalid';
  end if;
  if p_atmosphere_rating is null or p_atmosphere_rating not between 1 and 5
     or p_pints_drinks_rating is null or p_pints_drinks_rating not between 1 and 5
     or p_staff_rating is null or p_staff_rating not between 1 and 5
     or p_music_rating is null or p_music_rating not between 1 and 5
     or p_would_return is null
     or (p_food_rating is not null and p_food_rating not between 1 and 5)
     or (p_value_rating is not null and p_value_rating not between 1 and 5)
     or char_length(p_review_text) > 3000 then
    raise exception 'The review ratings or text are invalid';
  end if;
  select v.* into latest_visit from public.pub_visits v
  where v.user_id = auth.uid() and v.pub_provider = p_pub_provider and v.pub_place_id = p_pub_place_id
  order by v.visited_at desc limit 1;
  if not found then raise exception 'Log a Passport visit here before leaving a review'; end if;
  insert into public.pub_reviews (
    user_id, pub_provider, pub_place_id, pub_name, pub_address,
    atmosphere_rating, pints_drinks_rating, staff_rating, music_rating,
    food_rating, value_rating, would_return, review_text
  ) values (
    auth.uid(), p_pub_provider, p_pub_place_id, latest_visit.pub_name, latest_visit.pub_address,
    p_atmosphere_rating, p_pints_drinks_rating, p_staff_rating, p_music_rating,
    p_food_rating, p_value_rating, p_would_return, nullif(trim(p_review_text), '')
  ) returning id into new_review_id;
  -- Deliberately no score event and no review bonus guard.
  return query select new_review_id, p_pub_provider, p_pub_place_id;
end;
$$;
revoke execute on function public.create_passport_pub_review(text,text,smallint,smallint,smallint,smallint,boolean,smallint,smallint,text)
  from public, anon;
grant execute on function public.create_passport_pub_review(text,text,smallint,smallint,smallint,smallint,boolean,smallint,smallint,text)
  to authenticated;

-- Eligibility/editing accept either existing pint evidence or a Passport visit.
create or replace function public.can_review_pub(p_pub_provider text, p_pub_place_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and p_pub_provider = 'google_places' and (
    exists (select 1 from public.pint_logs p where p.user_id = auth.uid()
      and p.pub_provider = p_pub_provider and p.pub_place_id = p_pub_place_id)
    or exists (select 1 from public.pub_visits v where v.user_id = auth.uid()
      and v.pub_provider = p_pub_provider and v.pub_place_id = p_pub_place_id)
  );
$$;

create or replace function public.update_pub_review(
  p_review_id uuid, p_atmosphere_rating smallint, p_pints_drinks_rating smallint,
  p_staff_rating smallint, p_music_rating smallint, p_would_return boolean,
  p_food_rating smallint default null, p_value_rating smallint default null, p_review_text text default null
)
returns table (review_id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare changed_at timestamptz;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  perform 1 from public.profiles p
  where p.id = auth.uid() and p.deidentified_at is null for update;
  if not found then raise exception 'Your account is unavailable'; end if;
  if p_atmosphere_rating is null or p_atmosphere_rating not between 1 and 5
     or p_pints_drinks_rating is null or p_pints_drinks_rating not between 1 and 5
     or p_staff_rating is null or p_staff_rating not between 1 and 5
     or p_music_rating is null or p_music_rating not between 1 and 5
     or p_would_return is null
     or (p_food_rating is not null and p_food_rating not between 1 and 5)
     or (p_value_rating is not null and p_value_rating not between 1 and 5)
     or char_length(p_review_text) > 3000 then
    raise exception 'The review ratings or text are invalid';
  end if;
  if not exists (select 1 from public.pub_reviews r where r.id = p_review_id
    and r.user_id = auth.uid() and public.can_review_pub(r.pub_provider, r.pub_place_id)) then
    raise exception 'Review not found or you are not eligible to edit it';
  end if;
  update public.pub_reviews r set
    atmosphere_rating = p_atmosphere_rating, pints_drinks_rating = p_pints_drinks_rating,
    staff_rating = p_staff_rating, music_rating = p_music_rating,
    food_rating = p_food_rating, value_rating = p_value_rating,
    would_return = p_would_return, review_text = nullif(trim(p_review_text), ''), updated_at = now()
  where r.id = p_review_id and r.user_id = auth.uid()
  returning r.updated_at into changed_at;
  if not found then raise exception 'Review not found'; end if;
  return query select p_review_id, changed_at;
end;
$$;

drop function public.get_my_pub_passport();
create function public.get_my_pub_passport()
returns table (
  location_key text, pub_provider text, pub_place_id text, pub_name text, address text,
  latitude double precision, longitude double precision, pint_count bigint,
  most_recent_visit timestamptz, review_count bigint,
  average_atmosphere numeric, average_pints_drinks numeric, average_staff numeric,
  average_music numeric, average_food numeric, average_value numeric, current_user_review_id uuid,
  visit_count bigint, latest_photo_path text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  return query
  with activity as (
    select
      case when p.pub_provider is not null and p.pub_place_id is not null
        then 'place:' || p.pub_provider || ':' || p.pub_place_id
        else format('location:%s,%s', round(p.latitude::numeric, 4), round(p.longitude::numeric, 4))
      end as location_key,
      p.pub_provider, p.pub_place_id, p.pub_name, p.pub_address as address,
      coalesce(p.pub_latitude, p.latitude) as latitude,
      coalesce(p.pub_longitude, p.longitude) as longitude,
      p.logged_at as visited_at, 1::bigint as pints, 0::bigint as visits, null::text as photo_path
    from public.pint_logs p where p.user_id = auth.uid()
      and ((p.pub_provider is not null and p.pub_place_id is not null)
        or (p.latitude is not null and p.longitude is not null))
    union all
    select 'place:' || v.pub_provider || ':' || v.pub_place_id,
      v.pub_provider, v.pub_place_id, v.pub_name, v.pub_address,
      v.latitude, v.longitude, v.visited_at, 0::bigint, 1::bigint, v.photo_path
    from public.pub_visits v where v.user_id = auth.uid()
  ), grouped as (
    select a.location_key,
      (array_agg(a.pub_provider order by a.visited_at desc))[1] as pub_provider,
      (array_agg(a.pub_place_id order by a.visited_at desc))[1] as pub_place_id,
      (array_agg(a.pub_name order by a.visited_at desc))[1] as pub_name,
      (array_agg(a.address order by a.visited_at desc))[1] as address,
      avg(a.latitude)::double precision as latitude, avg(a.longitude)::double precision as longitude,
      sum(a.pints)::bigint as pint_count, sum(a.visits)::bigint as visit_count,
      max(a.visited_at) as most_recent_visit,
      (array_agg(a.photo_path order by a.visited_at desc) filter (where a.photo_path is not null))[1] as photo_path
    from activity a group by a.location_key
  )
  select g.location_key, g.pub_provider, g.pub_place_id, g.pub_name, g.address,
    g.latitude, g.longitude, g.pint_count, g.most_recent_visit,
    count(r.id)::bigint, round(avg(r.atmosphere_rating)::numeric, 2),
    round(avg(r.pints_drinks_rating)::numeric, 2), round(avg(r.staff_rating)::numeric, 2),
    round(avg(r.music_rating)::numeric, 2), round(avg(r.food_rating)::numeric, 2),
    round(avg(r.value_rating)::numeric, 2),
    (max(r.id::text) filter (where r.user_id = auth.uid()))::uuid,
    g.visit_count, g.photo_path
  from grouped g left join public.pub_reviews r
    on r.pub_provider = g.pub_provider and r.pub_place_id = g.pub_place_id
  group by g.location_key, g.pub_provider, g.pub_place_id, g.pub_name, g.address,
    g.latitude, g.longitude, g.pint_count, g.most_recent_visit, g.visit_count, g.photo_path
  order by g.most_recent_visit desc;
end;
$$;
revoke execute on function public.get_my_pub_passport() from public, anon;
grant execute on function public.get_my_pub_passport() to authenticated;
notify pgrst, 'reload schema';
commit;
