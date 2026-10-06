# Pint Wars Memories — local iOS module

This private Expo Modules API module is discovered in Expo's default `./modules`
directory. It has only an Apple configuration and an iOS podspec; it has no Android
source, Gradle configuration, React Native FFmpeg wrapper, or cloud renderer.
No generated `ios/` or `android/` project is committed.

## Reused native artifact

FFmpegKit Next 9.0.0, source commit
`5e51b2da4c3593c0f2f9b49f53eeb497d93e39d3`, built with iOS VideoToolbox.
The eight vendored XCFrameworks are device-only arm64, with **no simulator slice**.
Their original manifest, verification report and notices are preserved in
`ios/Notices`. Dynamic vendored frameworks are declared through CocoaPods,
which must link and embed them in the generated device application.

The supplied artifact statically verifies H.264 VideoToolbox and disables
GPL/x264. It did not perform an iPhone encode test. Included LGPL/source notices
do not by themselves establish all distribution or patent obligations.

## Feature contract

- `beginJobAsync()` creates an app-private, protected temporary job directory.
- `stagePhotoAsync(jobId, base64, player, pub)` decodes a private API response,
  downsamples/orients it and writes a portrait JPEG; no remote URL is accepted.
- `createMemoriesVideoAsync(jobId, imagePaths, metadata)` validates job-owned
  local paths and renders a 720×1280, 30fps H.264 MP4 with silent AAC audio.
  It uses argument arrays, not shell strings. There is no music input.
- The 900-frame film contains a two-second opening, 25 seconds of the existing
  selected photos, and a three-second real winner/results card. Short fades
  through navy between slides avoid decoding every source simultaneously.
- `onProgress` reports completed encoding segments, not a fabricated countdown.
- The native Expo view uses AVPlayer for the generated local file, play/pause,
  replay and seeking.
- `saveVideoAsync(jobId)` requests Photos **add-only** authorization on a
  deliberate tap, reports denial/failure, and resolves only after Photos saves.
- `shareVideoAsync(jobId)` presents UIActivityViewController with the actual
  local MP4. Sheet dismissal is not an error or a reported share success.
- `releaseJob(jobId)` cancels pending encoding. Source/frame/segment artifacts
  are discarded after generation where safe; the successful MP4 and selected
  thumbnail JPEGs remain only while the screen/player/save/share uses them.
  Consumer holds prevent deleting a file during a native Photos/share operation.
  Stale directories from a terminated process are removed after 24 hours on
  the next generation.

Authentication, full-war API access, private Supabase Storage authorization,
photo selection, scoring and database schema are unchanged. HTTP authorization
or network failures abort generation; only missing/unsupported source photos
may be replaced from the existing fallback selection tail.

## Verification and required device pass

Run `pnpm --filter @workspace/pint-wars run test:memories` and
`pnpm --filter @workspace/pint-wars run verify:memories-native`.

A native **iPhone** build containing this module is required. Expo Go, web and
Android cannot run this exporter; those environments show a truthful unavailable
state and real final results, with Save/Share disabled.

Before considering the feature device-verified, compile/link the generated iOS
project and check on an iPhone:

1. All eight dynamic XCFrameworks are embedded and signed; app launch succeeds.
2. A completed war's private photos download, including HEIC/orientation cases.
3. Generation produces a playable ~30s portrait H.264/AAC MP4 with the final result.
4. Cancel/back/retry and a failed encode/download remove unneeded temporary files.
5. Play/pause/replay/timeline and thumbnail seeking work.
6. Photos add-only allow/deny/restricted, Settings return, full-storage failure,
   and save success behave correctly.
7. The share sheet receives an MP4 file, completes/dismisses correctly, and can
   finish safely if the screen is left while iOS still holds the file.
