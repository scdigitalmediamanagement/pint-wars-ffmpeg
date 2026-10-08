---
name: CNG ignore boundaries
description: Preserve maintained local Expo module source while ignoring generated application projects.
---

Keeping Expo/CNG does not mean ignoring every directory named `ios` or `android`. Maintained local-module native source and vendored frameworks must remain included in version control and build uploads.

**Why:** The app's original unanchored native-folder ignore rules silently excluded the new local Memories module's Swift source and frameworks, despite autolinking and a temporary prebuild succeeding.

**How to apply:** Ignore only generated app-root native projects. When adding or moving local native modules, explicitly check that their source and binary inputs are not ignored; successful local discovery alone does not prove those files will reach a remote build.

Use an explicit runtime version for Expo Launch, even when this checkout has no generated app-root native project.

**Why:** Expo Launch can reach build configuration with an iOS project already present. That stage treats the app as bare and rejects runtime version policies such as `appVersion`.

**How to apply:** Keep the runtime version explicit and bump it whenever native compatibility changes; do not restore a runtime policy solely because the local app uses CNG.
