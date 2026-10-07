# Pint Wars Memories — physical-iPhone native verification

## Scope and current decision

This is a verification hand-off, not a feature revision or release.
No Memories UI/video logic, backend, scoring, authentication, RevenueCat,
payments, database schema, or unrelated feature is to be changed.
Do not publish, submit to App Store Connect, run EAS Update, or use a simulator.

**Primary method:** generate the existing Expo/CNG iOS project, install its
CocoaPods dependencies, compile the `PintWars` scheme for `iphoneos` on macOS,
then install a signed **Debug development build on a physical iPhone**.
`expo-dev-client` is already installed; Expo Go cannot load the local module.

No application code/configuration change was found necessary by the checks
available in Replit. Actual Swift compilation and linking are still gates,
not assumed successes.

## Inspected configuration

| Item | Current value / finding |
|---|---|
| App / scheme / generated target | Pint Wars / `PintWars` |
| Bundle identifier | `com.pintwars.app` |
| Expo / React Native | `57.0.25` / `0.86.3` |
| Expo Modules Core / dev client | `57.0.19` / `57.0.19` |
| Generated iOS deployment target | `16.4` |
| Local pod minimum iOS | `16.4` |
| Pod Swift language mode | `5.0` |
| Local Expo module | `PintWarsMemoriesModule`; bridge name `PintWarsMemories` |
| Pod / Swift module | `PintWarsMemories` |
| Platforms | Apple only; no Android module configuration |
| FFmpegKit Next | `9.0.0`, source commit `5e51b2da4c3593c0f2f9b49f53eeb497d93e39d3` |
| XCFramework architecture | iOS device arm64 only; no simulator slice |
| Mach-O payload | Eight dynamic libraries, single-arm64 universal containers |
| Library install names | `@rpath/<name>.framework/<name>` |
| Binary deployment / SDK metadata | Minimum iOS `12.1.0`; SDK `26.5.0`. The app/module requirement remains iOS 16.4. |
| Artifact producer toolchain | Xcode `26.6`, macOS `26.6.2`, per original verification report |
| Codec build | VideoToolbox enabled; GPL and x264 disabled |
| Photos | `NSPhotoLibraryAddUsageDescription`; native `.addOnly` request; no Photos read permission |
| Privacy declaration | File-timestamp reason `C617.1`; no tracking declared by this local module |
| CNG | App-root `/ios/` and `/android/` ignored; local module native files are tracked |

Use Xcode 26.6 for the first reproducible verification attempt, matching the
artifact producer. This is a recommendation, not a claim that 26.6 is the
minimum supported Xcode. React Native's installed helper declares a minimum
of Xcode 16.1; that alone does not prove an older toolchain can consume this
artifact and the whole current dependency graph.

## Prerequisites outside this Replit workspace

1. A Mac capable of running the chosen full Xcode installation and iOS SDK.
   Accept its license and install its platform components.
2. CocoaPods available on the Mac; record its version. No CocoaPods install or
   Swift/Xcode build has been performed in this Linux workspace.
3. Node `24.13.0` and pnpm `10.26.1`, matching the tools used for this check.
   Install **both dependencies and devDependencies**: Expo/React Native and
   several runtime packages are currently declared in devDependencies.
4. A connected, unlocked, trusted physical arm64 iPhone running iOS 16.4 or newer,
   with Developer Mode enabled and sufficient free space. Record its iOS version.
5. An Apple signing team authorized to sign `com.pintwars.app`; select it in
   Xcode. Do not change the bundle identifier to bypass signing without approval.
   Local USB signing may use a Personal Team if Apple permits this identifier;
   cloud ad-hoc/EAS distribution requires the appropriate paid Apple Developer
   membership and registered device.
