---
name: Deletion verification fixtures
description: Durable lessons for exercising account deletion against the Pint Wars scoring and Storage paths.
---

Account-deletion verification must distinguish direct fixture inserts from authoritative application paths. Direct `pint_logs` inserts do not exercise score awarding; ledger-preservation coverage needs a valid pre-deletion ledger fixture created through the server-authoritative path or seeded as valid immutable history before de-identification.

**Why:** A fixture can appear to contain pint history while having no score events, producing a false positive for ledger preservation.

**How to apply:** Before deletion, assert that each history category has the rows needed by its specific invariant, and report missing fixture coverage separately from a product failure.