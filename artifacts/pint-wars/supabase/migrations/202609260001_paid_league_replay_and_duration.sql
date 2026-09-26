-- A replay of a consumed purchase returns its existing league instead of
-- consuming the purchase again. Paid leagues use a 30-day window; free league
-- creation and duration remain unchanged.

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
    now() + interval '30 days'
  )
  returning id into new_league_id;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (new_league_id, auth.uid(), 'host', 'active');

  new_code := public.make_invite_code();

  insert into public.league_invites (league_id, created_by, code, expires_at)
  values (new_league_id, auth.uid(), new_code, now() + interval '30 days');

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

revoke execute on function public.create_paid_league(text, uuid) from public;
revoke execute on function public.create_paid_league(text, uuid) from anon;
grant execute on function public.create_paid_league(text, uuid) to authenticated;