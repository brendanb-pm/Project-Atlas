# MOS-118 Calendar Activation and Rendered Validation

## Control-story boundary

Release channel: **MAIN**. This control story starts at main commit
`292be380d0cbb62fe92f950f1e92a7231632779a`; MOS-117 was code-complete at
`1783ca3fd5b21d67a3608adbbd6a137c5fb28734`. It defines activation work but
does not authorize a provider, alter a worksheet, start a watch/subscription or
poller, create an event, deploy configuration, or enable writable production
synchronization.

MOS remains authoritative for FollowUp identity, relationships, ownership,
lifecycle, versions, and audit history. Providers synchronize only a complete
`Start At` + `End At` + `Time Zone` block. `Due At` remains an independent CRM
deadline. Calendar authorization is separate from MOS authentication, and MOS
must work with Google, Microsoft, Apple/iCloud, read-only iCal, or no calendar.

## Activation state model

| State | Evidence required | Explicitly not implied |
| --- | --- | --- |
| Code-complete | Full fake-provider/regression suite and independent completion gate pass | Real provider behavior, rendered quality, or activation |
| Configured non-production | Approved isolated target, additive schema verified, secure credential references and disabled-by-default provider composition configured, rollback rehearsed | Provider acceptance or production access |
| Provider validated | One provider passes its real non-production acceptance matrix with retained evidence | Other providers or rendered acceptance |
| Rendered validated | Actual deployed UI passes the viewport/workflow matrix with screenshots, accessibility observations, and defect records | Writable production enablement |
| Production-ready | 118A-E evidence is complete, blockers are closed, security/operations review approves enablement | Production is enabled |
| Production activated | Separately authorized deployment enables only approved providers/users and records the change | Blanket enablement of every adapter |

No state may be skipped. A failed gate returns to the last passing state.

## Substories and gates

### MOS-118A — non-production activation scaffold

Build an isolated, non-production target; verify exact additive headers and
repository mappings; define secure credential-reference composition; configure
fake/provider-neutral fixtures; retain calendar sync disabled; record rollback;
and establish measurement and evidence templates. GO requires MOS-115–117
regressions, schema verification without data loss, no raw credentials in
business storage, a working disable path, and MOS operation with all providers
absent. STOP for missing headers, ambiguous environment ownership, insecure
credential storage, production-only credentials/data, or a rollback requiring
data repair.

### MOS-118B — Google validation

Authorize only an approved test account/calendar through a reviewed gateway.
Validate real event IDs/ETags, selected-calendar routing, private correlation,
watch creation/expiry/renewal, authoritative fetch after notification, missed
notification recovery, revocation, rate/error behavior, and rollback. GO only
when the shared provider matrix passes and cleanup leaves no unexplained test
events. STOP on permission overreach, token leakage, wrong-calendar writes,
feedback loops, unreviewed lifecycle changes, or unreliable recovery.

### MOS-118C — Microsoft validation

Use an approved non-production Entra application/account/calendar. Validate
Graph event/change-key behavior, calendar selection, notification subscription
expiry/renewal, authoritative fetch, delta cursor/recovery, revocation and
rollback. Apply the same GO/STOP rules as 118B; additionally stop if delta-token
or subscription recovery can lose or duplicate scheduling changes.

### MOS-118D — Apple/iCloud validation

Use an approved non-production Apple/iCloud calendar through the reviewed
CalDAV-compatible gateway. Validate discovery/selection, actual ETag semantics,
create/update/delete detection, incremental reconciliation when available,
polling load/rate behavior, credential isolation, outage recovery and rollback.
Do not claim push or delta capability. STOP if reliable deletion/change
detection is unavailable, polling load is unsafe, or credentials cannot remain
outside business worksheets.

### MOS-118E — rendered and production-readiness acceptance

Run the complete rendered, accessibility, workflow, and responsiveness matrices
against the configured non-production target. Re-run full regressions and each
validated provider's smoke/recovery tests. GO to **production-ready** only when
all required evidence is linked, no release-blocking defect remains, rollback is
rehearsed, and Brendan approves the unresolved operating choices. Production
activation remains a separate explicitly authorized change.

Each substory reports independently:

- `CODE / FUNCTIONAL STATUS: PASS | PARTIAL | FAIL`
- `UI/UX CODE-LEVEL QA: PASS | PARTIAL | FAIL`
- `RENDERED VISUAL QA: PASS | PARTIAL | FAIL | NOT PERFORMED`
- `PERFORMANCE / RESPONSIVENESS QA: PASS | PARTIAL | FAIL | NOT PERFORMED`
- `PROVIDER VALIDATION: PASS | PARTIAL | FAIL | NOT PERFORMED`

## Shared provider acceptance matrix

For each writable provider, retain test identity/calendar, timestamp, actor,
result, relevant MOS IDs, sanitized external evidence, audit/reconciliation
records, and cleanup result. Validate:

1. Explicit authorization independent of MOS login, calendar discovery and
   selection, disconnect, reauthorization, expiration and revocation.
2. Complete scheduled block projects once to the selected owner's calendar;
   deadline-only/incomplete records do not project.
3. MOS reschedule updates Start/End/Time Zone externally without changing Due At.
4. External move/resize updates only scheduling fields after version checks.
5. Concurrent changes preserve both schedules and require conflict resolution.
6. External deletion preserves the FollowUp and creates a review request; test
   Keep, Reschedule, Mark Complete, and Cancel independently.
7. Cross-owner reassignment cleans the prior projection and creates the new one;
   an unconnected owner still receives valid MOS ownership.
8. Cleanup failure records `CLEANUP_FAILED` with prior connection/provider/event
   context; Retry and Acknowledge follow their documented behavior.
9. Duplicate/replayed changes are idempotent and MOS-originated writes do not
   loop back as user changes.
10. Provider timeout/outage cannot corrupt or block ordinary MOS work; recovery
    reconciles authoritative state before encouraging repeat mutation.

iCal is validated separately as read-only publication: subscription output may
be consumed, but no two-way, deletion-observation, or write-back claim is made.

## Additive schema activation

118A must visually compare row-one headers and mappings before any non-production
write. Do not bulk-convert legacy records or infer schedules/timezones.

- `FollowUps`: `FollowUpID, CustomerID, SalesActivityID, Title, Due At, Start At, End At, Time Zone, Owner User ID, Status, Version, Created At, Updated At, Completed At, Cancelled At`
- `FollowUpEvents`: `FollowUpEventID, FollowUpID, Event Type, Occurred At, Actor, Correlation ID, Previous Version, New Version, Details`
- `CalendarFollowUpLinks`: `CalendarFollowUpLinkID, FollowUpID, ConnectionID, Provider, Calendar ID, External Event ID, External Version, Last Sync Origin, Last Correlation ID, Last Synced FollowUp Version, Created At, Updated At`
- `ExternalChangeRequests`: `ExternalChangeRequestID, Provider, FollowUpID, Previous ConnectionID, External Event ID, Change Type, Cleanup Operation, Requested Due At, Requested Start At, Requested End At, Requested Time Zone, External Version, Status, Details, Attempt Count, Last Attempt At, Last Error, Detected At, Resolved At, Resolved By, Resolution`
- `CalendarSyncEvents` (required activation gap): `CalendarSyncEventID, Provider, External Event ID, Correlation ID, Result, Details, Occurred At`
- `UserCalendarConnections`: `ConnectionID, UserID, Provider, ExternalAccountID, ExternalAccountDisplayName, ExternalCalendarID, ExternalCalendarDisplayName, ConnectionStatus, CapabilitiesJSON, CredentialReference, TokenExpiresAt, SyncCursor, SubscriptionID, SubscriptionExpiresAt, LastSyncAt, LastSuccessfulSyncAt, LastError, CreatedAt, UpdatedAt`

Activation order: regressions with integration disabled; back up/verify the
non-production workbook; add missing stores/headers additively; verify mappings;
load non-production fixtures; configure secure references/gateway; validate one
provider at a time; render/measure; rehearse disable; seek production approval.

Current MAIN injects a `syncEvents` contract for correlation/idempotency, but it
does not yet provide a concrete `CalendarSyncEvents` repository/mapping in the
production composition; one UI reconciliation path uses a no-op implementation.
118A must resolve and test this durable persistence boundary before any real
two-way provider validation. This is an activation blocker, not permission to
create a production worksheet in the control story.

## Rollback and disable

