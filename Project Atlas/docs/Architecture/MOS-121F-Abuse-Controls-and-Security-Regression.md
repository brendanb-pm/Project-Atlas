# MOS-121F — Abuse Controls, Throttling, and Security Regression

Release channel: **MAIN**

Baseline: `8694216adf729191fbe9701b930144898858e1c9`

## Boundary and threat model

These controls reduce accidental amplification, replay pressure, record spam, expensive-read repetition, malformed QR attempts, and quota consumption. They are not authentication, authorization, DDoS protection, or proof of operator identity. The current Apps Script deployment supplies no trustworthy client IP, session, tenant, or named principal to the callable boundary.

Threat categories are:

- **Accidental amplification:** double taps, browser retries, repeated refresh, and uncertain transport outcomes.
- **Replay:** repeated command/correlation/provider notification identifiers.
- **Resource abuse:** loops intended to consume Apps Script, Cache, lock, or Sheets quota.
- **Malicious flooding:** high-rate traffic that application controls can bound but not absorb like an edge/DDoS service.
- **Expensive-query abuse:** repetition of known full-scan or large-payload endpoints pending MOS-120 bounded queries.

## Callable and triggerable surface inventory

| Surface | Classification | Existing protection | MOS-121F disposition |
|---|---|---|---|
| `doGet` route selection | READ | Static template routing; no repository read | Not throttled; limiting navigation would harm UX without protecting an expensive operation. |
| MVP bootstrap, Sales metrics/queue/timeline/account health, calendar workspace, dashboards/workloads, JobEvents, Ideas, ProcessTrials, cash summary | EXPENSIVE READ | Input validation and client duplicate guards vary; most perform full-list scans | Deployment-operation burst buckets before repository work. |
| Customer/RFQ/Quote/Job/Invoice create/update, SalesActivity, FollowUp scheduling, Ideas, ProcessTrials, purchase request | WRITE | Validation; some service locks/idempotency | Normal-write burst bucket before repository work. |
| FollowUp ownership/lifecycle, calendar reconciliation/cleanup/disconnect, cash/deposit, purchase approval/receipt | HIGH-RISK WRITE | Versions, correlation, audit, workflow validation | Fail-closed high-risk burst bucket before mutation. Authorization remains missing. |
| Shop-floor transition/problem/block resolution | WRITE / QR | Active token and Job scope, workflow state, command idempotency, script lock | Global plus hashed-token scoped burst buckets; repeated navigation remains separate. |
| QR resolution/traveler | READ / QR | Opaque token validation, revocation, generic errors | Generous deployment bucket. Frequent valid scans remain usable; raw token is never logged. |
| Calendar inbound reconciliation and provider notifications | EXTERNAL CALLBACK / BACKGROUND | Durable correlation records, provider event/version data, loop prevention, script lock | No public `doPost`/callback endpoint exists in current MAIN. Provider replay remains idempotent. Future callback entrypoints must apply `EXTERNAL_CALLBACK` policy after provider verification. |
| Apple polling, Google watch renewal, Microsoft subscription/delta, RFQ Gmail/AI polling | BACKGROUND / SYSTEM | Connection cursor/state, retry bounds, durable sync events, RFQ retry cap | Not browser-callable. Scheduler activation remains disabled; future triggers require system/process policy and overlap guards. |
| Persistence/schema initialization and QR lifecycle administration | ADMINISTRATIVE | No browser endpoint for persistence initialization or QR rotate/revoke | Existing QR configure endpoint uses administrative burst policy. Full capability enforcement is deferred. |
| Bulk/import | ADMINISTRATIVE | No callable bulk/import endpoint found | Future endpoints require explicit batch bounds and administrative capability. |

## Central architecture

`AbuseControlService` uses Script Cache and a short Script Lock critical section. It performs no Sheets read/write. Each call:

1. selects an explicit workload policy;
2. hashes the operation and optional scope with SHA-256;
3. acquires the script lock for at most 250 ms;
4. reads all applicable fixed-window counters;
5. rejects before any counter or business mutation if any bucket is exhausted;
6. writes updated cache counters and releases the lock before business/provider work.

Only a deployment-scoped operation name is authoritative today. QR commands additionally use a hash of the supplied token as a resource signal; token validity is still established independently by `ShopFloorService`. Record IDs and tokens are not identities. Authenticated-user, tenant, membership, session, and role/capability keys are deferred until the MOS-121 trusted request context exists.

Cache/lock failure is fail-open for normal reads, ordinary writes, QR navigation, and shop commands so a limiter outage does not halt the shop. High-risk and administrative operations fail closed. Degraded and throttled outcomes emit security-safe structured diagnostics without raw scope values.

## Initial burst policies

These are protective burst ceilings, not business throughput targets or authentication policy:

