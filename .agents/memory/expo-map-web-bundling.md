---
name: Expo map web bundling
description: Platform-specific import guidance for react-native-maps in this Expo app.
---

Native map libraries must be imported through a `.native.tsx` module with a separate `.web.tsx` fallback; do not import `react-native-maps` directly from a shared screen.

**Why:** `react-native-maps` 1.18.0 can pull React Native native internals into the Expo web bundle, causing Metro to fail even when native iOS bundling succeeds.

**How to apply:** Keep the shared screen dependent on a platform-neutral map component entry. Put `MapView` and `Marker` only in the native implementation, and provide a non-data web fallback.