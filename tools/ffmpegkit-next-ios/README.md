# Isolated FFmpegKit Next iOS artifact build

The manual workflow at
`.github/workflows/ffmpegkit-next-ios-artifact.yml` builds an iOS device-only
XCFramework from the pinned FFmpegKit Next checkout. It does not edit or
integrate into Pint Wars, and it does not build an iOS simulator slice.

## Pinned build

- FFmpegKit Next version: `9.0.0`
- Upstream commit: `5e51b2da4c3593c0f2f9b49f53eeb497d93e39d3`
- Nix: `2.32.0`; the upstream checkout's `flake.lock` is used without updates
  or writes.
- Xcode: `26.6`
- Target: iOS device `arm64`
- Build options: `-p xcode26 -x --arch=arm64 --jobs=2
  --enable-lib-ios-videotoolbox`
- GPL is disabled by the upstream iOS build default. The workflow does not pass
  `--enable-gpl` or enable x264, and it checks the resulting libavcodec binary.

The workflow defaults to `macos-26-large`; GitHub's `workflow_dispatch` input
also allows `macos-26` and `macos-26-xlarge`. Larger runner availability
depends on the GitHub account. The selected runner's image identity, Xcode,
macOS, Nix, lockfile hash, build flags, and output inventory are recorded in
the generated manifest.

## Outputs

The GitHub Actions artifact contains:

- The individual `.xcframework` directories and a `.tar.gz` archive.
- Full console and upstream build logs.
- `source-license-manifest.json`, upstream source/notice files, and the Android
  POC licensing review.
- `verification.txt` and `SHA256SUMS`, covering the archive, logs, manifests,
  notices, and all regular output files except `SHA256SUMS` itself. The archive
  checksum covers the entire XCFramework directory tree, including framework
  symlinks.

The verification checks each framework's `Info.plist` and Mach-O architecture,
checks for the `h264_videotoolbox` registration string in libavcodec, and fails
if x264 or an enabled GPL configuration is found. This is static build
verification; the device-only iOS binary cannot be executed on the hosted Mac,
so it does not claim an on-device encode test.

The Android POC license issue is documented in
[`ANDROID_POC_LICENSE_REVIEW.md`](./ANDROID_POC_LICENSE_REVIEW.md). This
workflow does not alter that AAR and does not establish production clearance.