-- Backfill profiles for accounts created before the Stage 1 auth trigger existed.
-- This is safe to run repeatedly and preserves any profile already created.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), 'Player')
from auth.users as u
on conflict (id) do nothing;