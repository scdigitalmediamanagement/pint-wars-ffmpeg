# Pint Wars — Current Project Handoff / Continuity

Updated: 2026-10-07
Repository: scdigitalmediamanagement/pint-wars-ffmpeg
Active development branch: feature/memories-ffmpeg-ios

## HOW TO WORK WITH THIS PROJECT

The user requires strict continuity and exact execution:
- Work one concrete action at a time.
- Wait for the user's result/screenshot before giving the next action.
- Triple-check commands and assumptions before issuing them.
- Never repeat a troubleshooting loop that has already been completed.
- Do not randomly add features, change product direction, rewrite working infrastructure, or touch unrelated functionality.
- Preserve all locked business rules and existing working backend/purchase/scoring foundations.
- For UI work: Design first -> approve visual -> Build -> verify real screen.
- For native work: inspect first -> make the smallest demonstrated change -> verify.
- The user wants decisive, copy/paste-ready instructions and honest product critique.
- Do not publish/submit/deploy unless explicitly instructed.

## PRODUCT DIRECTION — LOCKED

Pint Wars is a social competitive league/event app.
Core loop:
Create -> Invite mates -> Compete -> Log pints -> Climb leaderboard -> Finish -> Memories.

A Pint War can run 1–30 days. The host chooses duration.
Current paid capacities/prices:
- 6 players: £2.99
- 10 players: £3.99
- 14 players: £4.99
- 16 players: £5.99
Free trial:
- 4 players
- 10 days
- one free trial per account

Price depends on player capacity, not duration.
Paid purchase is one-time, not a subscription.
Paid leagues can be extended before they finish; extension is a product requirement but is not currently implemented.

Locked current scoring:
- each accepted pint = +1 point
- qualifying pub review = +1 point once per user/pub
- retired NEW_PUB +2 scoring is not used for future scoring
- score events are server-authoritative and historical values remain preserved
- review editing cannot farm additional points

Product positioning:
- The Pint War / competitive league mechanic is the primary moat.
- Pub Passport is the long-term retention layer.
- Map / pub discovery supports discovery and passport growth.
- Avoid positioning Pint Wars as a generic drinking game or a weekend-only app.
- Future growth can include national/EU/world rankings, but only after sufficient real league density.

## APP / APPLE IDENTIFIERS

App: Pint Wars
Bundle ID: com.pintwars.app
App Store Connect app ID: 6816400758
Apple Team ID: YR5YPCG26B
EAS project full name: @scdigitalmediamanagement/pint-wars
EAS project ID: a910593d-ce8c-4321-9393-91befcc2f287
RevenueCat project: cf2aea4e
RevenueCat app: app9b89417bb9

Apple IAPs:
- pint_war_6_players_v2
- pint_war_10_players
- pint_war_14_players
- pint_war_16_players

Apple agreement/banking prerequisites previously confirmed:
- Paid Apps Agreement active
- Free Apps Agreement active
- UK GBP bank account active
- U.S. Certificate of Foreign Status active
- W-8BEN active
- DSA in review
- Sandbox Apple account configured

RevenueCat:
- all four Apple products imported
- default offering contains all four products
- App Store Connect API credentials valid
- IAP key valid
- TestFlight product visibility previously confirmed
- end-to-end sandbox purchase -> verification -> league creation still needs a successful proof run

## APP STORE SUBMISSION STATUS

Pint Wars 1.0 has been submitted to Apple App Review.
The submission included the 1.0 app build and four IAPs.
Apple review may take up to 48 hours.
Target public launch: Friday 2026-10-16.
Pre-order may be used after approval if chosen.
Do not resubmit or publish changes without explicit instruction.

Store metadata already completed:
- Name: Pint Wars
- Primary language: English (U.K.)
- Category: Games / Casual
- Content Rights: Yes, necessary third-party rights
- Age rating: 18+
- Copyright: 2026 SC Digital Media Management
- Support URL: https://github.com/scdigitalmediamanagement/pint-wars-ffmpeg/issues
- Privacy policy URL: https://github.com/scdigitalmediamanagement/pint-wars-ffmpeg/blob/main/PRIVACY_POLICY.md
- App Privacy published with Name, Email, User ID, Photos/Videos, Other User Content, Purchase History, Precise Location as previously declared.

