-- Record verified paid league purchases and consume each purchase exactly once.
-- Payment verification remains the responsibility of a trusted future backend.

create table public.paid_league_purchases (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null,
  provider_purchase_id text not null,
  provider_product_id text not null,
  capacity integer not null,
  price_gbp_pence integer not null,
  purchased_at timestamptz not null,
  verified_at timestamptz not null default now(),
  consumed_at timestamptz,
  league_id uuid unique references public.leagues(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint paid_league_purchases_provider_check
    check (
      provider = lower(trim(provider))
      and char_length(provider) between 1 and 50
      and provider ~ '^[a-z0-9][a-z0-9._-]*$'
    ),
  constraint paid_league_purchases_purchase_id_check
    check (
      provider_purchase_id = trim(provider_purchase_id)
      and char_length(provider_purchase_id) between 1 and 255
    ),
  constraint paid_league_purchases_product_id_check
    check (
      provider_product_id = trim(provider_product_id)
      and char_length(provider_product_id) between 1 and 255
    ),
  constraint paid_league_purchases_plan_check
    check (
      (capacity = 6 and price_gbp_pence = 299)
      or (capacity = 10 and price_gbp_pence = 399)
      or (capacity = 14 and price_gbp_pence = 499)
      or (capacity = 16 and price_gbp_pence = 599)
    ),
  constraint paid_league_purchases_consumption_check
    check (
      (consumed_at is null and league_id is null)
      or (consumed_at is not null and league_id is not null)
    ),
  constraint paid_league_purchases_provider_purchase_key
    unique (provider, provider_purchase_id)
);

create index paid_league_purchases_user_id_idx
  on public.paid_league_purchases(user_id);

create index paid_league_purchases_unconsumed_idx
  on public.paid_league_purchases(user_id, verified_at)
  where consumed_at is null;

alter table public.paid_league_purchases enable row level security;

create policy "users can read their own paid league purchases"
  on public.paid_league_purchases
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.paid_league_purchases from public;
revoke all on table public.paid_league_purchases from anon;
revoke all on table public.paid_league_purchases from authenticated;
grant select on table public.paid_league_purchases to authenticated;

-- A future trusted payment verifier calls this function only after it has
-- independently verified the provider transaction and product-to-plan mapping.
-- Repeated delivery of the same verified transaction is idempotent, but any
-- attempt to reuse its identifier for a different user or plan is rejected.
create or replace function public.record_verified_paid_league_purchase(
  p_user_id uuid,
  p_provider text,
  p_provider_purchase_id text,
  p_provider_product_id text,
  p_capacity integer,
  p_purchased_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_provider text := lower(trim(p_provider));
  normalized_purchase_id text := trim(p_provider_purchase_id);
  normalized_product_id text := trim(p_provider_product_id);
  expected_price_gbp_pence integer;
  recorded_purchase public.paid_league_purchases%rowtype;
begin
  if p_user_id is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_user_id
  ) then
    raise exception 'Purchase user could not be found';
  end if;

  if normalized_provider is null
    or char_length(normalized_provider) not between 1 and 50
    or normalized_provider !~ '^[a-z0-9][a-z0-9._-]*$'
  then
    raise exception 'Payment provider is invalid';
  end if;

  if normalized_purchase_id is null
    or char_length(normalized_purchase_id) not between 1 and 255
  then
    raise exception 'Provider purchase ID is invalid';
  end if;

  if normalized_product_id is null
    or char_length(normalized_product_id) not between 1 and 255
  then
    raise exception 'Provider product ID is invalid';
  end if;

  if p_purchased_at is null then
    raise exception 'Purchase timestamp is required';
  end if;

  expected_price_gbp_pence := case p_capacity
    when 6 then 299
    when 10 then 399
    when 14 then 499
    when 16 then 599
    else null
  end;

  if expected_price_gbp_pence is null then
    raise exception 'Paid league capacity must be 6, 10, 14, or 16 players';
  end if;

  insert into public.paid_league_purchases (
    user_id,
    provider,
    provider_purchase_id,
    provider_product_id,
    capacity,
    price_gbp_pence,
    purchased_at
  )
  values (
    p_user_id,
    normalized_provider,
    normalized_purchase_id,
    normalized_product_id,
    p_capacity,
    expected_price_gbp_pence,
    p_purchased_at
  )
  on conflict (provider, provider_purchase_id) do nothing
  returning * into recorded_purchase;

  if recorded_purchase.id is null then
    select purchase.* into recorded_purchase
    from public.paid_league_purchases as purchase
    where purchase.provider = normalized_provider
      and purchase.provider_purchase_id = normalized_purchase_id;

    if recorded_purchase.id is null then
      raise exception 'Verified purchase could not be recorded';
    end if;

    if recorded_purchase.user_id is distinct from p_user_id
      or recorded_purchase.provider_product_id is distinct from normalized_product_id
      or recorded_purchase.capacity is distinct from p_capacity
      or recorded_purchase.price_gbp_pence is distinct from expected_price_gbp_pence
      or recorded_purchase.purchased_at is distinct from p_purchased_at
    then
      raise exception 'Provider purchase ID conflicts with an existing purchase';
    end if;
  end if;

  return recorded_purchase.id;
end;
$$;

-- The signed-in purchaser can consume one verified purchase to create exactly
-- one paid league. The row lock serializes concurrent attempts, and all writes
-- roll back together if any step fails.
create or replace function public.create_paid_league(
  p_name text,
  p_purchase_id uuid
)
returns table (league_id uuid, invite_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  purchase_row public.paid_league_purchases%rowtype;
  new_league_id uuid;
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then
    raise exception 'League name must be between 1 and 80 characters';
  end if;

  if p_purchase_id is null then
    raise exception 'Paid league purchase is required';
  end if;

  select purchase.* into purchase_row
  from public.paid_league_purchases as purchase
  where purchase.id = p_purchase_id
    and purchase.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Verified paid league purchase could not be found';
  end if;

  if purchase_row.verified_at is null then
    raise exception 'Paid league purchase has not been verified';
  end if;

  if purchase_row.consumed_at is not null or purchase_row.league_id is not null then
    raise exception 'This paid league purchase has already been used';
  end if;

  insert into public.leagues (
    name,
    host_id,
    capacity,
    is_free,
    status,
    starts_at,
    ends_at
  )
  values (
    trim(p_name),
    auth.uid(),
    purchase_row.capacity,
    false,
    'active',
    now(),
    now() + interval '10 days'
  )
  returning id into new_league_id;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (new_league_id, auth.uid(), 'host', 'active');

  new_code := public.make_invite_code();

  insert into public.league_invites (league_id, created_by, code, expires_at)
  values (new_league_id, auth.uid(), new_code, now() + interval '10 days');

  update public.paid_league_purchases as purchase
  set league_id = new_league_id,
      consumed_at = now()
  where purchase.id = purchase_row.id
    and purchase.league_id is null
    and purchase.consumed_at is null;

  if not found then
    raise exception 'This paid league purchase has already been used';
  end if;

  return query select new_league_id, new_code;
end;
$$;

revoke execute on function public.record_verified_paid_league_purchase(
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz
) from public;
revoke execute on function public.record_verified_paid_league_purchase(
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz
) from anon;
revoke execute on function public.record_verified_paid_league_purchase(
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz
) from authenticated;
grant execute on function public.record_verified_paid_league_purchase(
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz
) to service_role;

revoke execute on function public.create_paid_league(text, uuid) from public;
revoke execute on function public.create_paid_league(text, uuid) from anon;
grant execute on function public.create_paid_league(text, uuid) to authenticated;