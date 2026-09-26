---
name: Expo DevTools startup
description: A missing GLib shared library can affect the Expo DevTools helper without preventing Metro from serving the app.
---

The Expo workflow may log that `react-native-devtools` cannot load `libglib-2.0.so.0`. Metro can still start and bundle the app; verify the workflow and platform bundles before treating this helper error as an app startup failure.

**Why:** The Replit container lacked the GLib shared library when the Expo SDK 57 workflow restarted, but Metro started and both web and Android exports completed.

**How to apply:** If this exact error appears, check whether Metro is serving and bundles succeed before changing project dependencies or attempting to install unrelated native libraries.