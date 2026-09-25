---
name: Workspace pnpm store version
description: Avoid pnpm unexpected-store failures when installing dependencies in this workspace.
---

Use Corepack with pnpm 11 for dependency installation when the existing workspace modules are linked to a pnpm v11 store. Pnpm 10 can fail with `ERR_PNPM_UNEXPECTED_STORE`; switching to pnpm 11 works without replacing the installed modules.

**Why:** The workspace's node_modules store and pnpm 10's default store are incompatible, so repeated pnpm 10 retries cannot succeed.

**How to apply:** Before retrying a failed install, check the current pnpm major and the linked store path; use the matching Corepack-managed version instead of deleting node_modules or changing dependency versions.