"""Static integrity/architecture checks. This does not compile or execute iOS."""
import hashlib
import json
import plistlib
import subprocess
from pathlib import Path

app = Path(__file__).resolve().parents[1]
module = app / "modules/pint-wars-memories"
ios = module / "ios"
expected = {
    "ffmpegkit", "libavcodec", "libavdevice", "libavfilter",
    "libavformat", "libavutil", "libswresample", "libswscale",
}
config = json.loads((module / "expo-module.config.json").read_text())
assert config["platforms"] == ["apple"]
assert config["apple"]["modules"] == ["PintWarsMemoriesModule"]
assert "android" not in config
assert not (app / "ios").exists() and not (app / "android").exists(), "Keep generated native directories out of the app source."
for maintained in [
    ios / "MemoriesRenderer.swift",
    ios / "Frameworks/ffmpegkit.xcframework/ios-arm64/ffmpegkit.framework/ffmpegkit",
]:
    result = subprocess.run(["git", "check-ignore", str(maintained)], cwd=app, capture_output=True)
    assert result.returncode == 1, "Local native module source/binaries must not be ignored."
manifest = json.loads((ios / "Notices/source-license-manifest.json").read_text())
assert manifest["source"]["commit"] == "5e51b2da4c3593c0f2f9b49f53eeb497d93e39d3"
assert manifest["build"]["gpl_enabled"] is False
assert manifest["build"]["x264_enabled"] is False
assert manifest["build"]["apple_videotoolbox_enabled"] is True
frameworks = list((ios / "Frameworks").glob("*.xcframework"))
assert {path.stem for path in frameworks} == expected
entries = {entry["name"]: entry for entry in manifest["outputs"]["frameworks"]}
for framework in frameworks:
    with (framework / "Info.plist").open("rb") as stream:
        info = plistlib.load(stream)
    assert len(info["AvailableLibraries"]) == 1
    library = info["AvailableLibraries"][0]
    assert library["SupportedPlatform"] == "ios"
    assert library["SupportedArchitectures"] == ["arm64"]
    assert "SupportedPlatformVariant" not in library
    entry = entries[framework.name]
    binary = framework / entry["binary_relative_path"]
    assert hashlib.sha256(binary.read_bytes()).hexdigest() == entry["binary_sha256"], framework
    assert (binary.parent / "LICENSE").exists(), framework
    print(f"PASS: {framework.name}: device-only arm64, verified binary checksum, license")
codec = (ios / "Frameworks/libavcodec.xcframework/ios-arm64/libavcodec.framework/libavcodec").read_bytes()
assert b"h264_videotoolbox" in codec
assert b"libx264" not in codec
pod = (ios / "PintWarsMemories.podspec").read_text()
assert "s.vendored_frameworks = 'Frameworks/*.xcframework'" in pod
assert "s.dependency 'ExpoModulesCore'" in pod
assert ":ios => '16.4'" in pod
assert "android" not in pod.lower()
expo = json.loads((app / "app.json").read_text())["expo"]
assert expo["ios"]["infoPlist"]["NSPhotoLibraryAddUsageDescription"]
assert "NSPhotoLibraryUsageDescription" not in expo["ios"]["infoPlist"], "Request add-only, not photo-library read access."
with (ios / "PrivacyInfo.xcprivacy").open("rb") as stream:
    privacy = plistlib.load(stream)
assert privacy["NSPrivacyTracking"] is False
assert privacy["NSPrivacyAccessedAPITypes"][0]["NSPrivacyAccessedAPITypeReasons"] == ["C617.1"]
native = (ios / "PintWarsMemoriesModule.swift").read_text()
assert "requestAuthorization(for: .addOnly)" in native
assert "creationRequestForAssetFromVideo(atFileURL: url)" in native
assert "UIActivityViewController(activityItems: [url]" in native
assert 'promise.reject("PHOTOS_PERMISSION_DENIED"' in native
assert 'promise.reject("SAVE_FAILED"' in native and 'promise.reject("SHARE_FAILED"' in native
renderer = (ios / "MemoriesRenderer.swift").read_text()
assert '"h264_videotoolbox"' in renderer and '"aac"' in renderer and '"+faststart"' in renderer
assert "withArgumentsAsync: arguments" in renderer, "Use argument arrays, never a shell command."
assert "imageURL($0, job: job)" in renderer
store = (ios / "MemoriesJobStore.swift").read_text()
assert "job.released && job.holds == 0" in store
assert "FFmpegKit.cancel" in store
assert "FileProtectionType.complete" in store
print("PASS: local Apple-only module, CNG layout, pinned LGPL build, protected job paths")
print("PASS: maintained native module source and framework binary are not git-ignored")
print("PASS: add-only Photos permission, local-file share, cleanup/cancellation contracts")
print("LIMITATION: Swift compilation, CocoaPods linking/embedding and real-device runtime require macOS/iPhone.")
