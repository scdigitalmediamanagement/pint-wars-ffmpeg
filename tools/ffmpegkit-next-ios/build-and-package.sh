#!/usr/bin/env bash
set -Eeuo pipefail

readonly EXPECTED_COMMIT="5e51b2da4c3593c0f2f9b49f53eeb497d93e39d3"
readonly EXPECTED_VERSION="9.0.0"
readonly BUILD_COMMAND="./nix-ios.sh -p xcode26 -x --arch=arm64 --jobs=2 --enable-lib-ios-videotoolbox"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
runner_temp="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
output_dir="${FFMPEG_OUTPUT_DIR:-${runner_temp}/ffmpegkit-next-ios-output}"
source_dir="${runner_temp}/ffmpeg-kit-next-${EXPECTED_COMMIT}"
build_console_log="${output_dir}/build-console.log"

mkdir -p "$output_dir"
cp "${script_dir}/ANDROID_POC_LICENSE_REVIEW.md" \
  "${output_dir}/android-poc-license-review.md"

fail() {
  echo "ERROR: $*" >&2
  printf 'FAILED: %s\n' "$*" > "${output_dir}/build-result.txt"
  exit 1
}

actual_xcode="$(xcodebuild -version | awk 'NR == 1 { print $2 }')"
[[ "$actual_xcode" == "26.6" ]] || fail "Expected Xcode 26.6, got ${actual_xcode:-unknown}"

real_nix="$(command -v nix || true)"
[[ -n "$real_nix" ]] || fail "Nix is not installed on the runner"
export FFMPEG_REAL_NIX="$real_nix"

# nix-ios.sh intentionally invokes `nix develop` itself. Add the Nix lock
# policy to that invocation so the build cannot silently resolve new inputs.
nix_shim_dir="${runner_temp}/ffmpegkit-next-nix-lock-shim"
mkdir -p "$nix_shim_dir"
cat > "${nix_shim_dir}/nix" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail

command_name="${1:-}"
if [[ "$command_name" == "develop" || "$command_name" == "eval" ]]; then
  shift
  exec "${FFMPEG_REAL_NIX:?}" "$command_name" \
    --no-update-lock-file --no-write-lock-file "$@"
fi

exec "${FFMPEG_REAL_NIX:?}" "$@"
SHIM
chmod +x "${nix_shim_dir}/nix"
export PATH="${nix_shim_dir}:${PATH}"

rm -rf "$source_dir"
git clone --filter=blob:none --no-checkout \
  https://github.com/arthenica/ffmpeg-kit-next.git "$source_dir"
git -C "$source_dir" checkout --detach "$EXPECTED_COMMIT"

actual_commit="$(git -C "$source_dir" rev-parse HEAD)"
[[ "$actual_commit" == "$EXPECTED_COMMIT" ]] || fail "Upstream commit mismatch: $actual_commit"
[[ -f "${source_dir}/flake.lock" ]] || fail "Pinned flake.lock is missing"
[[ -f "${source_dir}/tools/source/SOURCE" ]] || fail "Upstream source manifest is missing"
grep -Fq 'GPL_ENABLED="no"' "${source_dir}/ios.sh" || \
  fail "Pinned upstream iOS build no longer defaults GPL_ENABLED to no"

actual_version="$(
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' \
    "${source_dir}/react-native/package.json"
)"
[[ "$actual_version" == "$EXPECTED_VERSION" ]] || \
  fail "Expected FFmpegKit Next ${EXPECTED_VERSION}, got ${actual_version}"

lock_sha_before="$(shasum -a 256 "${source_dir}/flake.lock" | awk '{ print $1 }')"
nix_version="$(nix --version)"
profile_list="$(cd "$source_dir" && ./nix-ios.sh --list-profiles)"
printf '%s\n' "$profile_list" | grep -Fxq "xcode26" || \
  fail "The upstream xcode26 Nix profile is unavailable"

{
  echo "Upstream commit: $actual_commit"
  echo "FFmpegKit Next version: $actual_version"
  echo "flake.lock SHA-256: $lock_sha_before"
  echo "$nix_version"
  echo "Build command: $BUILD_COMMAND"
  echo "Runner label: ${FFMPEG_RUNNER_LABEL:-unknown}"
  echo "ImageOS: ${ImageOS:-unknown}"
  echo "ImageVersion: ${ImageVersion:-unknown}"
  echo "Runner architecture: ${RUNNER_ARCH:-unknown}"
  sw_vers
  xcodebuild -version
  xcrun --sdk iphoneos --show-sdk-version
} | tee "${output_dir}/preflight.txt"

if (
  cd "$source_dir"
  ./nix-ios.sh -p xcode26 -x --arch=arm64 --jobs=2 --enable-lib-ios-videotoolbox
) 2>&1 | tee "$build_console_log"; then
  build_status=0
else
  build_status=$?
fi

if [[ -f "${source_dir}/build.log" ]]; then
  cp "${source_dir}/build.log" "${output_dir}/upstream-build.log"
fi

{
  echo "Warning/error matches from captured build output:"
  for log_file in "$build_console_log" "${output_dir}/upstream-build.log"; do
    [[ -f "$log_file" ]] || continue
    echo
    echo "--- $(basename "$log_file") ---"
    if ! grep -Ein 'warning:|warn:|error:|fatal error:' "$log_file"; then
      echo "(none matched)"
    fi
  done
} > "${output_dir}/build-warnings.txt"

lock_sha_after="$(shasum -a 256 "${source_dir}/flake.lock" | awk '{ print $1 }')"
if [[ "$lock_sha_before" != "$lock_sha_after" ]]; then
  fail "flake.lock changed during the build; refusing to package the output"
fi

if [[ "$build_status" -ne 0 ]]; then
  printf 'FAILED: upstream build exited with status %s\n' "$build_status" \
    > "${output_dir}/build-result.txt"
  exit "$build_status"
fi

bundle_matches=()
while IFS= read -r bundle; do
  [[ -n "$bundle" ]] && bundle_matches+=("$bundle")
done < <(
  find "${source_dir}/prebuilt" -maxdepth 1 -type d \
    -name 'bundle-apple-xcframework-ios-*' -print | sort
)

[[ "${#bundle_matches[@]}" -eq 1 ]] || \
  fail "Expected exactly one iOS XCFramework bundle, found ${#bundle_matches[@]}"

export FFMPEG_SOURCE_DIR="$source_dir"
export FFMPEG_BUNDLE_DIR="${bundle_matches[0]}"
export FFMPEG_LOCK_SHA256="$lock_sha_before"
export FFMPEG_BUILD_COMMAND="$BUILD_COMMAND"
export FFMPEG_EXPECTED_COMMIT="$EXPECTED_COMMIT"
export FFMPEG_EXPECTED_VERSION="$EXPECTED_VERSION"
if python3 "${script_dir}/verify_and_package.py" \
  --source "$FFMPEG_SOURCE_DIR" \
  --bundle "$FFMPEG_BUNDLE_DIR" \
  --output "$output_dir"; then
  printf 'SUCCESS: iOS device arm64 XCFrameworks built and verified\n' \
    > "${output_dir}/build-result.txt"
else
  status=$?
  printf 'FAILED: XCFramework verification or packaging exited with status %s\n' "$status" \
    > "${output_dir}/build-result.txt"
  exit "$status"
fi
