# MOS-120 Bounded Query and Read-Model Architecture

## Decision and boundary

Release channel: **MAIN**. Baseline:
`21e169a6ba4bfea8ec041089e331d68c1a59cd3c`.

Atlas will add explicit, domain-oriented bounded queries and purpose-built read
models without replacing the existing repository API. The target remains:

`UI -> service/read model -> repository contract -> storage adapter`.

This document defines contracts only. It does not implement queries, indexes,
caches, helper sheets, schema changes, optimized writes, SQL, or changed product
behavior. MOS-119 did not prove a live Apps Script/Sheets blocker; its synthetic
evidence prioritizes future work but does not justify speculative refactoring.

## Current contract and consumer audit

| Area | Current contract and consumer behavior | Filtering/sorting/aggregation and compatibility constraint |
| --- | --- | --- |
| Generic entities | `SheetsRepository.list/findById/findFirstByFields/insert/updateById`; `MvpService.list/get/create/update`; Customer, RFQ, Quote, Job, Invoice wrappers | `list` reads all rows. ID lookup scans. `insert` appends then rescans; update locates, writes cells individually, then rescans. Existing services/tests depend on returned authoritative-looking records and current error types. |
| MVP bootstrap | `getMvpBootstrap()` lists Customer, RFQ, Quote, Job, and Invoice | Endpoint constructs one unrelated multi-entity payload; browser filters/renders it. It must remain compatible until screens receive replacements. |
| SalesActivity | `list`, `listByCustomerId`, `listOpen`, `get/create/update`; SalesActivity UI/service | Repository filters customer/open state after `list`; service sorts timeline. `metrics` reads all rows, calls another full open scan, then calls account health per account, which rescans the timeline: N+1. CRM deadline semantics and permission behavior must not change. |
| FollowUps | `list/get/create/update`; calendar services and workspace | Workspace loads all FollowUps. Due At, scheduled block, lifecycle/version and owner routing must remain authoritative and distinct. |
| Calendar connections/links/requests | connection `listByUserId`; link `findByFollowUpId/findByExternalEvent`; request `list`; calendar workspace/orchestration | Methods list then filter. Workspace sends all links and pending requests plus all Customers. Reconciliation, idempotency, conflict and cleanup context cannot be weakened. |
| CalendarSyncEvents | `append`, `findByCorrelation`, `list` | Correlation uses bounded columns when supported but still scans. Durable audit/recovery retention must not be traded for speed. |
| JobEvents | `list/findById/append/listByJobId`; shop floor/dashboard | `listByJobId` filters all history; service sorts by occurred time. Command idempotency scans job history. Dashboard scans all events to find latest per job. |
| Job detail associations | Job plus JobEvents, document metadata, ProcessTrials and operational data | ProcessTrials filter a full list by Job ID. Document relationships exist in configured mappings and must only be queried where the field exists; no new relationship is inferred. |
| Shop dashboard/floor board | Job, QR token, Quote, Invoice and JobEvent lists | Request-local maps avoid nested joins after data is loaded, but every refresh reloads collections. `listOperatorWorkloads` also rebuilds shop jobs for each operator through `getOperatorWorkload`. |
| RFQ/Quote | generic list/get plus quote preparation/revision and RFQ intake services | Bootstrap/list screens receive full collections; quote preparation performs application-side related-record assembly. Preserve quote revision, authoritative financial terminology and RFQ provider boundaries. |
| ProcessTrials | `list/append/listByJobId` | Job filter occurs after full list. Machine/tool/process queries must only be added for fields already present in configured domain records. |
| Purchasing/receipts | purchase and receipt `list/find/create/update`; receipt command lookup; summaries | Command lookup and undeposited summaries list/filter all records. ID generation scans receipts. Idempotency and approval/audit rules are compatibility constraints. |

## Shared bounded-result contract

All multi-record bounded queries return a semantic envelope:

```text
BoundedResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
  asOf: timestamp
}
```

- `limit` is required or receives a repository-defined safe default; adapters
  enforce a documented maximum.
