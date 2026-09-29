---
name: Supabase DDL access
description: The Replit Supabase connector exposes only PostgREST data and RPC calls, not arbitrary SQL or schema-management endpoints.
---

The connected Supabase integration cannot apply DDL. Its proxy supports `/rest/v1/...`, while `/pg-meta/...` is rejected and an `exec_sql` RPC is absent. The workspace `DATABASE_URL` targets Replit's separate `heliumdb`, not the Supabase project.

**Why:** Applying the Pint Wars migration to the available local database would target the wrong system, and the public Supabase REST API cannot create tables or functions.

**How to apply:** Use a Supabase Management API/direct Postgres connection with DDL authority through a supported workspace integration or deployment setup; do not route the migration through the app's anon key or Replit's `DATABASE_URL`.

In this workspace, the Supabase integration's `GET /rest/v1/` OpenAPI endpoint requires a `service_role` key, while table-specific zero-row selects can still check column existence.

**Why:** API-root schema introspection may be restricted independently from ordinary PostgREST table reads, so a root 401 does not mean every metadata check is unavailable.

**How to apply:** Use a narrow `GET /rest/v1/<table>?select=<known-columns>&limit=0` to check a known table shape when permitted; this cannot reveal function bodies or provide DDL access.

For Supabase projects whose `db.<project-ref>.supabase.co` hostname resolves only to IPv6, use the project's Session Pooler host and port for workspace-side `psql` access. The pooler username is `postgres.<project-ref>`; the database password remains the project database password.

**Why:** The Replit workspace may not have a usable IPv6 route to the direct database host, while the Session Pooler provides a reachable IPv4 connection for migration work.

**How to apply:** Get the Session Pooler Host and Port from the Supabase Connect dialog, store them under test- or environment-specific names, and validate with a read-only query before applying DDL.

Supabase-managed extensions such as `pgcrypto` may be installed in the `extensions` schema. Security-definer functions that set `search_path = public` must qualify extension calls, for example `extensions.gen_random_bytes(...)`.

**Why:** An unqualified `gen_random_bytes( integer )` worked when called directly through REST but failed inside a `search_path = public` league RPC with PostgreSQL error `42883`.

**How to apply:** Inspect the extension schema before changing a function, then use a schema-qualified call in the smallest `create or replace function` repair migration.

For `psql` migrations, do not rely on workspace `PGHOST` or `PGDATABASE` defaults. A malformed connection URI can fall back to Replit's local `helium` database; pass the Supabase Session Pooler host, port, user, SSL mode, and password explicitly, then verify the database identity before DDL.

**Why:** A production migration attempt using an invalid URI reached the workspace's default database, while a direct pooler connection succeeded only after the project-specific settings were supplied.

**How to apply:** Validate URI format or pass explicit libpq connection options, run a read-only identity/schema preflight, verify it is not the disposable test project, and apply the migration transactionally.