# MOS-121K Durable Mutation Recovery and Lease Reconciliation

Release channel: MAIN
Baseline: `8d52413f52e6a277c500396f73eea436ce4a5b5f`

## Recovery contract

MOS-121K extends the MOS-121J security operation ledger; it does not introduce a second recovery subsystem. Callable operations preallocate server-controlled identities for create workflows. After canonical persistence succeeds, the service checkpoints the resource identity and bounded result before attempting its required append-only domain event. A later event failure therefore leaves a `RECOVERY_REQUIRED` row that identifies the resource and can reconstruct the event without repeating the canonical mutation.

The create-then-required-event audit identified two current browser-callable canonical create paths covered by this contract:

- FollowUp creation followed by its `CREATED` FollowUpEvent.
- Idea capture followed by its `IDEA_CAPTURED` IdeaEvent.

The existing shop-floor status commands also update canonical state before appending a JobEvent. They now checkpoint the resulting Job before the append and retain their pre-existing command-id recovery contract. QR issuance/rotation events remain governed by the QR lifecycle and lock/idempotency contracts; their opaque tokens are not copied into the general security ledger.

Recovery reuses the original authoritative `UserID`, tenant, correlation, operation, resource, and bounded recovery context. The recovery executor uses explicit `SYSTEM:SECURITY_OPERATION_RECOVERY` identity with only `SECURITY_RECOVER`. Reconstructed domain events retain the original human actor while recording the recovery system actor and source operation separately. Recovery is tenant-scoped and idempotent: deterministic event identities/correlation checks prevent a second append.

## Lease and stale reconciliation

Every new ledger operation records `Lease Seconds` and `Lease Expires At`. The default lease is 120 seconds and may be configured with `ATLAS_SECURITY_OPERATION_LEASE_SECONDS`; accepted values are 30 through 1,800 seconds. This is an activation-tunable safety lease, not a request timeout or operator rate limit.

- Before expiry, replay returns `OPERATION_IN_PROGRESS`; it never enters canonical work.
- After expiry, one claimant changes the row to `RECONCILING` under the existing narrow script lock.
- A durable canonical checkpoint, existing correlated event, or operation-specific exact state proof establishes completion. Recovery finalizes missing append-only work without replaying the mutation.
- Only an explicit positive `NOT_COMPLETED` proof permits canonical retry under the existing operation identity and version rules.
- If completion or non-completion cannot be proved, the row becomes `RECOVERY_REQUIRED` / `REVIEW_REQUIRED`. Uncertain work is never destructively replayed.

Late completion and concurrent recovery are serialized only while claiming/checking/appending ledger or event state. No provider call or unrelated external work is performed while holding this recovery lock. A completed row wins over a late recovery update, and subsequent recovery attempts return the completed result.

## Additive persistence

Add these headers to the existing `SecurityAuditEvents` sheet through the documented non-production schema activation process:

- `Mutation State`
- `Mutation At`
- `Recovery Actor`
- `Recovery Correlation ID`
- `Lease Seconds`
- `Lease Expires At`
- `Reconciled At`

All MOS-121J headers remain required, including `TenantID`, `UserID`, `Operation`, `Correlation ID`, `Idempotency Key`, `Resource Type`, `Resource ID`, `Result JSON`, `Recovery Type`, `Recovery Status`, `Recovery JSON`, attempt timestamps, outcome, status, and details. Legacy rows lacking lease fields derive expiry from `Last Attempt At` (or `Occurred At`) plus the configured lease. Missing resource/recovery context fails to review state rather than crashing or repeating a mutation.

## Performance and activation

The normal mutation path adds one ledger checkpoint update between canonical persistence and its required event. Lease reconciliation adds a ledger lookup, a short claim lock, an operation-specific resource/event lookup, and final ledger/event writes only for expired or recovery-required work. It adds no polling and no provider calls. Real Apps Script/Sheets latency remains to be measured during controlled non-production activation, so performance/responsiveness QA cannot be considered fully validated by local tests.

Activation requires additive headers, an approved ENFORCED identity configuration, validation of the lease against measured maximum normal operation duration, and a least-privileged scheduled/manual recovery entry point. Disablement leaves canonical records and ledger/audit history intact; unresolved rows remain reviewable. No production worksheet, deployment, identity provider, or external provider was changed by MOS-121K.

MOS-121K does not declare MOS-121 complete. MOS-121H must be rerun independently.