## REDESIGN PASS — COMPLETED AND LOCKED

UI/UX was changed using Design Canvas mockups first, then applied to the real app.

Approved/implemented and visually verified:
1. Home
2. Pint Wars list
3. Active Pint War
4. Map / Nearby Pubs
5. Pub Passport
6. Profile
7. Create a Pint War
8. Confirm your Pint War
9. Sign In
10. Create Account
11. Forgot Password
12. Pint War Memories design (design approved; app implementation now exists)

Important visual direction:
- dark navy/black
- gold/yellow accents
- strong white typography
- premium iOS proportions
- visual, social, competitive feel
- photography-led hero cards where appropriate
- existing five-tab navigation preserved

## MAP / GOOGLE PLACES PHOTO WORK

The Map/Nearby Pubs design was implemented.
Then authentic Google Places venue photos were added through the existing server-side Places API flow.

Photo implementation:
- Google credentials remain server-side
- response includes photo references, contributor credits, Google Maps links
- authenticated/rate-limited photo resolution endpoint
- non-cacheable responses
- Expo Image cachePolicy none
- honest no-photo fallback
- photo credits control and Google Maps link
- nested-button accessibility issue was fixed by making row noninteractive and making independent controls siblings
- focused tests and full typecheck passed

Important limitation:
- Browser fixture used an Unsplash image to verify display layout, not a live Google Places photo.
- Physical iPhone verification of live Google photo delivery remains a final device QA task.
- User location is disabled in current environment, so native nearby-map testing is not available here.

## MEMORIES — CURRENT TECHNICAL STATE

Memories is now code-complete at feature level, but NOT yet native-device verified.

Existing/implemented:
- existing intelligent photo-selection logic
- late-war weighting and player/pub variety
- protected private Supabase proof-photo access
- local filesystem staging for selected images
- real ~30-second portrait H.264/AAC MP4 export
- smooth transitions
- real final result/winner section
- native playback, seeking and replay
- Photos add-only permission flow
- Save Video
- native iOS Share Sheet with actual MP4 file
- generation progress
- cancellation
- failure/retry
- temporary-file cleanup
- approved Memories UI

Existing local iOS module:
- module path: artifacts/pint-wars/modules/pint-wars-memories/
- module: PintWarsMemoriesModule
- Swift module/pod: PintWarsMemories
- existing FFmpegKit Next iOS XCFrameworks:
  ffmpegkit
  libavcodec
  libavdevice
  libavfilter
  libavformat
  libavutil
  libswresample
  libswscale
- artifact is iOS arm64 device only; no simulator slice
- minimum app/module iOS: 16.4
- first recommended verification toolchain: Xcode 26.6 / matching producer environment

Memories implementation source references:
- artifacts/pint-wars/app/war/[leagueId]/memories.tsx
- artifacts/pint-wars/src/lib/memories-native.ts
- artifacts/pint-wars/src/lib/memories-video-pipeline.ts
- artifacts/pint-wars/src/lib/memories-actions.ts
- artifacts/pint-wars/src/components/MemoriesVideoPlayer.tsx
- artifacts/pint-wars/src/components/PintWarMemoriesPresentation.tsx
- local module Swift files under modules/pint-wars-memories/ios/

Pre-device verification already passed:
- full workspace TypeScript
- 55 relevant tests
- git diff --check
- framework checksums / architecture / install-name checks
- native autolinking checks
- temporary iOS CNG prebuild
- iOS JS bundle export

Still required for Memories:
- Xcode compile/link on macOS
- signed Debug iOS build
- actual iPhone installation
- real 30-second generation
- playback / pause / seek / replay
- Save Video to Photos
- iOS Share Sheet with actual MP4
- permission allow/deny/retry behavior
- successful cleanup
- cancellation/failure cleanup
- ffprobe validation of exported MP4
- physical-device dyld/runtime loading verification