6. The checkout must include the eight tracked XCFramework trees and the whole
   pnpm workspace, not just the mobile folder. Workspace libraries are needed.
   **Mac installation caveat:** `pnpm-workspace.yaml` explicitly excludes Darwin
   optional binaries for esbuild, lightningcss, Tailwind Oxide, Rollup and ngrok.
   A fresh macOS dependency install has not been verified here. esbuild can
   attempt its upstream platform-binary download during installation, requiring
   network access; unrelated web tooling may still lack its Mac binaries.
   The native path uses Metro, not the web/Vite build, and the commands below
   deliberately use LAN rather than an ngrok tunnel.
   Do not disable the release-age security policy or remove these overrides
   speculatively. If installation fails, capture the exact package/platform
   error and resolve only the demonstrated native-build prerequisite.
7. Configure the existing public mobile runtime settings on the Mac through
   your approved local environment setup, without committing them:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` (the existing Debug/Test Store path)
   - `EXPO_PUBLIC_DOMAIN`: the existing API hostname **without** `https://`
     or a path. The app prepends `https://`; generated requests include `/api`.
   Do not put service-role keys, database passwords, RevenueCat secret keys,
   or other server credentials into the mobile app.
8. The iPhone must reach the existing HTTPS API and Supabase and the Mac's
   Metro server. The Replit dev API must remain running/reachable if used.
   Do not confuse the Expo preview hostname with the API hostname.
9. An authorized account that belongs to an **already completed** war with
   actual accessible proof photos and known final results. Prefer a test war
   with at least 16 photos, several players/pubs and late-war photos.
   Do not change production scores, delete proofs, or end a live war to create
   test conditions. If suitable data is absent, record that prerequisite as blocked.

Replit can prepare/check the source and can initiate an authorized hosted
macOS build through EAS. It cannot perform local Xcode/CocoaPods linking or the
hands-on iPhone tests inside this current Linux container. No cloud build was
started as part of this preparation.

## A. Exact clean-checkout preparation commands — Mac

Replace `/path/to/pint-wars-workspace` with the root of a fresh workspace checkout.
Set the existing runtime settings securely before starting Metro.

```bash
cd /path/to/pint-wars-workspace
node --version
pnpm --version
xcodebuild -version
xcrun --sdk iphoneos --show-sdk-version
pod --version

# Do not use --prod: the mobile project needs its devDependencies.
pnpm install --frozen-lockfile --prod=false
pnpm run typecheck:libs
pnpm --filter @workspace/pint-wars run verify:memories-native

cd artifacts/pint-wars
pnpm exec expo prebuild --platform ios --no-install
pod install --project-directory=ios
open ios/PintWars.xcworkspace
```

In Xcode, select target `PintWars` → Signing & Capabilities → the authorized
development team, and use automatic signing if your team permits it.
Select your **physical iPhone**, not an iOS Simulator.

The native verifier intentionally requires that generated app-root native
folders are absent. Run it **before prebuild**, as above. After prebuild in this
local checkout, use the generated-project/link checks below instead; the
verifier's CNG assertion would otherwise fail for an expected generated folder.

Prebuild generates native files locally; do not commit them. Do not use
`prebuild --clean` on a checkout containing native edits without backing them up
and obtaining approval. A fresh checkout avoids needing that destructive flag.

## B. Compile/link gate — no signing needed for this first gate

Run from `artifacts/pint-wars`, after `pod install`.
Evidence stays outside the repository. Do not reuse a prior result-bundle path.

```bash
EVIDENCE="$HOME/Desktop/pint-wars-native-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$EVIDENCE"
export EVIDENCE

xcodebuild -list -workspace ios/PintWars.xcworkspace
xcodebuild -showdestinations \
  -workspace ios/PintWars.xcworkspace -scheme PintWars

set -o pipefail
xcodebuild \
  -workspace ios/PintWars.xcworkspace \
  -scheme PintWars \
  -configuration Debug \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$EVIDENCE/DerivedData" \
  -resultBundlePath "$EVIDENCE/compile.xcresult" \
  CODE_SIGNING_ALLOWED=NO \
  build 2>&1 | tee "$EVIDENCE/compile.log"
```

**Pass:** command exits zero and reports BUILD SUCCEEDED, including compilation
of all four local Swift files and successful device linking.
**Fail:** any Swift/API/concurrency, missing module/header, unsupported
architecture, undefined symbol, framework-copy, or linker error.
Record the actual first error. Only then decide whether a narrowly scoped
compile-required change is needed.

