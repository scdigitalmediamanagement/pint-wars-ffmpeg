#!/usr/bin/env python3
"""Verify and package the pinned FFmpegKit Next iOS device XCFrameworks."""

from __future__ import annotations

import hashlib
import json
import os
import plistlib
import re
import shutil
import subprocess
import tarfile
from pathlib import Path


EXPECTED_FRAMEWORKS = {
    "ffmpegkit",
    "libavcodec",
    "libavdevice",
    "libavfilter",
    "libavformat",
    "libavutil",
    "libswresample",
    "libswscale",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def command_output(*command: str) -> str:
    result = subprocess.run(
        command, check=True, text=True, capture_output=True, errors="replace"
    )
    return result.stdout.strip()


def framework_binary(xcframework: Path, library: dict) -> Path:
    library_root = xcframework / library["LibraryIdentifier"]
    library_path = library_root / library["LibraryPath"]
    if library_path.suffix == ".framework":
        info_path = library_path / "Info.plist"
        if info_path.exists():
            with info_path.open("rb") as stream:
                framework_info = plistlib.load(stream)
            executable = framework_info.get("CFBundleExecutable", library_path.stem)
        else:
            executable = library_path.stem
        return library_path / executable
    return library_path


def enabled_config_values(source_dir: Path) -> dict[str, list[str]]:
    keys = ("CONFIG_GPL", "CONFIG_LIBX264_ENCODER", "CONFIG_H264_VIDEOTOOLBOX_ENCODER")
    found: dict[str, list[str]] = {key: [] for key in keys}
    roots = [source_dir / "prebuilt", source_dir / "src"]
    pattern = re.compile(
        r"^\s*(?:#define\s+)?(CONFIG_GPL|CONFIG_LIBX264_ENCODER|"
        r"CONFIG_H264_VIDEOTOOLBOX_ENCODER)\s*(?:=|\s)\s*(yes|no|1|0)\b",
        re.IGNORECASE | re.MULTILINE,
    )
    for root in roots:
        if not root.exists():
            continue
        for config_path in root.rglob("*"):
            if not config_path.is_file() or config_path.name not in {
                "config.h",
                "config.mak",
                "config_components.h",
            }:
                continue
            try:
                text = config_path.read_text(errors="replace")
            except OSError:
                continue
            for key, value in pattern.findall(text):
                found[key.upper()].append(value.lower())
    return found


def is_enabled(values: list[str]) -> bool:
    return any(value in {"yes", "1"} for value in values)


def copy_notice(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    source_dir = args.source.resolve()
    bundle_dir = args.bundle.resolve()
    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    frameworks = sorted(
        path for path in bundle_dir.iterdir() if path.is_dir() and path.name.endswith(".xcframework")
    )
    actual_names = {path.name[: -len(".xcframework")] for path in frameworks}
    if actual_names != EXPECTED_FRAMEWORKS:
        raise SystemExit(
            "Unexpected XCFramework inventory. "
            f"Missing={sorted(EXPECTED_FRAMEWORKS - actual_names)}, "
            f"extra={sorted(actual_names - EXPECTED_FRAMEWORKS)}"
        )

    framework_reports = []
    libavcodec_binary: Path | None = None
    total_framework_bytes = 0

    for xcframework in frameworks:
        info_path = xcframework / "Info.plist"
        if not info_path.is_file():
            raise SystemExit(f"Missing XCFramework Info.plist: {info_path}")
        with info_path.open("rb") as stream:
            info = plistlib.load(stream)

        libraries = info.get("AvailableLibraries", [])
        if len(libraries) != 1:
            raise SystemExit(
                f"{xcframework.name} must contain exactly one device slice, got {len(libraries)}"
            )
        library = libraries[0]
        if library.get("SupportedPlatform") != "ios":
            raise SystemExit(f"{xcframework.name} is not an iOS framework")
        if library.get("SupportedPlatformVariant"):
            raise SystemExit(f"{xcframework.name} unexpectedly contains a simulator variant")
        if sorted(library.get("SupportedArchitectures", [])) != ["arm64"]:
            raise SystemExit(
                f"{xcframework.name} has unexpected architectures: "
                f"{library.get('SupportedArchitectures')}"
            )

        binary = framework_binary(xcframework, library)
        if not binary.is_file():
            raise SystemExit(f"Missing framework binary: {binary}")
        lipo_output = command_output("/usr/bin/lipo", "-archs", str(binary))
        architectures = set(re.findall(r"\b(?:arm64|arm64e|x86_64|i386)\b", lipo_output))
        if architectures != {"arm64"}:
            raise SystemExit(f"Expected arm64-only binary, got {lipo_output}: {binary}")

        size_bytes = sum(path.stat().st_size for path in xcframework.rglob("*") if path.is_file())
        total_framework_bytes += size_bytes
        framework_reports.append(
            {
                "name": xcframework.name,
                "supported_platform": library["SupportedPlatform"],
                "supported_architectures": library["SupportedArchitectures"],
                "library_identifier": library["LibraryIdentifier"],
                "binary_relative_path": str(binary.relative_to(xcframework)),
                "binary_sha256": sha256_file(binary),
                "xcframework_size_bytes": size_bytes,
            }
        )
        if xcframework.name == "libavcodec.xcframework":
            libavcodec_binary = binary

    if libavcodec_binary is None:
        raise SystemExit("libavcodec.xcframework is missing")

    strings_output = command_output("/usr/bin/strings", "-a", str(libavcodec_binary))
    if "h264_videotoolbox" not in strings_output:
        raise SystemExit(
            "libavcodec binary does not contain the h264_videotoolbox encoder registration string"
        )
    if re.search(r"(?:libx264|x264_encoder)", strings_output, re.IGNORECASE):
        raise SystemExit("libavcodec binary contains an x264 reference")

    config_values = enabled_config_values(source_dir)
    if is_enabled(config_values["CONFIG_GPL"]):
        raise SystemExit(f"Generated FFmpeg config enables GPL: {config_values['CONFIG_GPL']}")
    if is_enabled(config_values["CONFIG_LIBX264_ENCODER"]):
        raise SystemExit(
            "Generated FFmpeg config enables x264: "
            f"{config_values['CONFIG_LIBX264_ENCODER']}"
        )
    videotoolbox_config_values = config_values["CONFIG_H264_VIDEOTOOLBOX_ENCODER"]
    if videotoolbox_config_values and not is_enabled(videotoolbox_config_values):
        raise SystemExit(
            "Generated FFmpeg config disables H.264 VideoToolbox: "
            f"{videotoolbox_config_values}"
        )

    copied_bundle = output_dir / "xcframeworks"
    if copied_bundle.exists():
        shutil.rmtree(copied_bundle)
    shutil.copytree(bundle_dir, copied_bundle, symlinks=True)

    notices_dir = output_dir / "notices"
    build_inputs_dir = output_dir / "build-inputs"
    notices_dir.mkdir(exist_ok=True)
    build_inputs_dir.mkdir(exist_ok=True)

    root_license = source_dir / "LICENSE"
    source_manifest = source_dir / "tools" / "source" / "SOURCE"
    flake_lock = source_dir / "flake.lock"
    for path in (root_license, source_manifest, flake_lock):
        if not path.is_file():
            raise SystemExit(f"Required source/license file is missing: {path}")
    copy_notice(root_license, notices_dir / "FFmpegKitNext-LICENSE")
    copy_notice(source_manifest, notices_dir / "upstream-SOURCE")
    copy_notice(flake_lock, build_inputs_dir / "flake.lock")

    embedded_notice_files = []
    for framework in frameworks:
        for path in framework.rglob("*"):
            if not path.is_file():
                continue
            upper_name = path.name.upper()
            if not (
                upper_name.startswith("LICENSE")
                or upper_name.startswith("NOTICE")
                or upper_name == "SOURCE"
                or upper_name == "SOURCE.TXT"
            ):
                continue
            text = path.read_text(errors="replace")
            if (
                re.search(r"(?:^|[._-])GPL(?:V\d+)?(?:[._-]|$)", upper_name)
                or re.search(r"GNU GENERAL PUBLIC LICENSE", text, re.IGNORECASE)
            ):
                raise SystemExit(f"GPL license text found in output: {path}")
            relative = path.relative_to(bundle_dir)
            destination = notices_dir / "embedded" / relative
            copy_notice(path, destination)
            embedded_notice_files.append(
                {
                    "path": str(destination.relative_to(output_dir)),
                    "sha256": sha256_file(destination),
                }
            )

    framework_license_paths = [
        path
        for path in (bundle_dir / "ffmpegkit.xcframework").rglob("*")
        if path.is_file() and path.name.upper() == "LICENSE"
    ]
    if not framework_license_paths:
        raise SystemExit("ffmpegkit.xcframework is missing its LGPL license resource")
    if not any(sha256_file(path) == sha256_file(root_license) for path in framework_license_paths):
        raise SystemExit(
            "ffmpegkit.xcframework license resource does not match the pinned upstream LICENSE"
        )

    lock_sha = os.environ["FFMPEG_LOCK_SHA256"]
    expected_commit = os.environ["FFMPEG_EXPECTED_COMMIT"]
    expected_version = os.environ["FFMPEG_EXPECTED_VERSION"]
    lock_data = json.loads(flake_lock.read_text())
    flake_lock_inputs = {
        name: node["locked"]
        for name, node in sorted(lock_data.get("nodes", {}).items())
        if name != "root" and isinstance(node, dict) and isinstance(node.get("locked"), dict)
    }
    short_commit = expected_commit[:7]
    archive_name = (
        f"ffmpeg-kit-next-{expected_version}-{short_commit}-"
        "ios-arm64-videotoolbox.tar.gz"
    )
    xcode_info = command_output("xcodebuild", "-version")
    nix_info = command_output("nix", "--version")
    macos_version = command_output("sw_vers", "-productVersion")
    framework_notices = sorted(embedded_notice_files, key=lambda item: item["path"])
    manifest = {
        "schema_version": 1,
        "source": {
            "repository": "https://github.com/arthenica/ffmpeg-kit-next",
            "version": expected_version,
            "commit": expected_commit,
            "flake_lock_sha256": lock_sha,
            "source_license_file": "notices/FFmpegKitNext-LICENSE",
            "source_license_sha256": sha256_file(notices_dir / "FFmpegKitNext-LICENSE"),
            "upstream_source_manifest": "notices/upstream-SOURCE",
            "upstream_source_manifest_sha256": sha256_file(notices_dir / "upstream-SOURCE"),
            "flake_lock_inputs": flake_lock_inputs,
        },
        "build": {
            "command": os.environ["FFMPEG_BUILD_COMMAND"],
            "platform": "ios-device",
            "architectures": ["arm64"],
            "simulator_slice_included": False,
            "apple_videotoolbox_enabled": True,
            "gpl_enabled": False,
            "upstream_gpl_default_verified": 'GPL_ENABLED="no"' in (
                source_dir / "ios.sh"
            ).read_text(),
            "x264_enabled": False,
            "videotoolbox_config_values": videotoolbox_config_values,
            "gpl_config_values": config_values["CONFIG_GPL"],
            "x264_config_values": config_values["CONFIG_LIBX264_ENCODER"],
        },
        "environment": {
            "runner_label": os.environ.get("FFMPEG_RUNNER_LABEL", "unknown"),
            "runner_os": os.environ.get("RUNNER_OS", "unknown"),
            "runner_architecture": os.environ.get("RUNNER_ARCH", "unknown"),
            "runner_image_os": os.environ.get("ImageOS", "unknown"),
            "runner_image_version": os.environ.get("ImageVersion", "unknown"),
            "macos_version": macos_version,
            "xcode": xcode_info,
            "nix": nix_info,
        },
        "outputs": {
            "xcframework_bundle_directory": bundle_dir.name,
            "archive": archive_name,
            "framework_total_size_bytes": total_framework_bytes,
            "frameworks": framework_reports,
        },
        "build_diagnostics": {
            "warning_error_scan": "build-warnings.txt",
            "warning_error_scan_sha256": (
                sha256_file(output_dir / "build-warnings.txt")
                if (output_dir / "build-warnings.txt").is_file()
                else None
            ),
        },
        "embedded_notice_files": framework_notices,
        "android_poc_license_review": "android-poc-license-review.md",
        "verification": {
            "device_arm64_only": True,
            "h264_videotoolbox_registration_string_found": True,
            "x264_reference_found": False,
            "gpl_license_text_found": False,
            "runtime_encode_test_performed": False,
        },
    }

    manifest_path = output_dir / "source-license-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    verification_lines = [
        "RESULT: PASS",
        f"FFmpegKit Next: {expected_version} ({expected_commit})",
        f"flake.lock SHA-256: {lock_sha}",
        "flake.lock revisions: "
        + "; ".join(
            f"{name}={locked.get('rev', locked.get('narHash', 'no-revision-field'))}"
            for name, locked in flake_lock_inputs.items()
        ),
        f"Xcode: {xcode_info.replace(chr(10), '; ')}",
        f"macOS: {macos_version}",
        f"Runner image: {os.environ.get('ImageOS', 'unknown')} "
        f"{os.environ.get('ImageVersion', 'unknown')}",
        f"Runner label: {os.environ.get('FFMPEG_RUNNER_LABEL', 'unknown')}",
        "Target: iOS device arm64 only (no simulator)",
        "Flags: " + os.environ["FFMPEG_BUILD_COMMAND"],
        "h264_videotoolbox: registration string present in libavcodec",
        "GPL: disabled by upstream default; no enabled GPL config or GPL license text found",
        "x264: no enabled x264 config or x264 binary reference found",
        "Runtime encode test: not performed; device-only iOS binary was not executed",
        f"XCFramework total size: {total_framework_bytes} bytes",
        "XCFrameworks: " + ", ".join(sorted(actual_names)),
        "Warning/error scan: build-warnings.txt",
    ]
    (output_dir / "verification.txt").write_text("\n".join(verification_lines) + "\n")

    archive_path = output_dir / archive_name
    with tarfile.open(archive_path, "w:gz") as archive:
        for name in (
            "xcframeworks",
            "notices",
            "build-inputs",
            "source-license-manifest.json",
            "android-poc-license-review.md",
            "build-warnings.txt",
            "verification.txt",
        ):
            archive.add(output_dir / name, arcname=name, recursive=True)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            summary.write("\n## Verified iOS artifact\n\n")
            summary.write(f"- Archive: `{archive_name}`\n")
            summary.write(f"- XCFramework size: {total_framework_bytes} bytes\n")
            summary.write("- H.264 VideoToolbox registration string: present\n")
            summary.write("- GPL/x264: disabled/not found\n")
            summary.write("- Device-only arm64; no simulator slice\n")

    print("\n".join(verification_lines))
    print(f"Archive: {archive_path}")
    print(f"Archive SHA-256: {sha256_file(archive_path)}")
    print(f"Manifest: {manifest_path}")
    print(f"Archive size: {archive_path.stat().st_size} bytes")


if __name__ == "__main__":
    main()