---
name: FFmpegKit Next evaluation
description: Research findings and adoption gates for local cross-platform Memories video rendering.
---

As checked on 2026-09-30, `arthenica/ffmpeg-kit-next` is the original maintainer's active continuation of the archived FFmpeg Kit project. It includes a React Native bridge and test app (RN 0.85.3), but does not publish its RN package or native binaries to npm, Maven Central, or CocoaPods. Its documented route is a local package plus native binaries built from source using its Nix workflow. No Expo SDK 57 or EAS Build recipe was verified.

The LGPL-only build path must be explicit: x264 is GPL; the current build scripts can enable OpenH264 or platform media-codec support, but H.264 encoder availability must be checked in the produced Android and Apple binaries. OpenH264 has separate patent considerations. Also verify text/filter support and keep GPL libraries disabled unless the product intentionally accepts GPL obligations.

**Why:** The maintained upstream is substantially more credible than the deprecated v6 package, but local native builds, CNG configuration, codec licensing, and binary size are the main operational risks; a nearby RN test target is not proof of Expo/EAS compatibility.

**How to apply:** Prefer upstream FFmpegKit Next for a bounded native proof of concept. Require Expo SDK/RN EAS builds on both platforms, representative photo-to-H.264 export, share/save handoff, measured device performance and shipped-size impact, and LGPL/patent review before production adoption. Keep Memories selection and private photo retrieval unchanged.