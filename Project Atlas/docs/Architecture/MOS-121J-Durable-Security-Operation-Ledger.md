# MOS-121J Durable Security Operation Ledger

Release channel: MAIN. Baseline: `633091445879bae13843ebd2785517f047addbd6`.

This change turns `SecurityAuditEvents` into the durable operation ledger used by the authorized-execution boundary. It does not activate identity enforcement, providers, or production configuration.

## Execution and replay contract

Every classified mutation is authorized before ledger lookup, including a replay. The server derives the tenant, Atlas user, operation, immutable audit context, and required capability. A logical operation is identified by:

`TenantID + UserID + Operation + IdempotencyKey`

The key is a SHA-256 digest of the operation and stable command/request inputs. Command IDs are used when a domain already supplies one. UI create workflows may supply a form-scoped operation ID, retained across uncertain failures. A collision in another tenant, user, or operation cannot disclose or replay the first result.

Under a narrow script lock, the ledger finds or creates the operation and durably transitions `PENDING` to `IN_PROGRESS`. The lock is released before business work or external-provider work. Existing states behave as follows:

- `COMPLETED`: return a bounded business-safe result and do not mutate again.
- `IN_PROGRESS` or `PENDING`: return a safe in-progress result and do not run concurrently.
- `RECOVERY_REQUIRED`: return unknown-outcome/reconciliation semantics and do not repeat the canonical mutation.
- `FAILED`: return the stored safe failure; a changed request receives a different derived identity.

Successful replay returns only `id`, `status`, and `version` where present. Full business payloads, credentials, provider details, and secrets are not stored as replay results.

## State and recovery

The durable state machine is:

`PENDING -> IN_PROGRESS -> COMPLETED | FAILED | RECOVERY_REQUIRED`

An unknown failure after an operation begins is conservatively recorded as `RECOVERY_REQUIRED`. The ledger retains the known resource type and ID before execution when the endpoint has them. It also records a bounded recovery type/context and attempt metadata.

Two provider-neutral recovery handlers are currently registered:

- `FOLLOW_UP_DOMAIN_EVENT`: re-read the FollowUp, detect the event by FollowUp ID plus the original correlation ID, append the missing event with the original authoritative Atlas user, and complete the ledger.
- `SHOP_FLOOR_DOMAIN_EVENT`: re-read the Job, detect the event by Job ID plus command ID, append the missing event with the original authoritative Atlas user, and complete the ledger.

Recovery is invoked only through the private, least-privileged `SECURITY_OPERATION_RECOVERY` trusted-system operation with `SECURITY_RECOVER`. A failed recovery remains `RECOVERY_REQUIRED`; attempt count, last attempt, and failure status are updated. A repeated successful recovery observes the existing event or completed ledger and is harmless. Recovery never repeats the canonical mutation or impersonates a human.

## Additive persistence activation

Add these headers to the existing `SecurityAuditEvents` sheet using the normal additive schema activation process:

- `Idempotency Key`
- `Request Fingerprint`
- `Resource Type`
- `Resource ID`
- `Result Code`
- `Result JSON`
- `Recovery Type`
- `Recovery Status`
- `Recovery JSON`
- `Attempt Count`
- `Last Attempt At`

Existing identity, capability, correlation, occurrence, completion, outcome, status, and detail columns remain unchanged. Legacy rows without the new fields remain historical records and are not rewritten. Production schema activation must be separately reviewed and performed before enabling enforced writable operation replay.

## Callable and QR boundaries

The callable coverage test recursively scans all Apps Script source. Every top-level name that does not end in `_` must exactly match an endpoint registry classification. Internal constructors and helpers now end in `_`, which makes them non-callable through `google.script.run`; trusted recovery helpers are private as well. The current public set contains only registered UI/routes and two protected administrative initializers.

Consequential shop-floor commands re-read and validate the QR token inside the same narrow mutation lock used for command idempotency. Harmless QR navigation remains lock-free. No lock is held across external work.

## Operator recovery behavior

The shared callable response maps `RECOVERY_REQUIRED` and completed replay to a non-success response with `refreshRequired`. It states that the change may already have been saved, prevents a clean-success presentation, and tells the UI to refresh authoritative state rather than submit again. FollowUps, Calendar Settings, Ideas, Sales Activity, MVP create, and shop-floor mutation surfaces honor the refresh contract. Only a safe reference ID is exposed.

## Performance and remaining risk

The ledger adds one durable lookup, one create plus state update for a new operation, and a bounded completion/failure update. Lock scope contains only find/create or state transition work. QR commands add one token lookup inside their existing command lock. Callable classification has test-time cost only.

The current Sheets repository implements operation identity lookup as a linear sheet read. This is correct but must be measured and migrated to a bounded lookup/index behind the MOS-120 repository contract when real volume warrants it. Real Apps Script/Sheets latency and contention remain unmeasured, so performance/responsiveness QA is PARTIAL.

The MOS-121F global pre-authentication limiter remains a MEDIUM availability risk: unauthenticated callers can consume its shared bucket. Current Apps Script request context supplies neither a trustworthy cheap caller identity nor a safe IP key. Moving identity resolution ahead of the limiter would increase the resource-amplification cost it is intended to avoid. The existing limiter is retained until an authoritative session/principal key or platform-level edge control is available.

## Activation and rollback

Activation order: deploy additive headers in non-production; initialize/verify mappings; run replay, recovery, callable-coverage, QR concurrency, and full regression suites; measure Apps Script/Sheets overhead; then rerun MOS-121H independently. Rollback disables writable identity enforcement/provider activation while preserving canonical records and ledger/audit history. Do not delete ledger rows or rewrite historical attribution.

MOS-121J does not declare MOS-121 complete and makes no production changes.
