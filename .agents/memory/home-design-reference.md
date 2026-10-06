---
name: Pint Wars design reference
description: Approved Pint Wars screen presentation is screen-scoped and differs from the legacy application palette.
---

For reference-based Home and Wars design work, the approved mobile mock-ups are the primary visual reference, not the existing teal/orange application styling. Recreate their composition rather than reinterpret it: dark/navy surfaces, gold/yellow accents, photographic cards, compact proportions, and the existing Home / Wars / Map / Passport / Profile order.

**Why:** The user explicitly requested that the result look like the same Pint Wars app shown in the image, and asked for active-war and no-active-war visual states with realistic sample content.

**How to apply:** Use the approved canvas states when evaluating fidelity. The user approved integrating both Home states and, separately, the Wars screen into the app, with real league data and existing five-tab navigation. Each integration remains presentation-only: preserve authentication, scoring, RevenueCat, notifications, backend behavior, league mechanics, and refresh behavior. Do not restyle unrelated screens without a request.

The Active Pint War design should feel like a live, social competition, not a sparse leaderboard page. Preserve the approved photographic hero and navy/gold direction while making war status, all-player standings, the highlighted current player, a strong Log a Pint action, and recent activity visible together.

**Why:** The user approved the visual direction but explicitly requested stronger live status, action, and social activity rather than a standalone leaderboard feel.

**How to apply:** Keep Activity/Details and Invite/Manage compact and secondary. The user separately approved implementing the active-war screen with real application data. Preserve the current camera/photo-proof Log a Pint flow and full War Activity Feed, including protected photos. Scope that integration to active-war presentation; do not change backend, scoring, authentication, RevenueCat, league mechanics, database schema, completed-war presentation, or unrelated screens.

The approved Pub Passport integration is presentation-only with live personal data and existing Map and pub-detail/review flows. Do not add standalone pint logging unless separately requested. Do not attach mock pub photos to real pub identities as though they are authentic: when actual photo data is unavailable, label decorative photography as illustrative.

**Why:** The user required real Passport data and preservation of existing functionality while excluding backend/schema, scoring, authentication, RevenueCat, and unrelated-screen changes. Illustrative imagery preserves the photographic layout without fabricating pub-specific information.

**How to apply:** Keep Passport visual changes screen-scoped. Personal review totals and filters should represent the player's reviews, distinct from a pub's community review total/rating.

Do not show a Passport footer explaining Google place identity, legacy location-only visits, or stored-coordinate grouping.

**Why:** The user said this is implementation detail and should not be visible in the consumer-facing UI.

**How to apply:** Omit that explanatory footer; preserve the actual Passport data, location cards, navigation, and remaining consumer-facing content.

The approved Profile integration must use real personal data, never the mockup's identity or figures. Partial statistics must be labelled with their actual scope, not presented as lifetime totals.

**Why:** The user explicitly prohibited fabricated statistics and new backend/statistics infrastructure solely to reproduce the design.

**How to apply:** Keep Profile changes presentation-only and preserve editing, history, privacy, support, account deletion and sign-out. Use available existing data or omit unsupported metrics. Achievements stays “Coming Soon.” Do not change scoring, authentication, RevenueCat, schema or unrelated screens.

The Map / Nearby Pubs canvas reference is approved for the real app. Its illustrated streets and sample venues are design references, not production data. Preserve live current-location handling, Google Places discovery, real markers, distances, pub-detail navigation, and the existing five tabs.

**Why:** The user explicitly approved the visual structure while requiring real application data and prohibiting backend, scoring, authentication, RevenueCat, database-schema, and unrelated-screen changes.

**How to apply:** Reproduce the navy/gold composition with the actual native map, rather than substituting fictional streets or sample pub records. Use existing community-review data and Passport visit records for filters. Apply the same truthful-image rule as Passport: decorative photography must be labelled illustrative when venue photos are unavailable.