- Ordering is deterministic and explicitly named by each query. Every order has
  a unique tie-breaker, normally canonical ID.
- Cursors are opaque, versioned tokens. Business/UI code must not parse a row
  number, sheet name, SQL key, or provider cursor from them.
- A cursor is valid only for the same query shape, tenant/deployment and sort.
  Invalid/expired/mismatched cursors produce a validation error, not silent
  restart. A caller may explicitly request a fresh first page.
- Results are serialized domain/read-model values and never expose sheet rows.
- Single-record misses retain current not-found/null semantics per repository;
  new contracts must document which one they use before implementation.
- Authorization remains in the service/read-model boundary. A repository query
  does not broaden access merely because it can filter by owner.

This is not a generic expression tree or SQL DSL. Common pagination mechanics
may be shared, but predicates are explicit domain methods.

## Proposed repository contracts

### SalesActivityRepository

```text
get(id)
listForCustomer(customerId, { before?, after?, limit, cursor? })
listForOwner(ownerUserId, { after?, before?, limit, cursor? })
listOpenDue({ ownerUserId?, dueFrom?, dueThrough?, limit, cursor? })
summarizeAccountHealth({ asOf, customerIds?, ownerUserId? })
```

Timeline order is `activityDatetime DESC, id DESC`. Due order is
`nextActionDueAt ASC, id ASC`. `summarizeAccountHealth` returns last contact,
next action/due date, open-without-next-action and staleness inputs in one
result per authorized account; it must calculate the same MOS-115 business
rules as today. Sheets can initially scan once and build a request-local map;
later it may use a verified summary/helper sheet. SQL can use indexed predicates
and grouped queries. Neither implementation leaks into the contract.

### FollowUpRepository

```text
get(id)
listForOwner(ownerUserId, { statuses?, dueFrom?, dueThrough?, limit, cursor? })
listScheduled({ ownerUserId?, startFrom, startThrough, statuses?, limit, cursor? })
listDue({ ownerUserId?, dueFrom?, dueThrough?, statuses?, limit, cursor? })
listByIds(ids)
```

Due queues order by `dueAt ASC, id ASC`; scheduled views order by
`startAt ASC, id ASC`. Scheduling state means a complete Start/End/Time Zone
block and never aliases Due At. `listByIds` is bounded by a documented maximum.
Sheets may make one scan and select requested rows; SQL may use `IN` and range
indexes.

### JobEventRepository

```text
listForJob(jobId, { before?, after?, limit, cursor? })
listForJobs(jobIds, { afterCursor?, limit })
listChanges({ afterCursor, limit })
findByJobAndCommand(jobId, commandId)
latestForJobs(jobIds)
```

History order is `occurredAt DESC, id DESC`; change order is a stable append
sequence, then ID. `findByJobAndCommand` preserves command idempotency.
`latestForJobs` returns at most one event projection per requested Job ID.
Because timestamps can collide or arrive with legacy formatting, they alone are
not sufficient incremental cursors.

### Documents and ProcessTrials

```text
DocumentRepository.listForJob(jobId, page)
DocumentRepository.listForPart(partId, page)       // only if mapping supports it
DocumentRepository.listForRfq(rfqId, page)         // only if mapping supports it
DocumentRepository.listForQuote(quoteId, page)     // only if mapping supports it
ProcessTrialRepository.listForJob(jobId, page)
```

Document order is `createdAt DESC, id DESC` where the mapped domain supplies
`createdAt`; otherwise the implementation story must select and document a
supported deterministic field. Process trials use `trialDate DESC, id DESC` or
the actual mapped timestamp. Machine/tool/process filters are deferred until
inspection of the activated schema proves those relationships are canonical.

### Calendar repositories

```text
UserCalendarConnectionRepository.listForUser(userId, { statuses?, writableOnly? })
CalendarFollowUpLinkRepository.listForFollowUps(followUpIds)
CalendarFollowUpLinkRepository.findByExternalEvent(provider, externalEventId)
ExternalChangeRequestRepository.listPending({ ownerUserId?, followUpIds?, types?, limit, cursor? })
CalendarSyncEventRepository.findByCorrelation(provider, correlationId)
CalendarSyncEventRepository.listForFollowUp(followUpId, page)
CalendarSyncEventRepository.listForConnection(connectionId, page)
CalendarSyncEventRepository.listSince({ connectionId?, afterCursor, limit })
```

