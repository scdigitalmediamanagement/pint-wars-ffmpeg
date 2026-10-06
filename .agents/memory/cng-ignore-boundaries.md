---
name: CNG ignore boundaries
description: Preserve maintained local Expo module source while ignoring generated application projects.
---

Keeping Expo/CNG does not mean ignoring every directory named `ios` or `android`. Maintained local-module native source and vendored frameworks must remain included in version control and build uploads.

**Why:** The app's original unanchored native-folder ignore rules silently excluded the new local Memories module's Swift source and frameworks, despite autolinking and a temporary prebuild succeeding.

**How to apply:** Ignore only generated app-root native projects. When adding or moving local native modules, explicitly check that their source and binary inputs are not ignored; successful local discovery alone does not prove those files will reach a remote build.
