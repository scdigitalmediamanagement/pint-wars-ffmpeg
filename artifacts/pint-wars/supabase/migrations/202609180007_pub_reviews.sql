-- First-party pub reviews. Google Places is used only as the stable pub identity.
create table if not exists public.pub_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pub_provider text not null check (pub_provider = 'google_places'),
  pub_place_id text not null check (char_length(pub_place_id) between 1 and 500),
  pub_name text not null check (char_length(pub_name) between 1 and 500),
  pub_address text not null default '' check (char_length(pub_address) <= 1000),
  atmosphere_rating smallint not null check (atmosphere_rating between 1 and 5),
  pints_drinks_rating smallint not null check (pints_drinks_rating between 1 and 5),
  staff_rating smallint not null check (staff_rating between 1 and 5),
  music_rating smallint not null check (music_rating between 1 and 5),
  food_rating smallint check (food_rating is null or food_rating between 1 and 5),
  value_rating smallint check (value_rating is null or value_rating between 1 and 5),
  would_return boolean not null,
  review_text text check (review_text is null or char_length(review_text) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pub_provider, pub_place_id)
);

create index if not exists pub_reviews_pub_identity_idx
  on public.pub_reviews(pub_provider, pub_place_id, created_at desc);
create index if not exists pub_reviews_user_idx
  on public.pub_reviews(user_id, created_at desc);

create table if not exists public.pub_review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.pub_reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists pub_review_photos_review_idx
  on public.pub_review_photos(review_id, created_at);

create table if not exists public.pub_review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.pub_reviews(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);

create index if not exists pub_review_reports_review_idx
  on public.pub_review_reports(review_id, created_at desc);

alter table public.pub_reviews enable row level security;
alter table public.pub_review_photos enable row level security;
alter table public.pub_review_reports enable row level security;
revoke all on public.pub_reviews from anon, authenticated;
revoke all on public.pub_review_photos from anon, authenticated;
revoke all on public.pub_review_reports from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pub-review-photos',
  'pub-review-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_upload_pub_review_photo(
  p_review_id uuid,
  p_user_id uuid,
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() = p_user_id
    and exists (
      select 1
      from public.pub_review_photos as photo
      join public.pub_reviews as review on review.id = photo.review_id
      where photo.review_id = p_review_id
        and photo.user_id = p_user_id
        and photo.storage_path = p_storage_path
        and review.user_id = p_user_id
    );
$$;

create or replace function public.can_read_pub_review_photo(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.pub_review_photos as photo
      where photo.storage_path = p_storage_path
    );
$$;

drop policy if exists "review authors can upload review photos" on storage.objects;
create policy "review authors can upload review photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pub-review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_upload_pub_review_photo(
      ((storage.foldername(name))[2])::uuid,
      auth.uid(),
      name
    )
  );

drop policy if exists "signed-in users can read review photos" on storage.objects;
create policy "signed-in users can read review photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pub-review-photos'
    and public.can_read_pub_review_photo(name)
  );

drop policy if exists "review authors can delete review photos" on storage.objects;
create policy "review authors can delete review photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pub-review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.can_review_pub(
  p_pub_provider text,
  p_pub_place_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and p_pub_provider = 'google_places'
    and exists (
      select 1
      from public.pint_logs as pint_log
      where pint_log.user_id = auth.uid()
        and pint_log.pub_provider = p_pub_provider
        and pint_log.pub_place_id = p_pub_place_id
    );
$$;

