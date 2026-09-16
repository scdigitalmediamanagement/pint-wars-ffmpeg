---
name: Expo SDK patch updates
description: Expo compatibility checks can request a just-released patch that the workspace package firewall will not install yet.
---

When Expo reports a patch-level package mismatch, check whether the requested release is newer than the workspace package firewall's minimum-release window. If Metro starts and the app typechecks, document the mismatch rather than bypassing the firewall.

**Why:** The Expo SDK patch was published after the workspace's allowed release window, so `expo install --fix` failed even though the installed scaffold ran normally.

**How to apply:** Re-run `CI=1 pnpm exec expo install --check` after the release becomes available; do not force an unverified package or change the SDK major version.