The physical-device acceptance package uploaded on 2026-10-07 is the authoritative native checklist.

## EAS / PHYSICAL IPHONE STATUS

The project is authenticated to EAS from the Replit Shell:
scdigitalmediamanagement (authenticated using EXPO_TOKEN)

Verified:
- EAS project info: @scdigitalmediamanagement/pint-wars
- EAS project ID: a910593d-ce8c-4321-9393-91befcc2f287
- physical iPhone is already registered with Apple Team YR5YPCG26B
- registered device exists in EAS
- EAS development environment contains:
  EXPO_PUBLIC_REVENUECAT_TEST_API_KEY (masked in output)
  EXPO_PUBLIC_SUPABASE_ANON_KEY (masked in output)
  EXPO_PUBLIC_SUPABASE_URL=https://olryipikrvhmxvqlmoxo.supabase.co

CRITICAL CURRENT BLOCKER:
- EAS development environment did NOT list EXPO_PUBLIC_DOMAIN.
- Replit shell command printf '%s\n' "$EXPO_PUBLIC_DOMAIN" returned blank.
- An accidental bare command EXPO_PUBLIC_DOMAIN produced command not found; this was only a shell typo, not an app issue.
- We must locate the existing API hostname from the current project configuration/Replit environment rather than invent a value.
- The uploaded native verification guide says EXPO_PUBLIC_DOMAIN is required by the mobile runtime and must contain the existing API hostname without https://.
- Do not change EAS projectId.
- A separate known mismatch exists between app extra.eas.projectId and updates.url project UUID. Leave it untouched unless a concrete build problem proves it needs correction.

Critical EAS workflow caveat:
- Replit documentation says EAS CLI/EAS Build is not a supported Replit build path.
- EAS cloud iOS builds themselves run on hosted macOS infrastructure, but using that from this workflow must be validated before starting a build.
- Local Xcode/CocoaPods build is impossible on the user's Windows PC.
- User has a physical iPhone but no Mac.
- Therefore the intended route is external EAS cloud iOS development build if operational prerequisites can be satisfied.

## NEXT IMMEDIATE TASK

The very next job is:
1. Resolve the missing EAS development variable EXPO_PUBLIC_DOMAIN by locating the existing API hostname from the current project/Replit configuration.
2. Verify EAS development environment completeness.
3. Inspect whether the external EAS cloud development build path is operational.
4. Only then start the physical-iPhone Debug development build.
5. Install on the already-registered iPhone.
6. Run the complete Memories native acceptance checklist.

After Memories is device-verified, return to the broader product roadmap:
- standalone Passport pint logging
- Passport new-area recommendations refinement if still needed
- push notifications
- league extension
- Rematch
- richer League History
- Achievements / Records / Statistics
- rankings only after enough network density
- UGC moderation hardening (blocking/filtering/reporting/contact) before wide public scale
- final TestFlight QA and launch readiness

## IMPORTANT PRODUCT / ENGINEERING PRIORITY

Do not add unnecessary features while Memories/native verification and launch-critical gaps remain.

Current priority order:
P0:
1. Memories native verification
2. purchase end-to-end sandbox proof
3. final launch QA/compliance

P1:
4. Passport standalone pint logging
5. Push notifications
6. League extension
7. Rematch / richer history
8. UGC moderation hardening

P2:
9. Achievements / Records / Statistics
10. national/EU/world rankings
11. broader social/growth expansion

## AUTHORITATIVE SOURCE FILES

Use these project references for continuity:
- .agents/memory/MEMORY.md
- .agents/memory/home-design-reference.md
- .agents/memory/memories-photo-selection.md
- .agents/memory/ffmpeg-kit-next-evaluation.md
- .agents/memory/paid-purchase-product-binding.md
- the uploaded native verification package / checklist
- Pint_Wars_Master_Build_Specification_V1.docx
- Pint Wars App UI Montage.png
