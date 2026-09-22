---
name: Account deletion concurrency
description: Locking rule for preventing new account activity while de-identification runs.
---

User-owned database write guards should lock the profile row before checking the persistent de-identification marker. The account-deletion transaction must acquire existing league, membership, and invite locks before acquiring that profile lock, matching the established league-write paths.

**Why:** Checking the marker without a row lock permits a write that began before de-identification to commit after it. Acquiring the profile first can deadlock with paths that lock a league before inserting a user-owned row.

**How to apply:** Preserve the league-first/profile-second order when extending deletion or league-write paths. Keep Storage/Auth cleanup idempotent and server-side after the database marker commits.