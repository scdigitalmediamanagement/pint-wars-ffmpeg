-- Paid Pint War duration is selected independently from the verified product.
-- Keep legacy paid durations by deriving their value from the saved timestamps.

alter table public.leagues
  add column duration_days integer;

update public.leagues
set duration_days = greatest(
  1,
  round(extract(epoch from (ends_at - starts_at)) / 86400)::integer
)
where is_free = false
  and duration_days is null;

comment on column public.leagues.duration_days is
  'Selected whole-day duration for paid leagues; free leagues may leave it null.';

create or replace function public.create_paid_league(
  p_name text,
  p_purchase_id uuid,
  p_duration_days integer
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
  league_starts_at timestamptz;
  league_ends_at timestamptz;
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

  if p_duration_days is null or p_duration_days not between 1 and 30 then
    raise exception 'Paid league duration must be between 1 and 30 days';
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
    if purchase_row.consumed_at is null or purchase_row.league_id is null then
      raise exception 'Paid league purchase has an invalid consumption state';
    end if;

    select invite.code into new_code
    from public.league_invites as invite
    where invite.league_id = purchase_row.league_id
      and invite.created_by = auth.uid()
    order by invite.created_at desc
    limit 1;

    if new_code is null then
      raise exception 'The existing paid league invite could not be found';
    end if;

    return query select purchase_row.league_id, new_code;
    return;
  end if;

  league_starts_at := now();
  league_ends_at := league_starts_at + make_interval(days => p_duration_days);

  insert into public.leagues (
    name,
    host_id,
    capacity,
    duration_days,
    is_free,
    status,
    starts_at,
    ends_at
  )
  values (
    trim(p_name),
    auth.uid(),
    purchase_row.capacity,
    p_duration_days,
    false,
    'active',
    league_starts_at,
    league_ends_at
  )
  returning id into new_league_id;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (new_league_id, auth.uid(), 'host', 'active');

  new_code := public.make_invite_code();

  insert into public.league_invites (league_id, created_by, code, expires_at)
  values (new_league_id, auth.uid(), new_code, league_ends_at);

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

-- Keep older authenticated clients functional with their previous 30-day default.
create or replace function public.create_paid_league(
  p_name text,
  p_purchase_id uuid
)
returns table (league_id uuid, invite_code text)
language sql
security definer
set search_path = ''
as $$
  select created.league_id, created.invite_code
  from public.create_paid_league(p_name, p_purchase_id, 30) as created
$$;

revoke execute on function public.create_paid_league(text, uuid, integer) from public;
revoke execute on function public.create_paid_league(text, uuid, integer) from anon;
grant execute on function public.create_paid_league(text, uuid, integer) to authenticated;

revoke execute on function public.create_paid_league(text, uuid) from public;
revoke execute on function public.create_paid_league(text, uuid) from anon;
grant execute on function public.create_paid_league(text, uuid) to authenticated;