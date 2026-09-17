# Pint Wars

Pint Wars is a mobile app foundation for private 30-day pub competitions between friends.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/pint-wars run typecheck` — typecheck the Expo mobile app
- Required app env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo Router, React Native, Supabase Auth, Postgres, Realtime-ready

## Where things live

- Mobile app: `artifacts/pint-wars`
- Stage 1 Supabase migration: `artifacts/pint-wars/supabase/migrations/202609160001_stage1_foundation.sql`
- Stage 1 profile backfill migration: `artifacts/pint-wars/supabase/migrations/202609170001_stage1_profile_backfill.sql`
- Supabase client and auth: `artifacts/pint-wars/src/lib/supabase.ts`, `artifacts/pint-wars/src/providers/AuthProvider.tsx`
- League operations: `artifacts/pint-wars/src/lib/league-service.ts`

## Architecture decisions

- Free Stage 1 league creation is a database RPC; clients cannot insert leagues or memberships directly.
- Invite joining is a database RPC that validates the invite, capacity, and membership state.
- League status is server-normalized when a member loads their leagues or dashboard.
- Pint logging is intentionally not present yet; dashboard totals remain zero and the disabled button cannot award points.

## Product

Stage 1 supports account creation, free 8-player Pint War creation, invite-code joining, host invites, a 30-day league dashboard, and profile management.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
