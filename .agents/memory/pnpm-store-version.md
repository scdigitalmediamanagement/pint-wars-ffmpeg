---
name: Workspace pnpm store version
description: Avoid pnpm unexpected-store failures when installing dependencies in this workspace.
---

Use Corepack with pnpm 11 for dependency installation when the existing workspace modules are linked to a pnpm v11 store. Pnpm 10 can fail with `ERR_PNPM_UNEXPECTED_STORE`; switching to pnpm 11 works without replacing the installed modules.

Do not assume a root `packageManager` pin alone fixes Replit deployment installation. In this environment, the automatic version bootstrap repeatedly invoked its installer and exhausted available threads before project dependencies were installed.

**Why:** Local store compatibility and deployment package-manager bootstrapping are separate problems. Matching the local store fixed local installs, but the deployment version pin introduced a different failure.

**How to apply:** For local installs, check the pnpm version and linked store path and use the matching Corepack-managed version. For publishing failures, inspect the first build error and distinguish non-interactive module removal from recursive version bootstrap. Do not rely on `CI=true` set only in `deployment.postBuild` to affect the earlier dependency install.