Audit/event order is stable append sequence then ID. Correlation lookup remains
exact. Results retain provider-neutral lifecycle, conflict, deletion and cleanup
semantics. Provider sync cursors are not Atlas repository cursors.

### Generic entities and summaries

Entity-specific repositories may add `listByIds`, status, owner, updated-since,
date-range and bounded search methods only where their current domain mapping
supports those fields. Avoid putting an unconstrained `query(criteria)` on
`SheetsRepository`. Command Center counts belong in a read-model contract, not
in a generic repository `count(anything)` API.

## Purpose-built read models

| Read model | Minimal output and bounded behavior | Freshness |
| --- | --- | --- |
| CRM Account Summary | Customer identity/presentation fields; recent N activities; last contact; next open FollowUp; due/stale/open-without-next-action; independent page link for older history | **REAL-TIME / TRANSACTIONAL** after CRM mutation. Request-local aggregation is safe; persisted cache requires mutation-driven invalidation/rebuild. |
| CRM Follow-Up Queue | Due Today, Overdue and bounded Upcoming rows containing FollowUp/activity ID, owner, account display, action and due date; each group paged independently | **REAL-TIME / TRANSACTIONAL** for save/complete/reassign; as-of timezone explicit. A short display cache is unsafe unless invalidated on every relevant mutation. |
| Job Detail | Job; current workflow state; recent N JobEvents with older-history page; bounded Documents and ProcessTrials; only supported related operational fields | Job/status/version **REAL-TIME**; append-only history **NEAR-REAL-TIME** if the UI shows refresh state. |
| Command Center | Authoritative actionable counts plus small bounded exception lists; no raw full histories | **NEAR-REAL-TIME** for operational counts. Financial and approval facts remain authoritative; cached summaries require as-of timestamp, invalidation and explicit refresh. |
| Floor Board | Current active work cards and board revision; deltas after cursor; tombstones/removals | **NEAR-REAL-TIME** with bounded polling and visible as-of state. A full snapshot is authoritative recovery. |
| Calendar Workspace | Actor connections/provider capability display; FollowUps only for requested user/date window; matching links and pending requests; minimal account labels | FollowUp lifecycle/schedule and reconciliation **REAL-TIME** after mutation; provider health **NEAR-REAL-TIME** with last-sync timestamp. |
| RFQ/Quote Workspace | Bounded RFQ list/search; selected RFQ/quote and required related document/customer presentation; no all-entity bootstrap | Selected record **REAL-TIME**; list/search **NEAR-REAL-TIME** with explicit refresh. |

Read models are application services/interfaces, not stored tables by default.
They compose repository contracts in one request, deduplicate related IDs, use
request-local maps, and return screen-specific DTOs. A future persisted read
model is an adapter/operations choice with rebuild and invalidation rules; it
does not become canonical business state.

## Floor-board snapshot and delta contract

```text
getFloorBoardSnapshot({ workflowIds?, owner?, limit? }) -> {
  boardRevision, generatedAt, items[], nextCursor?
}

getFloorBoardChanges({ afterBoardRevision, limit }) -> {
  fromRevision, throughRevision, changes[], nextCursor?, hasMore,
  fullRefreshRequired
}
```

- `boardRevision` is a monotonic Atlas operational change sequence, not a wall
  clock or sheet row exposed to callers.
- Changes are ordered by revision ascending, then canonical item ID, and contain
  an idempotent `UPSERT` or `REMOVE` projection plus its revision.
- The client applies a change only when newer than the item's known revision;
  replay is harmless.
- Pagination holds a stable `throughRevision` so changes arriving during page
  traversal are read on the next cycle, not lost.
- A removed/completed/no-longer-visible job emits `REMOVE`; no historical event
  replay is required to derive current board state.