An unsigned `.app` proves compilation/linking only. It is **not** the app to
install on the iPhone.

Inspect generated registration/integration:

```bash
grep -n 'PintWarsMemories' ios/Podfile.lock
find ios -name ExpoModulesProvider.swift -print
# Inspect the located provider: it must import/register PintWarsMemoriesModule.
grep -R -n 'PintWarsMemoriesModule' \
  "ios/Pods/Target Support Files" 2>/dev/null
find "ios/Pods/Target Support Files" \
  -name '*frameworks.sh' -o -name '*xcframeworks.sh'
```

The exact CocoaPods-generated script/provider placement can vary. Inspect the
located scripts to confirm all eight XCFrameworks are copied/embedded. Do not
manually add framework references to the generated project to mask an
autolinking/podspec issue.

## C. Confirm the eight native frameworks in the built app

```bash
APP="$EVIDENCE/DerivedData/Build/Products/Debug-iphoneos/PintWars.app"
test -d "$APP"

for name in ffmpegkit libavcodec libavdevice libavfilter \
            libavformat libavutil libswresample libswscale; do
  BIN="$APP/Frameworks/$name.framework/$name"
  test -f "$BIN" || { echo "MISSING: $BIN"; exit 1; }
  xcrun lipo -archs "$BIN"
  xcrun otool -D "$BIN"
  xcrun otool -L "$BIN"
done | tee "$EVIDENCE/frameworks.txt"

for BIN in "$APP/PintWars" "$APP/PintWars.debug.dylib"; do
  if test -f "$BIN"; then xcrun otool -L "$BIN"; fi
done | tee "$EVIDENCE/app-linkage.txt"
```

**Pass:** all eight dynamic framework binaries are present, contain arm64, have
the expected relocatable install names and valid dependency resolution.
Inspect the executable **and Debug dylib**, if present: modern Xcode can place
the application's linked code in `PintWars.debug.dylib`.
Presence of files alone does not prove linking or runtime loading.

The local `PintWarsMemories` pod uses static-framework packaging. Do not demand
that it appear as a ninth dynamically embedded framework.

## D. Signed build, installation and launch — physical iPhone

With signing selected in Xcode, first start Metro in a separate terminal:

```bash
cd /path/to/pint-wars-workspace/artifacts/pint-wars
pnpm exec expo start --dev-client --lan
```

Then run:

```bash
cd /path/to/pint-wars-workspace/artifacts/pint-wars
pnpm exec expo run:ios \
  --device \
  --scheme PintWars \
  --configuration Debug \
  --no-install \
  --no-bundler
```

Choose the connected **physical iPhone** in the prompt.
This builds a signed Debug binary, installs it and launches it.
If the development launcher appears, open the Mac's Metro project.
Do not select an existing Expo Go installation or an older native binary.

For a signed Xcode build with a deterministic evidence output directory,
run the following after the team has been configured:

```bash
set -o pipefail
xcodebuild \
  -workspace ios/PintWars.xcworkspace \
  -scheme PintWars \
  -configuration Debug \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$EVIDENCE/SignedDerivedData" \
  -resultBundlePath "$EVIDENCE/signed.xcresult" \
  -allowProvisioningUpdates \
  build 2>&1 | tee "$EVIDENCE/signed.log"

SIGNED_APP="$EVIDENCE/SignedDerivedData/Build/Products/Debug-iphoneos/PintWars.app"
codesign --verify --deep --strict --verbose=2 "$SIGNED_APP"
for name in ffmpegkit libavcodec libavdevice libavfilter \
            libavformat libavutil libswresample libswscale; do
  codesign --verify --strict --verbose=2 \
    "$SIGNED_APP/Frameworks/$name.framework"
done

xcrun devicectl list devices
```

To install that exact signed evidence build, replace `DEVICE_IDENTIFIER` with
the connected physical device identifier shown by devicectl:

```bash
xcrun devicectl device install app \
  --device DEVICE_IDENTIFIER "$SIGNED_APP"
xcrun devicectl device process launch \
  --device DEVICE_IDENTIFIER com.pintwars.app
```

