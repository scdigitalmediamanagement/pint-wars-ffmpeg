-- Resolve pgcrypto explicitly because create_free_league runs with search_path = public.
-- This replaces the existing helper only; league rules and RPC signatures are unchanged.
create or replace function public.make_invite_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (
      select 1 from public.league_invites where code = candidate
    );
  end loop;
  return candidate;
end;
$$;