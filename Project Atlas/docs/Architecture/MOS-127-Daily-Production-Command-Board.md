# MOS-127 — Daily Production Command Board

**Release channel:** MAIN

The Daily Production board is a purpose-built bounded read model over canonical `Job`/Work Order records. It does not create dashboard-owned production state. The additive Job fields are `Owner User ID`, `Current Operation`, `Material Readiness`, `Tooling Readiness`, `Blocker Active`, `Blocker Reason`, and `Version`. Existing `Due Date` and `Status` remain canonical. Legacy blank readiness is projected as `UNKNOWN`, never `READY`.

Business-day classification uses `ATLAS_BUSINESS_TIME_ZONE`, falling back to the Apps Script project timezone. Date-only commitments remain due for their entire local date. Timestamp commitments become overdue when their instant passes. Active, incomplete Work Orders are classified once into `OVERDUE`, `DUE_TODAY`, `DUE_TOMORROW`, or `THIS_WEEK` (through local Sunday). Work after Sunday remains in normal production views. Completed, closed, and cancelled work is excluded.

Readiness is deterministic: material or tooling `MISSING`, or an explicit blocker, is `BLOCKED`; both readiness values `READY` with no blocker is `READY`; every other combination is `AT_RISK`. `UNKNOWN` cannot become ready.

Mutations use the universal MOS-121 authorized execution and operation-ledger boundary with `OPERATIONS_WRITE`, trusted tenant and actor context, expected Job version, idempotent command identity, and explicit-review recovery. Owner is a business assignment and is validated against active tenant membership; it is never used as authoritative actor identity. The browser cannot set tenant, actor, audit, version result, or security metadata.

The read model performs four bulk repository reads (Jobs, Customers, Memberships, Users), builds lookup maps once, returns no event history, and bounds each bucket to 100 records by default with a 200 hard maximum. The current Sheets adapter may still scan complete backing sheets internally; that pre-existing adapter debt remains subject to MOS-119/120 measurement and indexing decisions.

No production workbook or Script Property is changed automatically. Activation requires adding the documented Job headers through the controlled deployment process and configuring the tenant timezone when the Apps Script project timezone is not the shop timezone.
