---
name: Supabase DDL access
description: The Replit Supabase connector exposes only PostgREST data and RPC calls, not arbitrary SQL or schema-management endpoints.
---

The connected Supabase integration cannot apply DDL. Its proxy supports `/rest/v1/...`, while `/pg-meta/...` is rejected and an `exec_sql` RPC is absent. The workspace `DATABASE_URL` targets Replit's separate `heliumdb`, not the Supabase project.

**Why:** Applying the Pint Wars migration to the available local database would target the wrong system, and the public Supabase REST API cannot create tables or functions.

**How to apply:** Use a Supabase Management API/direct Postgres connection with DDL authority through a supported workspace integration or deployment setup; do not route the migration through the app's anon key or Replit's `DATABASE_URL`.