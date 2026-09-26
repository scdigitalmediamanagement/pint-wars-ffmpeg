---
name: Expo DevTools startup
description: A missing GLib shared library can affect the Expo DevTools helper without preventing Metro from serving the app.
---

The Expo workflow may log that `react-native-devtools` cannot load `libglib-2.0.so.0`. Metro can still start and bundle the app. A web screenshot taken immediately after a cold restart may also be blank; once Metro finishes bundling, a second capture can render normally.

**Why:** The Replit container lacked the GLib shared library during an Expo workflow restart, but Metro started and bundled the app. On two cold starts, the first deep-link screenshot was blank and the next capture rendered the page.

**How to apply:** If this error or a blank first screenshot appears after restart, check Metro's bundle logs and capture again before diagnosing a route failure or changing project dependencies.