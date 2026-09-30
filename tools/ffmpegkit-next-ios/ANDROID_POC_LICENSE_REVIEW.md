# Android POC notice and licensing review

This is a record of the previously inspected Android text-rendering POC. This
iOS workflow does not download, rebuild, replace, or modify the Android AAR.

- The POC AAR targets `arm64-v8a` only. Its FFmpeg libraries use Android system
  libraries and APIs, including MediaCodec; third-party components such as
  OpenH264 and libiconv are linked into the FFmpeg libraries rather than
  shipped as separate third-party `.so` files.
- The POC build had GPL disabled (`CONFIG_GPL=0`). x264 was absent from the
  build configuration and encoder registration.
- The AAR includes OpenH264 under its BSD-2-Clause notice. That notice does not
  settle H.264 patent obligations.
- The unresolved issue is libiconv: it was statically linked, while the AAR's
  `license_libiconv.txt` contains GPLv3 text from the source distribution's
  `COPYING` file. The library's `COPYING.LIB` is LGPL-2.1. The notice does not
  establish that GPL code was linked, but the license selection and static-LGPL
  compliance materials need confirmation before distribution.
- Preserve the applicable FFmpegKit, FFmpeg, and third-party notices and source
  information. Resolve the libiconv mismatch and review H.264 patent obligations
  before any product release.

This is an engineering inventory, not legal advice or production clearance.