**Pass:** signed app and all frameworks validate, the app launches on the actual
iPhone without dyld/Library not loaded failures, and the Memories screen starts
generation instead of reporting a missing native exporter.
Record Xcode/device console output without session tokens or private URLs.

## E. Real-device acceptance matrix

Use `checklist.csv` for PASS / FAIL / BLOCKED / NOT RUN and evidence references.
No row below has already passed native testing.

### 1. Generate a real MP4

- Sign in normally as the authorized member; open the known completed war.
- Enter Memories and allow generation to complete while foregrounded/unlocked.
- Check progress reflects actual staging/encoding; Save/Share are not enabled
  before a real film exists.
- Compare photos, player/pub captions, winner, ties if present, and scores with
  the real war. Check late-war coverage/variety and absence of duplicate photos.
- Expect 720×1280 portrait, 30fps, approximately 30 seconds: two-second opening,
  25-second photo sequence and three-second final real result.
- Transitions should be smooth fades through navy. AAC is intentionally silent.

### 2. Play, seek, pause and replay

- Play and pause; timeline should follow AVPlayer, not a JS slideshow timer.
- Seek forward/backward, including near 0, the 2-second first-photo boundary,
  mid-film, 27-second final-result boundary and the end.
- Tap several selected thumbnails and verify the matching moment/time.
- Complete playback and replay. Repeat after Save and after dismissing Share.
- No frozen black frames, error state, incorrect duration or UI lock.

### 3. Photos permission and saving

- Use a dedicated test device/account. A fresh installation gives the clean
  permission state; uninstalling destroys that installation's session/temp data.
- First Save tap: expect **add-only Photos** authorization, not library read
  or microphone permission.
- Allow: the actual video appears and plays in Photos; success notice appears
  only after Photos completion.
- Separate clean-permission run: deny. Expect denial/error and Settings action,
  no claimed save. Allow in Settings, return, and retry without regenerating.
- Where available, test restricted/managed access and Photos/storage failure
  on a disposable test device. Do not fill or endanger a personal device.
  If a failure condition cannot be induced safely, mark it BLOCKED/NOT RUN,
  not PASS from unit tests alone.

### 4. Native MP4 sharing and permissions

- Tap Share: an iOS activity sheet appears with the actual local `.mp4`.
- Share to Files or AirDrop to the Mac; recipient can play the file offline.
- Dismiss the sheet: no false success and no error; controls become usable.
- Complete a share: success is reported only when iOS reports completion.
- Test an available restricted/failed destination and confirm truthful failure
  if the OS reports one. A target cancelled by its user may simply report
  dismissal, not a share error.
- **There is no app-wide “share permission” to request.** Target services may
  have their own authorization, device restrictions or connectivity prompts.
  Sharing must not request Photos add-only/read permission merely to open the sheet.
- If no safe/reproducible native share-error condition is available, mark that
  case BLOCKED/NOT RUN and retain the passing unit-test result separately.

### 5. Prove MP4 format and actual-file delivery

Save the shared file locally as `Pint-War-Memories.mp4`. On the Mac, install
ffprobe separately if it is not already available, then:

```bash
ffprobe -v error \
  -show_entries format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,nb_frames \
  -of json "Pint-War-Memories.mp4" > "$EVIDENCE/mp4.json"
shasum -a 256 "Pint-War-Memories.mp4" > "$EVIDENCE/shared-file.sha256"
```

Expect H.264 video, AAC audio, 720×1280, 30/1 fps and about 30 seconds.
The frame plan is 900 frames; confirm actual frame count if ffprobe reports it
or use `-count_frames` and `-show_entries stream=nb_read_frames`.
Playback without network and a recipient-visible video file prove actual-file
sharing, unlike merely seeing a URL in a share sheet.

If comparing app output with shared output, compare SHA-256 for the original
files. Photos or a destination may transcode exports; use an **unmodified
original** export where available and distinguish transcode behavior from
the original app's output.

### 6. Successful cleanup — retention while needed is correct

The job's directory is:

```text
<application-data-container>/tmp/pint-war-memories/<job UUID>/
```