Disable writable synchronization first, then stop watches, subscriptions, and
polling. Mark affected connections disabled/attention-required without deleting
them. Preserve FollowUps, schedules, deadlines, links, sync/audit events, and
review requests. Reconcile or explicitly record orphan test events. Confirm CRM,
queues, reassignment and schedule editing still work in MOS. Disabling must not
require worksheet repair or rollback canonical data; re-enable only after the
cause is corrected and authoritative reconciliation is run.

## Rendered QA matrix

Inspect the actual deployed route `?calendar=1`; static inspection cannot fill a
cell. Record `PASS`, `FAIL`, or `DEFECT` and link screenshots/notes.

| Workflow/state | 1440x900 | 1024x768 | 768x1024 | 390x844 |
| --- | --- | --- | --- | --- |
| FollowUps / deadline-only |  |  |  |  |
| FollowUps / scheduled |  |  |  |  |
| Today |  |  |  |  |
| Calendar Settings / connection |  |  |  |  |
| Schedule and reschedule |  |  |  |  |
| Loading, provider failure, authorization problem |  |  |  |  |
| External deletion review |  |  |  |  |
| Conflict review |  |  |  |  |
| Reassignment |  |  |  |  |
| Cleanup failure / retry / acknowledge |  |  |  |  |
| Disconnect |  |  |  |  |
| iCal read-only and no-calendar user |  |  |  |  |
| Completed and cancelled records |  |  |  |  |

At every cell evaluate hierarchy, primary-action clarity, touch ergonomics,
keyboard/focus, accessible labels/status, error comprehension and recovery,
loading feedback, scrolling/overflow, dialog fit, action wrapping, destructive
clarity, MOS-versus-calendar state, deadline-versus-schedule meaning, and
technical-language leakage. Test normal, long, empty and missing-optional-value
content. A screenshot without workflow interaction is insufficient evidence.

## Performance and responsiveness validation

Instrument the non-production client, Apps Script endpoints, repositories and
gateway boundary with correlated timestamps. Establish observed baselines—do
not invent SLAs—for cold/warm initial load, FollowUps, Today, Calendar Settings,
schedule/reschedule, projection, reassignment, conflict resolution, cleanup
retry, and navigation. Use representative counts of users, open/closed
FollowUps, links, events and review requests, including realistic upper-bound
shop data agreed in 118A.

For each workflow record median and visibly slow examples, payload size,
repository reads/writes, full-dataset scans, client renders, provider calls,
round trips, blocking time, and behavior under injected latency/outage. Trace
unnecessary round trips, redundant reads/writes or rendering, repeated
initialization/calculation, full-data reads, avoidable polling and synchronous
provider dependencies. Compare provider-connected and disconnected paths.

PASS requires prompt input acknowledgment, visible progress, duplicate-action
protection, preserved input, understandable recovery, and continued unrelated
MOS use while slow external work can safely proceed independently. Establish
measurable targets only after baseline observation, then document the target,
rationale and repeatable measurement method. Unit tests or isolated function
timings alone cannot produce a performance PASS. Correctness, auditability,
integrity and safe failure may not be traded for latency.

## Evidence and production gate

PASS evidence includes commit/config identifiers; exact non-production target;
sanitized schema verification; full automated results; provider matrix records;
screenshots at every required matrix cell; keyboard/accessibility observations;
correlated performance measurements with representative data; security review;
rollback rehearsal; open-defect disposition; and signed approval. Clearly label
static, rendered, provider, and performance evidence.

Production enablement is blocked until 118A-E pass for the providers being
enabled. Enable providers/users incrementally with monitoring and a tested kill
switch. Never infer that provider validation authorizes production activation.

## Decisions requiring Brendan

- Approved non-production deployment, test users, accounts and calendars.
- Secure credential/token store and administrators for VMOS now, with an Atlas
  commercial migration path.
- Providers included in the first production release and their rollout order.
- Google/Microsoft notification endpoints and renewal ownership; Apple polling
  interval and acceptable change-detection delay.
- Representative data volumes and acceptable measured responsiveness targets.
- Screenshot/evidence retention location, accessibility reviewer and approver.
- Production enablement window, initial users, monitoring owner, rollback owner,
  and disposition policy for orphan external events.