- Unknown/expired cursor, retention gap, sequence discontinuity or invalid
  revision returns `fullRefreshRequired: true`. The client replaces state from
  a fresh snapshot.
- Polling remains the first implementation; push/WebSockets are out of scope.
- The implementation must preserve missed-update recovery and current workflow
  authority. A Sheets option is an append-only operational change sequence plus
  request-local current-state projection, or a rebuildable current-state/helper
  sheet. SQL can use a change sequence/outbox. Neither is part of the domain API.

## Write-path contract recommendations

Preserve current `create/update` signatures until consumers migrate. Add an
optional adapter-level mutation result later:

```text
MutationResult<T> {
  record: T
  version: number|string|null
  committedAt: timestamp
  correlationId?: string
}
```

The adapter may return the record assembled from validated input plus
storage-generated authoritative values only when it can prove equivalence to a
reread. If the store generates/normalizes fields that cannot be known, it must
perform a targeted authoritative read. Updates accept expected version where
the domain has versioning, write related cells/ranges atomically to the degree
the adapter supports, and return the committed record. Unknown outcomes require
correlation lookup/reconciliation, not blind retry. Audit append, command
idempotency, versions and validation are never removed to save a read.

Sheets implementation may replace per-cell `setValue` calls with a safe range
write and may avoid append/update rescans. SQL may use `INSERT/UPDATE ...
RETURNING`. These are adapter choices; services see the same mutation result.

## Payload discipline

- Each endpoint returns fields used by its view; detail is fetched explicitly.
- Histories and exception lists have a default and maximum limit.
- Related labels are resolved server-side from a deduplicated ID set; unrelated
  Customer, RFQ, Quote, Job, or Invoice collections are never attached.
- Cursor/as-of metadata is small and provider/storage-neutral.
- List rows use summary DTOs; full notes, audit history and documents are detail
  calls.
- Today/date-window endpoints require a bounded business timezone range.
- UI refreshes request deltas or the active page, not an entire bootstrap.

Highest-value endpoint replacements are `getMvpBootstrap`,
`getCalendarWorkspace`, SalesActivity timeline/queue/metrics, job-event/history
loads, and shop dashboard/floor-board refresh.

## Domain contract versus Sheets options

| Contract need | Domain guarantee | Feasible Sheets choices (not selected here) | Future SQL feasibility |
| --- | --- | --- | --- |
| Exact ID/foreign-key lookup | Correct canonical match, stable errors | Bounded column scan; request-local lookup; cached/helper index with verification | Primary/foreign-key index |
| Bounded ordered page | Deterministic order, opaque cursor, max limit | Scan/filter/sort then return bounded result initially; helper/current-state sheet later | Composite index/keyset pagination |
| Multiple IDs | One result per found canonical ID, bounded input | One scan plus request-local set/map | `IN`/join |
| Date/status/owner range | Explicit domain predicate and timezone | Single request scan; helper index only if measurements justify it | Composite/range index |
| Changed since | Monotonic domain revision and recovery | Append sequence/current-state sheet; full-refresh fallback | Change table/outbox/sequence |
| Summary/count | Same business rules and as-of semantics | One-pass aggregation; rebuildable summary sheet if invalidation is proven | Aggregate/materialized view |

Helper sheets, cached indexes and current-state sheets are rebuildable adapter
artifacts. They require schema/activation/rollback stories, integrity checks,
and authoritative fallback. They never own domain lifecycle.

## Incremental compatibility and migration order

Existing `list/findById/create/update` remain supported. New methods are
additive. A consumer migrates only after equivalence tests pass; old methods are
not deprecated until repository-wide consumer search proves no dependency.
Fake repositories gain the same bounded semantics so service tests do not
silently exercise a different contract.

Recommended implementation sequence:

1. Define shared `BoundedResult`, cursor validation and explicit repository
   method contracts in code plus adapter/fake contract tests.
2. Implement SalesActivity bounded methods and one-pass account-health summary;
   migrate CRM Account Summary and Follow-Up Queue together to remove the N+1.
3. Add JobEvent/Document/ProcessTrial job-scoped pages and migrate Job Detail.
4. Add latest/current JobEvent queries, board revision/delta contract and
   incremental Floor Board with full-refresh recovery.