create or replace function public.get_pub_review_summary(
  p_pub_provider text,
  p_pub_place_id text
)
returns table (
  pub_provider text,
  pub_place_id text,
  review_count bigint,
  average_atmosphere numeric,
  average_pints_drinks numeric,
  average_staff numeric,
  average_music numeric,
  average_food numeric,
  average_value numeric,
  would_return_count bigint,
  current_user_review_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  if p_pub_provider is distinct from 'google_places' or nullif(trim(p_pub_place_id), '') is null then
    raise exception 'The pub identity is invalid';
  end if;

  return query
  select
    p_pub_provider,
    p_pub_place_id,
    count(review.id)::bigint,
    round(avg(review.atmosphere_rating)::numeric, 2),
    round(avg(review.pints_drinks_rating)::numeric, 2),
    round(avg(review.staff_rating)::numeric, 2),
    round(avg(review.music_rating)::numeric, 2),
    round(avg(review.food_rating)::numeric, 2),
    round(avg(review.value_rating)::numeric, 2),
    count(*) filter (where review.would_return)::bigint,
    (max(review.id::text) filter (where review.user_id = auth.uid()))::uuid
  from public.pub_reviews as review
  where review.pub_provider = p_pub_provider
    and review.pub_place_id = p_pub_place_id;
end;
$$;

create or replace function public.get_pub_reviews(
  p_pub_provider text,
  p_pub_place_id text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  author_name text,
  pub_provider text,
  pub_place_id text,
  pub_name text,
  pub_address text,
  atmosphere_rating smallint,
  pints_drinks_rating smallint,
  staff_rating smallint,
  music_rating smallint,
  food_rating smallint,
  value_rating smallint,
  would_return boolean,
  review_text text,
  created_at timestamptz,
  updated_at timestamptz,
  photo_paths text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  if p_pub_provider is distinct from 'google_places' or nullif(trim(p_pub_place_id), '') is null then
    raise exception 'The pub identity is invalid';
  end if;

  return query
  select
    review.id,
    review.user_id,
    coalesce(profile.display_name, 'Pint Wars player'),
    review.pub_provider,
    review.pub_place_id,
    review.pub_name,
    review.pub_address,
    review.atmosphere_rating,
    review.pints_drinks_rating,
    review.staff_rating,
    review.music_rating,
    review.food_rating,
    review.value_rating,
    review.would_return,
    review.review_text,
    review.created_at,
    review.updated_at,
    coalesce(
      array_agg(photo.storage_path order by photo.created_at)
        filter (where photo.id is not null),
      '{}'::text[]
    )
  from public.pub_reviews as review
  left join public.profiles as profile on profile.id = review.user_id
  left join public.pub_review_photos as photo on photo.review_id = review.id
  where review.pub_provider = p_pub_provider
    and review.pub_place_id = p_pub_place_id
  group by review.id, profile.display_name
  order by review.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.get_pub_review_detail(p_review_id uuid)
returns table (
  id uuid,
  user_id uuid,
  author_name text,
  pub_provider text,
  pub_place_id text,
  pub_name text,
  pub_address text,
  atmosphere_rating smallint,
  pints_drinks_rating smallint,
  staff_rating smallint,
  music_rating smallint,
  food_rating smallint,
  value_rating smallint,
  would_return boolean,
  review_text text,
  created_at timestamptz,
  updated_at timestamptz,
  photo_paths text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    review.id,
    review.user_id,
    coalesce(profile.display_name, 'Pint Wars player'),
    review.pub_provider,
    review.pub_place_id,
    review.pub_name,
    review.pub_address,
    review.atmosphere_rating,
    review.pints_drinks_rating,
    review.staff_rating,
    review.music_rating,
    review.food_rating,
    review.value_rating,
    review.would_return,
    review.review_text,
    review.created_at,
    review.updated_at,
    coalesce(
      array_agg(photo.storage_path order by photo.created_at)
        filter (where photo.id is not null),
      '{}'::text[]
    )
  from public.pub_reviews as review
  left join public.profiles as profile on profile.id = review.user_id
  left join public.pub_review_photos as photo on photo.review_id = review.id
  where auth.uid() is not null
    and review.id = p_review_id
  group by review.id, profile.display_name;
$$;

create or replace function public.create_pub_review(
  p_pub_provider text,
  p_pub_place_id text,
  p_atmosphere_rating smallint,
  p_pints_drinks_rating smallint,
  p_staff_rating smallint,
  p_music_rating smallint,
  p_would_return boolean,
  p_food_rating smallint default null,
  p_value_rating smallint default null,
  p_review_text text default null
)
returns table (
  review_id uuid,
  pub_provider text,
  pub_place_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_pub record;
  new_review_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  if p_pub_provider is distinct from 'google_places' or nullif(trim(p_pub_place_id), '') is null then
    raise exception 'The pub identity is invalid';
  end if;
  if p_atmosphere_rating not between 1 and 5
    or p_pints_drinks_rating not between 1 and 5
    or p_staff_rating not between 1 and 5
    or p_music_rating not between 1 and 5
    or (p_food_rating is not null and p_food_rating not between 1 and 5)
    or (p_value_rating is not null and p_value_rating not between 1 and 5) then
    raise exception 'Ratings must be between 1 and 5';
  end if;
  if p_review_text is not null and char_length(p_review_text) > 3000 then
    raise exception 'The written review is too long';
  end if;
  select pint_log.pub_name, pint_log.pub_address
    into latest_pub
    from public.pint_logs as pint_log
   where pint_log.user_id = auth.uid()
     and pint_log.pub_provider = p_pub_provider
     and pint_log.pub_place_id = p_pub_place_id
   order by pint_log.logged_at desc
   limit 1;
  if not found then
    raise exception 'You can only review a pub after logging a confirmed pint there';
  end if;

  insert into public.pub_reviews (
    user_id, pub_provider, pub_place_id, pub_name, pub_address,
    atmosphere_rating, pints_drinks_rating, staff_rating, music_rating,
    food_rating, value_rating, would_return, review_text
  )
  values (
    auth.uid(), p_pub_provider, p_pub_place_id,
    coalesce(latest_pub.pub_name, p_pub_place_id),
    coalesce(latest_pub.pub_address, ''),
    p_atmosphere_rating, p_pints_drinks_rating, p_staff_rating, p_music_rating,
    p_food_rating, p_value_rating, p_would_return, nullif(trim(p_review_text), '')
  )
  on conflict (user_id, pub_provider, pub_place_id)
  do update set
    pub_name = excluded.pub_name,
    pub_address = excluded.pub_address,
    atmosphere_rating = excluded.atmosphere_rating,
    pints_drinks_rating = excluded.pints_drinks_rating,
    staff_rating = excluded.staff_rating,
    music_rating = excluded.music_rating,
    food_rating = excluded.food_rating,
    value_rating = excluded.value_rating,
    would_return = excluded.would_return,
    review_text = excluded.review_text,
    updated_at = now()
  returning id into new_review_id;

  return query select new_review_id, p_pub_provider, p_pub_place_id;
end;
$$;

create or replace function public.update_pub_review(
  p_review_id uuid,
  p_atmosphere_rating smallint,
  p_pints_drinks_rating smallint,
  p_staff_rating smallint,
  p_music_rating smallint,
  p_would_return boolean,
  p_food_rating smallint default null,
  p_value_rating smallint default null,
  p_review_text text default null
)
returns table (review_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_at timestamptz;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if p_atmosphere_rating not between 1 and 5
    or p_pints_drinks_rating not between 1 and 5
    or p_staff_rating not between 1 and 5
    or p_music_rating not between 1 and 5
    or (p_food_rating is not null and p_food_rating not between 1 and 5)
    or (p_value_rating is not null and p_value_rating not between 1 and 5) then
    raise exception 'Ratings must be between 1 and 5';
  end if;
  if not exists (
    select 1
    from public.pub_reviews as review
    where review.id = p_review_id
      and review.user_id = auth.uid()
  ) then
    raise exception 'Review not found or you are not the author';
  end if;
  if not exists (
    select 1
    from public.pub_reviews as review
    join public.pint_logs as pint_log
      on pint_log.user_id = auth.uid()
     and pint_log.pub_provider = review.pub_provider
     and pint_log.pub_place_id = review.pub_place_id
    where review.id = p_review_id
      and review.user_id = auth.uid()
  ) then
    raise exception 'You can only review a pub after logging a confirmed pint there';
  end if;
  update public.pub_reviews
     set atmosphere_rating = p_atmosphere_rating,
         pints_drinks_rating = p_pints_drinks_rating,
         staff_rating = p_staff_rating,
         music_rating = p_music_rating,
         food_rating = p_food_rating,
         value_rating = p_value_rating,
         would_return = p_would_return,
         review_text = nullif(trim(p_review_text), ''),
         updated_at = now()
   where id = p_review_id
     and user_id = auth.uid()
   returning id, pub_reviews.updated_at into p_review_id, changed_at;
  if not found then raise exception 'Review not found or you are not the author'; end if;
  return query select p_review_id, changed_at;
end;
$$;

create or replace function public.delete_pub_review(p_review_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  delete from public.pub_reviews
   where id = p_review_id and user_id = auth.uid();
  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then raise exception 'Review not found or you are not the author'; end if;
  return true;
end;
$$;

create or replace function public.report_pub_review(p_review_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (
    select 1
    from public.pub_reviews
    where id = p_review_id
      and user_id <> auth.uid()
  ) then
    raise exception 'Review not found';
  end if;
  insert into public.pub_review_reports(review_id, reporter_id, reason)
  values (p_review_id, auth.uid(), trim(p_reason))
  returning id into report_id;
  return report_id;
end;
$$;

create or replace function public.attach_pub_review_photo(
  p_review_id uuid,
  p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if p_storage_path not like auth.uid()::text || '/' || p_review_id::text || '/%' then
    raise exception 'The review photo path is invalid';
  end if;
  if not exists (
    select 1
    from public.pub_reviews as review
    where review.id = p_review_id
      and review.user_id = auth.uid()
  ) then
    raise exception 'Review not found or you are not the author';
  end if;
  insert into public.pub_review_photos(review_id, user_id, storage_path)
  values (p_review_id, auth.uid(), p_storage_path)
  returning id into photo_id;
  return photo_id;
end;
$$;

create or replace function public.delete_pub_review_photo(p_storage_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  delete from public.pub_review_photos
   where storage_path = p_storage_path
     and user_id = auth.uid();
  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then raise exception 'Review photo not found or you are not the owner'; end if;
  return true;
end;
$$;

drop function if exists public.get_my_pub_passport();
create function public.get_my_pub_passport()
returns table (
  location_key text,
  pub_provider text,
  pub_place_id text,
  pub_name text,
  address text,
  latitude double precision,
  longitude double precision,
  pint_count bigint,
  most_recent_visit timestamptz,
  review_count bigint,
  average_atmosphere numeric,
  average_pints_drinks numeric,
  average_staff numeric,
  average_music numeric,
  average_food numeric,
  average_value numeric,
  current_user_review_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  return query
  with passport_logs as (
    select
      case when pint_log.pub_provider is not null and pint_log.pub_place_id is not null
        then 'place:' || pint_log.pub_provider || ':' || pint_log.pub_place_id
        else format('location:%s,%s', round(pint_log.latitude::numeric, 4), round(pint_log.longitude::numeric, 4))
      end as location_key,
      pint_log.pub_provider,
      pint_log.pub_place_id,
      pint_log.pub_name,
      pint_log.pub_address as address,
      coalesce(pint_log.pub_latitude, pint_log.latitude) as latitude,
      coalesce(pint_log.pub_longitude, pint_log.longitude) as longitude,
      pint_log.logged_at
    from public.pint_logs as pint_log
    where pint_log.user_id = auth.uid()
      and ((pint_log.pub_provider is not null and pint_log.pub_place_id is not null)
        or (pint_log.latitude is not null and pint_log.longitude is not null))
  ),
  grouped as (
    select
      passport_log.location_key,
      (array_agg(passport_log.pub_provider order by passport_log.logged_at desc))[1] as pub_provider,
      (array_agg(passport_log.pub_place_id order by passport_log.logged_at desc))[1] as pub_place_id,
      (array_agg(passport_log.pub_name order by passport_log.logged_at desc))[1] as pub_name,
      (array_agg(passport_log.address order by passport_log.logged_at desc))[1] as address,
      avg(passport_log.latitude)::double precision as latitude,
      avg(passport_log.longitude)::double precision as longitude,
      count(*)::bigint as pint_count,
      max(passport_log.logged_at) as most_recent_visit
    from passport_logs as passport_log
    group by passport_log.location_key
  )
  select
    grouped.location_key, grouped.pub_provider, grouped.pub_place_id,
    grouped.pub_name, grouped.address, grouped.latitude, grouped.longitude,
    grouped.pint_count, grouped.most_recent_visit,
    count(review.id)::bigint,
    round(avg(review.atmosphere_rating)::numeric, 2),
    round(avg(review.pints_drinks_rating)::numeric, 2),
    round(avg(review.staff_rating)::numeric, 2),
    round(avg(review.music_rating)::numeric, 2),
    round(avg(review.food_rating)::numeric, 2),
    round(avg(review.value_rating)::numeric, 2),
    (max(review.id::text) filter (where review.user_id = auth.uid()))::uuid
  from grouped
  left join public.pub_reviews as review
    on review.pub_provider = grouped.pub_provider
   and review.pub_place_id = grouped.pub_place_id
  group by grouped.location_key, grouped.pub_provider, grouped.pub_place_id,
    grouped.pub_name, grouped.address, grouped.latitude, grouped.longitude,
    grouped.pint_count, grouped.most_recent_visit
  order by grouped.most_recent_visit desc;
end;
$$;

revoke execute on function public.can_review_pub(text, text) from public, anon;
revoke execute on function public.can_upload_pub_review_photo(uuid, uuid, text) from public, anon;
revoke execute on function public.can_read_pub_review_photo(text) from public, anon;
revoke execute on function public.get_pub_review_summary(text, text) from public, anon;
revoke execute on function public.get_pub_reviews(text, text, integer, integer) from public, anon;
revoke execute on function public.get_pub_review_detail(uuid) from public, anon;
revoke execute on function public.delete_pub_review(uuid) from public, anon;
revoke execute on function public.report_pub_review(uuid, text) from public, anon;
revoke execute on function public.attach_pub_review_photo(uuid, text) from public, anon;
revoke execute on function public.delete_pub_review_photo(text) from public, anon;
revoke execute on function public.get_my_pub_passport() from public, anon;

grant execute on function public.can_review_pub(text, text) to authenticated;
grant execute on function public.can_upload_pub_review_photo(uuid, uuid, text) to authenticated;
grant execute on function public.can_read_pub_review_photo(text) to authenticated;
grant execute on function public.get_pub_review_summary(text, text) to authenticated;
grant execute on function public.get_pub_reviews(text, text, integer, integer) to authenticated;
grant execute on function public.get_pub_review_detail(uuid) to authenticated;
revoke execute on function public.create_pub_review(text, text, smallint, smallint, smallint, smallint, boolean, smallint, smallint, text) from public, anon;
revoke execute on function public.update_pub_review(uuid, smallint, smallint, smallint, smallint, boolean, smallint, smallint, text) from public, anon;
grant execute on function public.create_pub_review(text, text, smallint, smallint, smallint, smallint, boolean, smallint, smallint, text) to authenticated;
grant execute on function public.update_pub_review(uuid, smallint, smallint, smallint, smallint, boolean, smallint, smallint, text) to authenticated;
grant execute on function public.delete_pub_review(uuid) to authenticated;
grant execute on function public.report_pub_review(uuid, text) to authenticated;
grant execute on function public.attach_pub_review_photo(uuid, text) to authenticated;
grant execute on function public.delete_pub_review_photo(text) to authenticated;
grant execute on function public.get_my_pub_passport() to authenticated;