# MOS-121I — Security Boundary Remediation

Release channel: **MAIN**. Baseline: `13abfc620ad4fbf4581b58faa62c6b65587ea1b2`.

This remediation closes the demonstrated MOS-121H boundary findings. It does not activate identity enforcement, alter deployment access, create production sheets, or certify MOS-121 complete. MOS-121H must be rerun independently.

## Callable and domain boundaries

`ATLAS_CALLABLE_ENDPOINTS` remains the machine-verifiable browser surface. The two manual persistence initializers now enter the same `ADMIN_CONFIG` authorized-execution boundary before any sheet lookup or creation. `doGet` is explicitly read-only. Internal constructors and private helpers are not approved mutation endpoints; the regression audit scans the complete source tree for direct public persistence creation paths.

The generic MVP endpoints no longer use `CORE_RECORD_WRITE` for every entity. A server-owned entity policy selects:

| Entity | Read | Write |
| --- | --- | --- |
| Customer | `CORE_RECORD_READ` | `CORE_RECORD_WRITE` |
| RFQ | `RFQ_READ` | `RFQ_WRITE` |
| Quote | `RFQ_READ` | `QUOTE_WRITE` |
| Job | `OPERATIONS_READ` | `OPERATIONS_WRITE` |
| Invoice | `FINANCE_READ` | `FINANCE_WRITE` |

Clients cannot supply a capability override. Generic Quote and Job updates cannot change lifecycle status. Quote approval and issuance have explicit `QUOTE_APPROVE` and `QUOTE_ISSUE` endpoints and validated transitions. The legacy `getMvpBootstrap` compatibility endpoint now returns only domains for which the authoritative request context contains the corresponding read capability. This is a containment step; staged retirement in favor of MOS-120 bounded read models remains recommended.

## Durable audit and recovery

ENFORCED-mode canonical mutations create a durable `PENDING` security audit event before business execution. The record retains the complete authoritative identity context required for recovery: tenant, Atlas user, principal type/reference, operation, required capability, correlation, actor type, and timestamp. A successful operation marks it `COMPLETED`. If the final audit update fails, the client receives success with `RECOVERY_REQUIRED`; it is not encouraged to repeat a mutation that already succeeded. If an unexpected operation failure may follow a canonical write, the durable record becomes `RECOVERY_REQUIRED` and the safe client outcome is `UNKNOWN_OUTCOME`, requiring authoritative refresh/reconciliation.

The additive `SecurityAuditEvents` headers are:

`SecurityAuditEventID`, `TenantID`, `UserID`, `Principal Type`, `Principal Reference`, `Operation`, `Required Capability`, `Capabilities JSON`, `Correlation ID`, `Actor Type`, `Occurred At`, `Completed At`, `Outcome`, `Status`, `Details`.

Production activation must create and verify this sheet before switching identity mode to `ENFORCED`. Absence or write failure fails closed before the canonical operation begins. No automatic initializer or production migration is included.

## Read and system boundaries

The Calendar workspace now uses a provider-neutral operator read model. It exposes display names, connection health, synchronization state, and `hasExternalProjection`; it omits credential references, provider cursors, subscription/watch identifiers, external account/calendar IDs, and external event IDs.

`trustedSystemExecute_` is the only approved helper for future background operations. It requires an allowlisted operation/capability pair, creates an explicit system AuditContext, and uses the same durable audit coordinator. It is private and cannot be selected by a browser request. Current allowlisting remains limited to calendar reconciliation and RFQ intake; neither receives administrative capability.

## Concurrency and ordering

FollowUp reschedule, scheduling, reassignment, completion, and cancellation perform their version check and canonical update inside a narrow script-lock critical section. Calendar provider calls remain outside those service locks; inbound calendar reconciliation that already owns its synchronization lock receives an explicitly non-locking FollowUp service to avoid nested locking. Purchase approval and receipt recording similarly re-read and update inside a narrow lock. The existing abuse-control-first ordering is retained as defense in depth and never substitutes for authorization.

## Activation and rollback

Before non-production ENFORCED validation:

1. Add and verify all MOS-121G identity stores and `SecurityAuditEvents` with the exact headers above.
2. Provision test-only users, external identity references, and active tenant memberships.
3. Validate trusted principal resolution, capability denial, audit recovery, and client authoritative-refresh behavior.
4. Validate Apps Script lock and added audit-write overhead with representative data.
5. Keep writable production access disabled until the independent MOS-121H gate passes.

Rollback is to disable writable identity activation under the approved deployment-security procedure while retaining canonical records and all security audit/recovery records. Do not delete the audit sheet or rewrite history.

## Remaining activation evidence

Local automated security and regression evidence cannot establish real Apps Script/Sheets latency, lock contention, deployment principal behavior, or rendered operator handling of `RECOVERY_REQUIRED`. Those remain controlled non-production activation checks. The current unsafe `USER_DEPLOYING + ANYONE` composition is still not approved for writable production.
