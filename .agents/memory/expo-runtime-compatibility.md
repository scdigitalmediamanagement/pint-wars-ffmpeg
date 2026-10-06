---
name: Expo runtime compatibility
description: Metro startup and React Native style API pitfalls in this workspace.
---

If Metro announces CI mode with reloads disabled, restart the managed Expo workflow after the completed batch of UI changes instead of relying on hot reload.

**Why:** This workspace can run Metro without file watching, so ordinary source edits may leave the preview serving a stale bundle.

**How to apply:** Check startup output before relying on Expo's normal hot-reload behavior. Do not change secrets or start a duplicate server to fix stale content.

Use the currently typed React Native style helpers rather than assuming older helpers remain available; React Native 0.86 exposes `StyleSheet.absoluteFill`, not `absoluteFillObject`.

**Why:** The newer runtime removed a helper commonly used in older React Native examples.

**How to apply:** Resolve compatibility errors against installed type definitions; do not downgrade React Native or suppress the error.