| Policy | Initial window | Ceiling | Rationale |
|---|---:|---:|---|
| `EXPENSIVE_READ` | 10 seconds | 20 per operation/deployment | Normal UI produces one request per load; allows concurrent use while bounding tight refresh loops. |
| `NORMAL_WRITE` | 10 seconds | 30 per operation/deployment | Far above normal human entry rate; bounds record-spam loops. |
| `HIGH_RISK_WRITE` | 30 seconds | 10 per operation/deployment | Consequential actions are infrequent and should fail closed if protection is unavailable. |
| `SHOP_FLOOR_COMMAND` | 10 seconds | 120 global and 30 per hashed token | Supports rapid multi-job shop work while bounding a single traveler loop. |
| `QR_LOOKUP` | 10 seconds | 60 per operation/deployment | Scans are harmless reads and intentionally receive a generous ceiling. |
| `ADMINISTRATIVE` | 30 seconds | 10 per operation/deployment | Administrative operations are infrequent and fail closed. |

The thresholds are based on the current one-action/one-request UI and intended 10–20-person shop envelope, not real Apps Script measurements. Validate hit rate and false positives in controlled non-production before production activation. Do not lower them without representative workflow evidence. Future tenant/user keys should reduce cross-user interference after identity enforcement.

`THROTTLED` responses provide a safe message, reference ID, and coarse retry delay. They do not expose counters, bucket keys, thresholds, cache details, or caller signals. Mutation UIs retain existing loading restoration and uncertainty guidance.

## Idempotency, replay, and QR

Throttling executes before business work and does not replace idempotency:

- shop-floor commands retain command-ID lookup under `LockService`;
- calendar inbound/outbound operations retain durable provider/correlation replay detection and loop prevention;
- RFQ intake retains message/thread matching and a three-attempt retry ceiling;
- cash receipt IDs and service locks remain unchanged;
- repeated QR scans append no events and do not mutate Jobs;
- malformed, unknown, revoked, and wrong-Job QR tokens still fail uniformly.

Provider callback verification must precede trusting provider content when live callbacks are introduced. Throttling alone does not make callback input trusted.

## Locking and concurrency findings

- Limiter lock scope contains only Cache reads/evaluation/writes; no repository or external-provider call occurs while it is held.
- Shop-floor command and QR rotation locks protect duplicate/state transitions, but use the deployment-wide Script Lock and may serialize unrelated Jobs. This is acceptable at current scale and should be measured before changing correctness-critical locking.
- Cash receipt and Ideas critical sections also use the global Script Lock.
- **HIGH finding:** `CalendarFollowUpSyncService.syncToExternal()` holds the Script Lock while calling the external calendar provider. A slow provider can serialize unrelated calendar work and contribute to retry pressure. Safely narrowing this requires a durable in-progress claim/outbox protocol, not a contained throttle change; defer to a calendar concurrency remediation story.
- Fixed-window Cache counters are guarded against concurrent lost updates. Cache eviction can weaken limiting, so application controls remain best-effort defense in depth.

## Expensive reads and MOS-119/MOS-120

The protected endpoints include the current highest-amplification paths: `getMvpBootstrap`, calendar workspace, dashboard/workloads, SalesActivity timeline/metrics/queue/account health, JobEvents, ProcessTrials, and financial summary. Throttling caps repetition but does not reduce the cost of one request. MOS-120 bounded repository queries and purpose-built read models remain the structural remediation for full-sheet scans, large payloads, global histories, and floor-board refresh.

## Performance and observability

Per protected request, the normal limiter path adds:

- one lock acquisition/release;
- one Cache read and one Cache write for global policies;
- two Cache reads and two writes for scoped shop-floor policies;
- SHA-256 hashing;
- no Sheets or provider operation.

The in-memory test characterization executes 1,000 isolated checks in well under one second on the local Node runtime; this is not Apps Script/Cache latency evidence. Required non-production measurements are p50/p95 lock wait, total limiter duration, Cache failure/eviction frequency, throttle counts by policy/operation, false-positive reports, and end-to-end operator latency during representative concurrent floor-board, CRM, calendar, and shop-floor workflows.

Only throttled or unavailable-control events are logged. Logs contain operation, policy, a truncated hash-derived bucket reference, retry guidance, and no QR token, credential, provider token, or user content.

## Security regression and activation

The durable suite covers repository secret hygiene/ignore rules, QR entropy/scope/revocation/rotation/idempotency, formula-safe persistence and round trips, stored-text HTML escaping, client-safe errors and diagnostics, normal/excessive/scoped traffic, pre-mutation rejection, retry windows, fail-open/fail-closed behavior, lock contention, shop/calendar replay regression, and the explicit absence of authentication semantics from limiter success.

Before production use:

1. implement and validate MOS-121 authenticated principal, membership, tenant, capabilities, and immutable `AuditContext`;
2. run controlled Apps Script/Cache concurrency and latency measurements;
3. validate provisional ceilings against representative multi-operator workflows;
4. establish alert review for sustained throttling or limiter-unavailable diagnostics;
5. implement MOS-120 bounded reads rather than relying on throttling as the permanent performance solution;
6. remediate the calendar external-call lock before high-volume writable provider activation.

The MOS-121E SalesActivity transport-error residual was fixed without changing its workflow: transport failures now use fixed operator-safe wording, while normal endpoint errors continue through the safe correlated response contract.

No production data, Sheets, Script Properties, credentials, providers, triggers, or deployments were changed.
