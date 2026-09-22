---
name: Supabase DDL access
description: The Replit Supabase connector exposes only PostgREST data and RPC calls, not arbitrary SQL or schema-management endpoints.
---

The connected Supabase integration cannot apply DDL. Its proxy supports `/rest/v1/...`, while `/pg-meta/...` is rejected and an `exec_sql` RPC is absent. The workspace `DATABASE_URL` targets Replit's separate `heliumdb`, not the Supabase project.

**Why:** Applying the Pint Wars migration to the available local database would target the wrong system, and the public Supabase REST API cannot create tables or functions.

**How to apply:** Use a Supabase Management API/direct Postgres connection with DDL authority through a supported workspace integration or deployment setup; do not route the migration through the app's anon key or Replit's `DATABASE_URL`.

For Supabase projects whose `db.<project-ref>.supabase.co` hostname resolves only to IPv6, use the project's Session Pooler host and port for workspace-side `psql` access. The pooler username is `postgres.<project-ref>`; the database password remains the project database password.

**Why:** The Replit workspace may not have a usable IPv6 route to the direct database host, while the Session Pooler provides a reachable IPv4 connection for migration work.

**How to apply:** Get the Session Pooler Host and Port from the Supabase Connect dialog, store them under test- or environment-specific names, and validate with a read-only query before applying DDL.

Supabase-managed extensions such as `pgcrypto` may be installed in the `extensions` schema. Security-definer functions that set `search_path = public` must qualify extension calls, for example `extensions.gen_random_bytes(...)`.

**Why:** An unqualified `gen_random_bytes( integer )` worked when called directly through REST but failed inside a `search_path = public` league RPC with PostgreSQL error `42883`.

**How to apply:** Inspect the extension schema before changing a function, then use a schema-qualified call in the smallest `create or replace function` repair migration.