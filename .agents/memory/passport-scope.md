---
name: Independent Pub Passport
description: Product requirements separating Passport visits and reviews from Pint War scoring.
---

Passport must work without an active Pint War: signed-in users can select a pub, log a visit, optionally review it, see their visited pubs and reviews, and read other users' pub reviews.

Passport activity must NOT award Pint War points. Existing Pint War logging and scoring must continue working exactly as they do now. Reuse existing pub/visit/review tables and functions wherever suitable; do not redesign the app or change RevenueCat, Memories, or other working features.

**Why:** The user explicitly specified these product requirements.

**How to apply:** Keep Passport-only visit and review submission separate from scored Pint War submissions, even when the user happens to belong to an active war.