- While the completed film is still on screen: `Pint-War-Memories.mp4` and
  selected `photo-*.jpg` thumbnails may remain intentionally.
- `segment-*.mp4`, `opening.jpg`, `closing.jpg` and `concat.txt` must have been
  removed after generation.
- After leaving Memories, once AVPlayer and native Photos/share consumers
  finish, the released job directory and its remaining MP4/JPEGs should disappear.
- Native operations must retain the file if the screen is left while saving or
  sharing. After the operation and all consumers finish, deletion must follow.
- Generate again and confirm no accumulation of released jobs.

Use Xcode → Window → Devices and Simulators → select the **physical iPhone** →
installed Pint Wars app → **Download Container** to inspect snapshots, where
that operation is supported for the development build.
Inspect `.xcappdata/AppData/tmp/pint-war-memories`.
Unlock the device because these files use complete file protection.

Alternative for live checks: pause briefly in Xcode's debugger and use these
read-only Swift expressions, then resume:

```text
expression -l Swift -- import Foundation
expression -l Swift -O -- FileManager.default.temporaryDirectory.appendingPathComponent("pint-war-memories").path
expression -l Swift -O -- try? FileManager.default.subpathsOfDirectory(atPath: FileManager.default.temporaryDirectory.appendingPathComponent("pint-war-memories").path)
```

Record job/file names and counts, not private photo bytes.
Do not stop/kill the app as a substitute for navigating away: a killed process
cannot run ordinary cleanup callbacks.
Do not upload the full container; it can contain authentication sessions and
private photos.

### 7. Failure, cancellation and back-navigation cleanup

- Cancel once during private-photo staging, then once during native encoding.
- Repeat with back navigation in both stages.
- Switch off networking while a fresh run is still downloading photos.
  Expect an explicit failure, no fake ready film, and a working retry after
  restoring network. Disabling networking after staging is complete may not
  fail a local encode.
- After each case and after in-flight native consumer holds drain, inspect
  the affected job directory: partial files must be removed.
- Retry and complete a new generation, without reusing a cancelled output.
- A decode/encoder failure requires a naturally encountered failure or a
  separately authorized test condition. Do not delete real proof photos,
  modify the encoder or introduce fault-injection code for this hand-off.

Process-termination leftovers are a separate case: directories from a killed
process are pruned on the next generation **after 24 hours**, not immediately
on every launch. Test elapsed-time recovery on a dedicated device if needed;
do not falsify the device clock and interfere with TLS/authentication.

## F. Exact source/configuration files involved

Paths below are relative to the workspace root.

### Build inputs (unchanged)

