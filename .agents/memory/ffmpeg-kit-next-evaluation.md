---
name: FFmpegKit Next evaluation
description: Research findings and adoption gates for local cross-platform Memories video rendering.
---

As checked on 2026-09-30, `arthenica/ffmpeg-kit-next` is the original maintainer's active continuation of the archived FFmpeg Kit project. Its React Native bridge and native binaries are source/local-package based, not published to npm, Maven Central, or CocoaPods. The wrapper uses React Native codegen/autolinking but has no Expo config plugin; its documented consumption path needs a local Android Maven repository registered by the app and Apple XCFrameworks vendored through CocoaPods. No Expo SDK 57 / RN 0.86.3 EAS build was verified.

The LGPL-only build path must be explicit: x264 is GPL; the current build scripts can enable OpenH264 or platform media-codec support, but H.264 encoder availability must be checked in the produced Android and Apple binaries. OpenH264's BSD notice does not resolve H.264 patent rights. Audit every linked dependency: the Android AAR's libiconv notice is GPLv3 text while the source also has an LGPLv2.1 library license, so verify the selected license and ship the correct notices rather than relying on `CONFIG_GPL=0`. Android `drawtext` requires both FreeType and HarfBuzz, so check `CONFIG_DRAWTEXT_FILTER` in the target build. Linux host-library switches additionally need system pkg-config development metadata; an OpenH264-only Linux build does not prove drawtext support.

**Why:** The maintained upstream is substantially more credible than the deprecated v6 package, but local binary packaging, Expo config generation, codec licensing, and device-runtime verification remain operational risks; a nearby RN test target or successful native compile is not proof of Expo/EAS compatibility.

**How to apply:** Prefer upstream FFmpegKit Next for a bounded native proof of concept. Build every shipping ABI, confirm filter/encoder flags from each platform artifact, then verify Expo SDK/RN builds, on-device encode/playback, share/save handoff, shipped-size impact, and LGPL/patent obligations before production adoption. Keep Memories selection and private photo retrieval unchanged.

For reproducible Nix builds, protect both profile discovery and build-shell entry: the upstream `nix-ios.sh --list-profiles` path runs `nix eval` on the flake, while the build runs `nix develop`. Apply `--no-update-lock-file --no-write-lock-file` to both and compare the checked-in `flake.lock` before and after.

**Why:** Protecting only `nix develop` leaves the earlier flake evaluation free to update lock inputs before the build begins.

**How to apply:** When wrapping upstream Nix scripts, identify every flake-evaluating subcommand, preserve the repository lockfile, and record its checksum and locked input revisions with the artifact.