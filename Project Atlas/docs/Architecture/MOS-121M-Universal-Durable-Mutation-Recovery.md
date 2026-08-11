# MOS-121M — Universal Durable Mutation Recovery Contract

Release channel: **MAIN**. Baseline: `debab8b60ea8c83c06d7d6bfdbd06c41b91e9511`.

This change establishes a recovery classification and proof contract for every
callable mutation. It does not activate production identity, providers, schema,
or deployment configuration.

## Invariant and execution order

An ENFORCED mutation follows this order:

1. authorize the trusted principal, tenant membership, entitlement extension,
   and capability;
2. prepare deterministic resource/proof context;
3. create the initial durable `SecurityAuditEvents` row containing that context;
4. invoke the canonical mutation;
5. persist a canonical checkpoint when the domain requires one;
6. finalize the ledger result.

The initial row therefore retains the resource ID, command identity, expected
post-state, operation fingerprint, original actor, tenant, and recovery strategy
before canonical work begins. A failure of both completion writes cannot erase
that initial evidence.

Recovery returns only one of:

- `COMPLETED`: positive resource, command, state, or domain-event proof exists;
- `NOT_COMPLETED`: a deterministic preallocated resource/command lookup proves
  the mutation did not occur, allowing the existing idempotent retry contract;
- `UNCERTAIN`: proof is insufficient, so the operation becomes
  `RECOVERY_REQUIRED / REVIEW_REQUIRED` and is never blindly replayed.

## Callable mutation inventory

`ATLAS_MUTATION_RECOVERY` is the machine-verifiable inventory. The callable
boundary fails closed if a write lacks a strategy.

| Mutation family | Operations | Strategy and proof |
|---|---|---|
| MVP creates | Customer, RFQ, Quote, Job, Invoice | `PREALLOCATED_RESOURCE_ID`; existing canonical-format ID proves completion, absence proves non-completion. |
| MVP updates | Generic record updates | `EXPLICIT_REVIEW`; target ID and fingerprint remain durable, but mutable-field ambiguity is not guessed. |
| SalesActivity | Create / update | Create preallocates the canonical `SACT-YY-NNNN` ID; update retains target/fingerprint and uses explicit review. |
| FollowUps | Create, schedule, reschedule, reassign, complete, cancel | Existing `FOLLOW_UP_DOMAIN_EVENT` checkpoint and deterministic event recovery. |
| Ideas | Capture / promotion request | Existing `IDEA_DOMAIN_EVENT` recovery. |
| Shop floor | Configure, transition, problem, unblock | Existing `SHOP_FLOOR_DOMAIN_EVENT`, command, QR/workflow fingerprint, and event recovery. |
| Process trials | Record | Preallocated opaque `PTR` resource ID and bounded ID lookup. |
| Cash receipt | Record | Existing receipt command ID lookup proves completion/non-completion without duplicate posting. |
| Cash deposit | Deposit transition | Target receipt plus expected `DEPOSITED` state and deposit command ID. |
| Purchasing | Submit / approve / receive | Submit preallocates `PUR` ID; approval and receipt use expected authoritative post-state. |
| Quote lifecycle | Approve / issue | Target Quote plus expected `Approved` or `Issued` state. The separate concurrent-attribution finding remains deferred. |
| Calendar callable mutations | Disconnect, retry, review, cleanup | Existing target IDs/correlations are retained; ambiguous multi-record/provider outcomes use explicit review. Provider-specific sync records remain authoritative and are not duplicated. |
| Administrative initializers | Explicit manual initialization only | `BLOCKED_FROM_WRITABLE_PRODUCTION`; these are not production callable mutation paths. |

Live calendar callbacks, RFQ polling, and external provider activation remain
blocked by the MOS-118 and MOS-121C activation gates. They are not silently
treated as authorized production system endpoints.

The source-pattern audit also found Firearms workflow event appends, RFQ intake
staging, QuotePreparation delivery preparation, QR rotation/revocation helpers,
and provider polling helpers. None is a classified browser-callable ENFORCED
canonical mutation: they remain private module helpers, staging behavior, or
activation-blocked integration paths. A future callable/system entry point for
any of them must enter the endpoint inventory and declare a recovery strategy;
the coverage test rejects an unclassified writable callable.

## Generic and specialized recovery

`UNIVERSAL_RESOURCE_PROOF` handles preallocated IDs, command lookups, expected
state, and explicit review. The K/L handlers remain intact because FollowUp,
Idea, and shop-floor recovery must also reconstruct required domain events.

All lookups use the tenant from immutable server context. Recovery input cannot
replace the original resource type, ID, fingerprint, tenant, or actor. The
original actor remains on the operation; `SYSTEM:SECURITY_OPERATION_RECOVERY`
is recorded separately as recovery actor and retains only `SECURITY_RECOVER`.

## Failure and lease behavior

- Failure before canonical mutation: preallocated resource absence or command
  absence may prove `NOT_COMPLETED`.
- Canonical failure: established validation/conflict handling remains intact.
- One or two ledger-finalization failures after canonical success: initial proof
  survives and stale reconciliation locates the exact resource or command.
- Recovery lookup failure or ambiguous later state: review required.
- Duplicate or late recovery: claim locking and completed-state checks make
  reconciliation idempotent.
- Active leases are not replayed. Expired leases use positive proof before any
  retry; uncertain operations are never repeated.

## Persistence and activation

No new worksheet or header is required. Existing `SecurityAuditEvents` fields
`Resource Type`, `Resource ID`, `Request Fingerprint`, `Recovery Type`, and
`Recovery JSON` carry the universal proof. No production worksheet was changed.

Activation still requires additive MOS-121 schema review, trusted-principal
validation, ENFORCED-mode non-production testing, and a new independent
MOS-121H gate.

## Performance

Creates add one deterministic ID allocation before the existing ledger begin.
Recovery adds one bounded primary-ID, command-ID, or target-record lookup. Normal
successful updates add no extra proof write; their intent is stored in the
existing initial ledger row. No polling, global scan-based recovery loop, or new
broad lock was added. Real Apps Script/Sheets latency remains an activation
measurement.

## Deferred findings

- **MEDIUM:** calendar provider calls under the global script lock;
- **MEDIUM:** anonymous consumption of the pre-authentication abuse bucket;
- **MEDIUM:** quote lifecycle concurrent final-attribution race;
- **LOW:** in-flight membership/capability revocation window;
- **LOW:** private QR revoke/use locking asymmetry.
