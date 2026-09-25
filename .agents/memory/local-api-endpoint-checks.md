---
name: Local API endpoint checks
description: How to smoke-test an API artifact from shell when its dev domain is not available there.
---

ShellExec may not inherit `REPLIT_DEV_DOMAIN`, even though the managed API workflow receives it. Read the API workflow's active `waitForPort` and call `http://127.0.0.1:<port>/<route>` for local smoke tests instead of building a URL from an empty domain.

**Why:** A manual webhook request using the missing shell variable failed to resolve, while the local workflow port reached the route and returned the expected authentication response.

**How to apply:** Use the managed API port for development-only requests. For auth checks, use a deliberately invalid bearer token and never print secret values.