- `artifacts/pint-wars/app.json`: identity, plugins, Photos add-only usage text.
- `artifacts/pint-wars/package.json`: Expo/dev-client/runtime packages and checks.
- `artifacts/pint-wars/eas.json`: existing development/preview/production profiles.
- `artifacts/pint-wars/.gitignore`: CNG ignore boundaries.
- `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `package.json`, `.npmrc`:
  workspace/dependency resolution; retain the lockfile, no opportunistic upgrades.
- `artifacts/pint-wars/modules/pint-wars-memories/package.json`
- `artifacts/pint-wars/modules/pint-wars-memories/expo-module.config.json`
- `artifacts/pint-wars/modules/pint-wars-memories/ios/PintWarsMemories.podspec`
- `artifacts/pint-wars/modules/pint-wars-memories/ios/PrivacyInfo.xcprivacy`
- `artifacts/pint-wars/modules/pint-wars-memories/ios/MemoriesJobStore.swift`
- `artifacts/pint-wars/modules/pint-wars-memories/ios/MemoriesRenderer.swift`
- `artifacts/pint-wars/modules/pint-wars-memories/ios/MemoriesPlayerView.swift`
- `artifacts/pint-wars/modules/pint-wars-memories/ios/PintWarsMemoriesModule.swift`
- `artifacts/pint-wars/modules/pint-wars-memories/ios/Frameworks/`:
  `ffmpegkit`, `libavcodec`, `libavdevice`, `libavfilter`, `libavformat`,
  `libavutil`, `libswresample`, `libswscale`, each as its own `.xcframework`.
- `artifacts/pint-wars/modules/pint-wars-memories/ios/Notices/`:
  original licenses, source manifest and verification report.
- `artifacts/pint-wars/scripts/verify-memories-native.py`

`native-file-inventory.csv` enumerates the native package's individual files
and the related configuration/source references.

### Existing runtime references (inspect only; do not change)

- `artifacts/pint-wars/app/_layout.tsx`: existing HTTPS API base and auth token getter.
- `artifacts/pint-wars/src/lib/supabase.ts`: existing client configuration.
- `artifacts/pint-wars/src/providers/RevenueCatProvider.tsx`: existing Debug/Test Store path.
- `artifacts/pint-wars/app/war/[leagueId]/memories.tsx`
- `artifacts/pint-wars/src/lib/memories-native.ts`
- `artifacts/pint-wars/src/lib/memories-video-pipeline.ts`
- `artifacts/pint-wars/src/lib/memories-actions.ts`
- `artifacts/pint-wars/src/components/MemoriesVideoPlayer.tsx`
- `artifacts/pint-wars/src/components/PintWarMemoriesPresentation.tsx`

### Generated on the Mac only (do not commit)

- `artifacts/pint-wars/ios/Podfile` and `Podfile.properties.json`
- `artifacts/pint-wars/ios/Podfile.lock`
- `artifacts/pint-wars/ios/PintWars.xcodeproj`
- `artifacts/pint-wars/ios/PintWars.xcworkspace` after CocoaPods installation
- `artifacts/pint-wars/ios/PintWars/Info.plist`
- `artifacts/pint-wars/ios/Pods/` including the module provider and copy/embed scripts
- DerivedData, `.app`, `.xcresult` and signing evidence in the external evidence folder

## G. EAS alternative — not started, not required for the primary method

The existing `development` profile has `developmentClient: true`,
`distribution: internal`, and no simulator flag. If a cloud build is later
authorized and EAS CLI/signing/environment setup is complete:

```bash
cd /path/to/pint-wars-workspace/artifacts/pint-wars
eas device:create
eas build --platform ios --profile development
```

These are build/registration commands, not publication. They were not run.
EAS executes the iOS build on hosted macOS; installation/runtime tests still
need the physical iPhone. Do not use the production/store profile for this pass.

**Inspection finding before any EAS/OTA action:** the current
`extra.eas.projectId` and `updates.url` contain different project UUIDs.
Do not assume their relationship is correct or change it as part of this
verification-only request. The temporary local prebuild passed; use the local
Debug/Metro path above, which does not publish an OTA update. Resolve EAS
project/channel/environment ownership separately before relying on cloud/OTA.

## H. Evidence and completion rule

Record:

- Checkout revision, app build/version, device model/iOS, Xcode/SDK, CocoaPods,
  Node and pnpm versions; authorized test-war identifier stored privately.
- Unsigned compile `.xcresult`/log, signed build/signature evidence, generated
  module registration and all eight framework load dependencies.
- Actual MP4 ffprobe metadata and shared-file checksum.
- Permission allow/deny/retry, sheet completion/dismissal and failure outcomes.
- Temporary-directory snapshots/counts at ready, after leaving, after cancel
  and after a failed run, including deferred consumer-held cleanup.

Every required acceptance row must be PASS with evidence before declaring the feature
device-verified. The optional killed-process recovery row remains a separately
reported result; do not claim it was tested if it was not. FAIL, BLOCKED and NOT RUN remain explicit. Unit/static checks
do not substitute for native checks. No report should say “linked correctly”
until Xcode linking and real-device dyld loading both pass.

The companion `non-device-results.json` records only checks actually run here.
The application was not changed, no native/cloud build was started, and
nothing was published.

## References

- Expo local native builds: https://docs.expo.dev/guides/local-app-development/
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Replit native mobile apps: https://docs.replit.com/features/artifact-types/building-mobile-apps
- Replit phone testing: https://docs.replit.com/features/workspace-tools/mobile-preview-testing