5. Add FollowUp/link/request/connection bounded queries and split Calendar
   Workspace by view/date window.
6. Replace generic MVP bootstrap with RFQ/Quote and other view-specific read
   models; retain compatibility endpoint until all current screens migrate.
7. Introduce mutation results and reduce write rescans/per-cell writes behind
   adapter contract tests.
8. Migrate Command Center to bounded summaries after authoritative definitions
   and invalidation expectations are agreed.

This order moves the measured N+1 first, then the largest history and refresh
amplifiers. Command Center follows because its metric definitions/freshness are
product decisions, while calendar work follows floor-board history despite its
large payload because MOS-118 must first measure the real activation target.

## MOS-119 performance acceptance contracts

Every implementation records the same fixture tier, functional result and
before/after measurements. A faster but different result fails.

| Future change | Before | Required after evidence |
| --- | --- | --- |
| SalesActivity health/queue | Reads, rows examined and output for account timeline, queue and metrics; HEAVY 61,501-row timeline shape | Equivalent statuses/counts/order; bounded page size; eliminate per-account rescans; record reads/rows/bytes/duration. |
| Job Detail | HEAVY 254,001 rows examined and current payload | Equivalent Job/current state; configured recent-N page and cursors; rows scale with requested associations/page rather than global histories. |
| Floor Board | Ten-refresh HEAVY 2,080,010 rows examined | Equivalent final board after replay/missed update/removal; initial snapshot plus delta row/read/byte counts; full-refresh recovery proven. |
| Calendar Workspace | HEAVY 37,500 rows and ~3.15 MB | Equivalent requested user/date/review state; bounded view payload; no all-customer/history serialization; disabled/provider-failure behavior unchanged. |
| RFQ/Quote/bootstrap | Current five full lists and RFQ/quote scenario reads/bytes | View-specific result equivalence; bounded list/detail payload and fewer unrelated reads. |
| Write path | Append/update repository calls, scans, cell writes and returned value | Same validation/version/audit/idempotency; fewer reads/writes; authoritative-result equivalence and uncertain-outcome tests. |
| Command Center | Four+ collection reads, rows examined, scalar/list outputs | Same authoritative metrics/as-of semantics; bounded exception items; fewer global reads or measured rebuildable summary behavior. |

Measure repository calls, rows examined, payload bytes, operation and
serialization duration, result count, correctness equivalence and failure
behavior at SMALL/MEDIUM/HEAVY. Local synthetic improvement is not a production
PASS: repeat representative paths on isolated Apps Script/Sheets and render the
affected UI before claiming responsiveness PASS.

## Architectural risks and required decisions

Risks include cursor invalidation under concurrent writes, helper data drifting
from canonical sheets, stale cached operational state, permission leakage from
shared summaries, audit retention competing with lookup cost, and apparent
speed gains that move excessive work into activation/rebuild processes. A
timestamp-only floor cursor can lose same-time changes; row-number cursors bind
business code to Sheets; neither is acceptable.

Brendan decisions needed before implementation:

1. Approve default/maximum page sizes per UI (proposal: decide from rendered
   operator testing, not arbitrary infrastructure defaults).
2. Confirm the deployment business timezone used for Due Today/Overdue window
   boundaries; do not infer historical timezone.
3. Confirm how long floor-board deltas must remain replayable before forcing a
   snapshot.
4. Confirm acceptable freshness/as-of display for Command Center and provider
   health summaries.
5. Decide whether the first Sheets implementation may add rebuildable helper or
   current-state sheets after direct bounded scans are measured.
6. Confirm which existing screens may retire `getMvpBootstrap` together versus
   requiring a staged compatibility period.

## Verification and stop condition

Future optimization stories must preserve canonical IDs, versions, audit,
idempotency, permissions, timezone semantics, failure isolation, tenant
portability and adapter independence. Stop if a proposed optimization requires
business services to understand sheet rows, makes cached state authoritative,
changes output semantics to improve a benchmark, or needs production mutation
without explicit approval.
