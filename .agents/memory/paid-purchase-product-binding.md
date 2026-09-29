---
name: RevenueCat selected product checkout
description: Keep one-time Pint War checkout bound to the selected capacity while preserving server-side purchase verification.
---

For Pint Wars one-time league purchases, buy the RevenueCat package that matches the selected capacity directly rather than showing an offering-wide paywall containing every capacity. Compare the returned product ID with the selection before league creation, have the API reject mismatches, and continue verifying the transaction against the stored RevenueCat webhook record on the server.

For immediate post-purchase confirmation, pass RevenueCat's product display price to the invite screen for presentation only. Load the league name, capacity, duration, end time, and active-player count from the existing league dashboard query instead of adding purchase display fields to the database.

**Why:** An offering-wide paywall lets a user choose a different capacity than the one confirmed in the league setup. Client checks prevent accidental creation, but only server-side checks and webhook-backed verification are authoritative.

**How to apply:** When modifying paid league checkout or adding RevenueCat products, keep the selected SKU explicit through the client request and reject mismatches before any league-creation operation. Do not replace webhook-record verification with client-provided transaction data. For confirmation UI, trust the fetched league record for league details and treat passed price data as display-only.