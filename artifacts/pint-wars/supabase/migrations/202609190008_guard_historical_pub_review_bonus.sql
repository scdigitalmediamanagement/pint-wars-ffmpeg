-- Preserve the global one-time pub review bonus across review deletion/recreation.
-- Apply this migration manually in Supabase. It is intentionally not applied by the app.
--
-- Existing reviews are marked as bonus-blocked without creating score events.
-- Existing PUB_REVIEW events are also recorded so the guard remains complete.

do $$
begin
  if to_regclass('public.league_score_events') is null then
    raise exception
      'Historical pub review guard migration requires public.league_score_events; apply the scoring ledger migration first';
  end if;
end
$$;

create table if not exists public.pub_review_bonus_guards (
  user_id uuid not null references public.profiles(id) on delete restrict,
  pub_provider text not null check (pub_provider = 'google_places'),
  pub_place_id text not null check (char_length(pub_place_id) between 1 and 500),
  guard_source text not null check (guard_source in ('historical_review', 'scored_review')),
  created_at timestamptz not null default now(),
  primary key (user_id, pub_provider, pub_place_id)
);

comment on table public.pub_review_bonus_guards is
  'Durable global guard preventing more than one PUB_REVIEW bonus per player and Google Places pub. Historical rows block scoring without representing score events.';

alter table public.pub_review_bonus_guards enable row level security;
revoke all on public.pub_review_bonus_guards from public, anon, authenticated;

insert into public.pub_review_bonus_guards (
  user_id,
  pub_provider,
  pub_place_id,
  guard_source,
  created_at
)
select
  score_event.user_id,
  score_event.pub_provider,
  score_event.pub_place_id,
  'scored_review',
  score_event.created_at
from public.league_score_events as score_event
where score_event.event_type = 'PUB_REVIEW'
on conflict (user_id, pub_provider, pub_place_id) do nothing;

insert into public.pub_review_bonus_guards (
  user_id,
  pub_provider,
  pub_place_id,
  guard_source,
  created_at
)
select
  review.user_id,
  review.pub_provider,
  review.pub_place_id,
  'historical_review',
  review.created_at
from public.pub_reviews as review
on conflict (user_id, pub_provider, pub_place_id) do nothing;

create or replace function public.create_pub_review(
  p_pub_provider text,
  p_pub_place_id text,
  p_pint_log_id uuid,
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
  qualifying_pint record;
  new_review_id uuid;
  bonus_already_guarded boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  if p_pub_provider is distinct from 'google_places'
     or nullif(trim(p_pub_place_id), '') is null then
    raise exception 'The pub identity is invalid';
  end if;
  if p_pint_log_id is null then
    raise exception 'A qualifying pint is required to review this pub';
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

  select
    pint_log.id,
    pint_log.league_id,
    pint_log.pub_provider,
    pint_log.pub_place_id,
    pint_log.pub_name,
    pint_log.pub_address
    into qualifying_pint
  from public.pint_logs as pint_log
  join public.leagues as league
    on league.id = pint_log.league_id
  where pint_log.id = p_pint_log_id
    and pint_log.user_id = auth.uid()
    and league.status = 'active'
    and league.starts_at <= now()
    and league.ends_at > now();

  if not found then
    raise exception 'The qualifying pint was not found in an active Pint War';
  end if;
  if qualifying_pint.pub_provider is distinct from 'google_places'
     or qualifying_pint.pub_place_id is null then
    raise exception 'The qualifying pint does not have a confirmed pub identity';
  end if;
  if qualifying_pint.pub_provider is distinct from p_pub_provider
     or qualifying_pint.pub_place_id is distinct from p_pub_place_id then
    raise exception 'The qualifying pint does not match this pub';
  end if;
  if exists (
    select 1
    from public.pub_reviews as review
    where review.user_id = auth.uid()
      and review.pub_provider = p_pub_provider
      and review.pub_place_id = p_pub_place_id
  ) then
    raise exception 'You have already reviewed this pub';
  end if;

  select exists (
    select 1
    from public.pub_review_bonus_guards as guard
    where guard.user_id = auth.uid()
      and guard.pub_provider = p_pub_provider
      and guard.pub_place_id = p_pub_place_id
  )
  into bonus_already_guarded;

  insert into public.pub_reviews (
    user_id, pub_provider, pub_place_id, pub_name, pub_address,
    atmosphere_rating, pints_drinks_rating, staff_rating, music_rating,
    food_rating, value_rating, would_return, review_text
  )
  values (
    auth.uid(), p_pub_provider, p_pub_place_id,
    coalesce(qualifying_pint.pub_name, p_pub_place_id),
    coalesce(qualifying_pint.pub_address, ''),
    p_atmosphere_rating, p_pints_drinks_rating, p_staff_rating, p_music_rating,
    p_food_rating, p_value_rating, p_would_return, nullif(trim(p_review_text), '')
  )
  returning id into new_review_id;

  if not bonus_already_guarded then
    insert into public.league_score_events (
      league_id,
      user_id,
      event_type,
      points,
      pint_log_id,
      review_id,
      pub_provider,
      pub_place_id
    )
    values (
      qualifying_pint.league_id,
      auth.uid(),
      'PUB_REVIEW',
      3,
      qualifying_pint.id,
      new_review_id,
      p_pub_provider,
      p_pub_place_id
    )
    on conflict (user_id, pub_provider, pub_place_id)
      where event_type = 'PUB_REVIEW'
    do nothing;

    insert into public.pub_review_bonus_guards (
      user_id,
      pub_provider,
      pub_place_id,
      guard_source
    )
    values (
      auth.uid(),
      p_pub_provider,
      p_pub_place_id,
      'scored_review'
    )
    on conflict (user_id, pub_provider, pub_place_id)
    do nothing;
  end if;

  return query select new_review_id, p_pub_provider, p_pub_place_id;
end;
$$;

revoke execute on function public.create_pub_review(
  text,
  text,
  uuid,
  smallint,
  smallint,
  smallint,
  smallint,
  boolean,
  smallint,
  smallint,
  text
) from public, anon;

grant execute on function public.create_pub_review(
  text,
  text,
  uuid,
  smallint,
  smallint,
  smallint,
  smallint,
  boolean,
  smallint,
  smallint,
  text
) to authenticated;