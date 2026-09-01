# MOS-137 — Physical WIP Bin and QR Tracking

## Boundary

MOS-137 adds reusable tenant-owned physical WIP bins to the canonical PostgreSQL domain. A bin is not a Job: it may carry one active Job, be released, and later be reused while its assignment and location history remain durable. Jobs, Operations, Traveler projection, users, Customers, and internal-work classification remain authoritative in their existing aggregates. Production changes: **NONE**.

## Persistence model

Ordered migration `0008_physical_wip_bins` adds:

- `atlas_wip_bins`: canonical `WIP-BIN-<UUID>` identity, human label, `AVAILABLE`/`ASSIGNED`/`QUARANTINED`/`RETIRED`, configurable normalized physical location, notes, version, creator, and retirement lifecycle;
- `atlas_wip_bin_assignments`: append-preserved Job assignment/release history with actor, time, reason, correlation, and version;
- `atlas_wip_bin_location_events`: append-only from/to movement history tied to the active assignment when present;
- `atlas_wip_bin_identifiers`: revocable hashed QR/Data Matrix tokens.

Composite tenant foreign keys prevent cross-tenant Bin/Job/assignment stitching. Partial unique indexes permit only one active Job per bin and one active bin per Job. Retired bins cannot retain active work; quarantined/retired bins cannot be assigned through the service. Release and movement use optimistic versions and transactional updates.

## Job, operation, location, and QR behavior

Both `CUSTOMER` and `INTERNAL` Jobs use the same assignment contract. Assignment rejects archived and terminal Jobs. A terminal Job found in a current scan is surfaced with `releaseRequired` and `Release bin` as the next action; it is never silently released.

Locations are safe uppercase codes rather than a hard-coded workflow table. Defaults include Receiving, Programming, Machine Queue, At Machine, Inspection, Finishing, Shipping, and Hold, while the same validated code boundary permits tenant configuration later.

QR tokens contain no mutable business data. Only a SHA-256 hash is stored. An authenticated `WIP_BIN_READ` scan returns one current joined projection: bin identity/status/version, active Job and Customer/Internal classification, first active operation, owner/assignee, physical location, readiness, and next action. History loads separately with a strict 1–100 bound.

## Service and performance

`WipBinService` requires authoritative server context and explicit `WIP_BIN_READ`, `WIP_BIN_WRITE`, or `WIP_BIN_OPERATE` capability. Creation, assignment, release, movement, status, and identifier operations use fixed parameterized SQL and attributable actor/correlation fields.

Routine search defaults to 25 and caps at 100. Current scan is one bounded joined projection with a lateral one-row operation lookup. Assignment/location history is index ordered and loaded on demand. No polling or full Job/bin hydration was added.

## Operator workspace

The source-level WIP workspace presents `SCAN BIN → CURRENT JOB / LOCATION → MOVE / ASSIGN / RELEASE / OPEN JOB`. It has explicit loading, empty, unavailable, stale, quarantine/hold, conflict, error, and retry behavior; keyboard scan submission; live announcements; textual non-color state; touch-sized actions; responsive layouts; and stale-response suppression.

As with MOS-138, the workspace contract targets the authenticated PostgreSQL edge. Live production route/deployment is intentionally not activated. The local preview supplies synthetic representative states only.

## Verification and deferred scope

Focused tests cover reusable bin assignment across Customer and Internal Jobs, duplicate-active protection, tenant constraints, canonical IDs, QR hashing/authorization, normalized locations, bounded current/history queries, and concurrency input validation. Real PostgreSQL 17 validation applies migration 0008 with the established disposable non-superuser roles and rolls back its constraint fixture.

Inventory, warehouse management, carrier integration, RFID, CNC integration, and automated physical tracking remain out of scope. Production changes: **NONE**.
