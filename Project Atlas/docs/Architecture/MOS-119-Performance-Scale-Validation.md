# MOS-119 Performance, Scale, and Responsiveness Validation

## Scope and status

Release channel: **MAIN**. Baseline: `246d3741aef899458f4bc823e3557be667930b75`.
This story adds deterministic synthetic characterization and an architecture
audit. It does not optimize product code, use production data, run against the
Apps Script/Sheets runtime, activate providers, or establish production SLAs.

| Dimension | Status | Evidence boundary |
| --- | --- | --- |
| CODE / FUNCTIONAL | PASS | Existing regression suite plus harness tests pass. |
| PERFORMANCE HARNESS | PASS | Deterministic relational fixtures and 13 measured workloads are repeatable. |
| PERFORMANCE / RESPONSIVENESS QA | PARTIAL | In-memory Node characterization exposes growth and payload shape; Apps Script, Sheets, browser, concurrency, and providers remain unmeasured. |
| RENDERED PERFORMANCE QA | NOT PERFORMED | No deployed non-production rendered target was used. |

No current production **BLOCKER** is proven by these synthetic measurements.
The HIGH ROI findings should be measured on the MOS-118 non-production target
before writable-provider activation and before materially larger imports.

## Method

`tools/performance/atlas-performance-harness.js` generates deterministic,
clearly synthetic records and executes repository-shaped workloads. Each
measurement records operation time, serialization time, repository reads and
writes, rows examined, result count, and serialized payload bytes. Timing is a
local algorithmic indicator only: it excludes Apps Script startup, Sheets RPCs,
network transfer, browser rendering, locks, and provider latency. Row counts,
read/write counts, and payload sizes are the more portable evidence.

### Workload tiers

The tiers model relationship-rich history, not independent row piles. SMALL is
a current small-shop shape; MEDIUM represents several years; HEAVY is an upper
working envelope for a 10–20 person shop; STRESS deliberately exceeds the
normal target and is opt-in (`--stress`). These are test assumptions, not
claims about production volume.

| Entity/history | SMALL | MEDIUM | HEAVY | STRESS |
| --- | ---: | ---: | ---: | ---: |
| Customers | 100 | 1,000 | 3,000 | 10,000 |
| SalesActivities | 1,200 | 15,000 | 60,000 | 250,000 |
| FollowUps | 300 | 4,000 | 15,000 | 60,000 |
| RFQs | 250 | 3,000 | 10,000 | 40,000 |
| Quotes | 350 | 4,500 | 16,000 | 65,000 |
| Jobs | 200 | 2,500 | 8,000 | 30,000 |
| JobEvents | 3,000 | 50,000 | 200,000 | 1,000,000 |
| Document metadata | 800 | 8,000 | 30,000 | 120,000 |
| ProcessTrials | 300 | 5,000 | 20,000 | 80,000 |
| Purchases | 400 | 5,000 | 20,000 | 80,000 |
| Cash receipts | 600 | 8,000 | 30,000 | 120,000 |
| Calendar links | 150 | 2,000 | 7,500 | 30,000 |
| Calendar sync events | 1,000 | 20,000 | 80,000 | 350,000 |

Relationships include Customer -> SalesActivity/FollowUp/RFQ, RFQ -> Quote ->
Job, Job -> JobEvent/Document/ProcessTrial/Purchase, receipts -> Customer, and
FollowUp -> CalendarFollowUpLink/CalendarSyncEvent.

### Operator scenarios

The harness covers customer open/timeline, follow-up queue, CRM search, RFQ
list/search, RFQ and quote preparation, Jobs list, job detail/history, Command
Center aggregation, shop-floor status mutation, ten floor-board refreshes,
FollowUps/Today, correlation lookup, and sync-event persistence.

## Characterization results

Run on 2026-08-08 with the bundled Node runtime. Milliseconds are illustrative
and may vary; rows and bytes describe the scaling shape.

| Scenario | SMALL rows / payload | MEDIUM rows / payload | HEAVY rows / payload | Observed shape |
| --- | ---: | ---: | ---: | --- |
| Customer + timeline | 1,251 / 2.4 KB | 15,501 / 3.0 KB | 61,501 / 4.0 KB | Linear history scan for a tiny result. |
| Follow-up queue | 300 / 18.9 KB | 4,000 / 253.9 KB | 15,000 / 947.6 KB | Linear scan and growing browser payload. |
| RFQ open + quote prep | 1,276 / 0.6 KB | 14,001 / 0.6 KB | 51,001 / 0.7 KB | Three scans for a very small result. |
| Job detail + history | 4,201 / 2.9 KB | 64,251 / 3.5 KB | 254,001 / 4.4 KB | History-sensitive linear scans. |
| Command Center | 1,500 / 56 B | 19,500 / 61 B | 73,000 / 62 B | Four full collections for a scalar summary. |
| Floor board, 10 refreshes | 32,010 / 9.5 KB | 525,010 / 118.8 KB | 2,080,010 / 380.0 KB | Repeated full reads amplify history growth. |
| Calendar FollowUps + Today | 750 / 78.4 KB | 10,000 / 849.8 KB | 37,500 / 3.15 MB | Three full lists; serialization dominates locally. |
| Calendar correlation lookup | 501 / 168 B | 10,001 / 164 B | 40,001 / 173 B | Linear column scan; small returned payload. |

Representative HEAVY local operation/serialization times were 3.394/0.041 ms
for job detail, 45.916/0.925 ms for ten floor refreshes, and 0.576/6.359 ms
for calendar workspace reads. These are **not** Apps Script + Sheets latency
and are not PASS thresholds. The 3.15 MB calendar payload and millions of rows
examined are stronger risk signals than local CPU timing.

## Architecture hotspots and retrofit audit

| Classification | Workflow / evidence | Likely cause and operator impact | Recommended action |
| --- | --- | --- | --- |
| HIGH ROI | Generic `list` and `findById`; nearly every tier grows linearly | `SheetsRepository.list()` reads the full table; `findById()` scans it. Remote Sheets cost will dominate local CPU. | Add query/paging contracts at repository boundaries, retaining the Sheets adapter. Separate story. |
| HIGH ROI | Customer timeline: 61,501 rows examined at HEAVY for ~one account | `SalesActivityRepository.listByCustomerId()` filters a full list. Account open latency grows with global history. | Add bounded account/date query and timeline pagination. |
| HIGH ROI | Sales metrics | `metrics()` reads activities, calls another full open-list pass, then calls `accountFollowUpHealth()` per account; each health call performs another full activity scan. This is an N+1 path. | Calculate latest activity/queue/metrics from one pass or a maintained summary after measurement. |
| HIGH ROI | Job detail and floor board: 254,001 rows for detail; 2.08M over ten HEAVY refreshes | JobEvents, documents, and trials are globally listed then filtered; dashboard refresh rereads full event history. | Add job-scoped/paged history and incremental board refresh/watermark. |
| HIGH ROI | Calendar workspace: 3.15 MB HEAVY payload | Endpoint loads all links, pending requests, FollowUps, and Customers; client receives more than the active view needs. | Split/lazy-load views, bound Today ranges, and return summaries. |
| HIGH ROI | Inserts/updates | Insert appends then rescans by ID. Update scans, writes each changed cell separately, then rescans. | Return known inserted data safely; batch contiguous updates where compatible; preserve version checks. |
| MONITOR | RFQ/Quote, ProcessTrial, purchasing, receipts | Service methods commonly list entire history and filter/aggregate in Apps Script. Acceptable at small volume; history makes it linear. | Capture non-production Sheets timings by tier; prioritize only demonstrated latency. |
| MONITOR | Calendar correlation/idempotency | MOS-118A avoids a full-record list but `findFirstByFields` still scans the provider/correlation range linearly. | Measure sync-event growth; consider bounded retention/index strategy without weakening audit. |
| MONITOR | Provider orchestration | Writable adapters execute through request orchestration; real network latency/failure can affect perceived save completion. | Measure in 118B-D and keep MOS state usable with pending/reconciliation status. |
| MONITOR | Locks/concurrency | Cash receipt and sync/idempotency paths use script locks. Contention is not represented by the harness. | Exercise concurrent non-production writes and record wait/timeout behavior. |
| NO ACTION | Dashboard in-memory grouping after reads | Current grouping/indexing is approximately linear and avoids obvious nested joins once data is loaded. | Preserve; optimize storage access first if evidence warrants. |
| NO ACTION | Disabled/no-calendar and iCal read-only operation | Core MOS remains usable without writable providers; no provider round trip is required. | Retain regression coverage. |

No unexplained superlinear algorithm appeared in the synthetic scenarios other
than the known SalesActivity metrics N+1 composition. Most risk is repeated
linear full-table work across a remote spreadsheet service. Payload growth adds
browser parsing/rendering risk independently of backend duration.

## Sheets / Apps Script boundary and migration triggers

Sheets remains appropriate until measured operation or reliability evidence
crosses the product's needs. Do not migrate merely because SQL can scale
further. Escalate the adapter decision when representative non-production or
production-safe telemetry repeatedly shows one or more of:

- normal customer/job/follow-up views have visibly disruptive latency after
  query/paging and redundant-read remedies;
- Apps Script executions approach or hit documented runtime/service quotas;
- full scans remain necessary for common indexed predicates at actual volume;
- event/audit history growth makes retention, lookup, or reconciliation
  unreliable;
- concurrent updates cause material lock waits, collisions, or write
  contention;
- required joins/search/order/pagination cannot be implemented reliably behind
  the current adapter;
- payload size or serialization makes browser interaction unacceptable even
  after endpoint shaping;
- provider recovery/audit workloads cannot meet operational reliability needs.

The repository/service boundary must remain the migration seam. Any future
adapter change must preserve IDs, relationships, versions, audit history,
failure behavior, and rollback.

## Prioritized remediation backlog

1. **Measure real Sheets calls (HIGH ROI):** add non-production per-operation
   RPC/read/write/row/payload timings around the repository boundary. No
   architecture change.
2. **Bound high-history reads (HIGH ROI):** account activities, JobEvents,
   FollowUps, calendar links/requests, process trials, and documents. This adds
   repository query/pagination contracts but preserves the storage adapter.
3. **Remove SalesActivity metric N+1 (HIGH ROI):** single-pass aggregation or a
   safely maintained summary, with business-result regression tests.
4. **Shape bootstrap/calendar payloads (HIGH ROI):** view-specific lazy loads,
   range filters, and pagination; validate rendered/perceived responsiveness.
5. **Incremental floor-board refresh (HIGH ROI):** use a safe change watermark
   or bounded active-job event query; preserve missed-update recovery.
6. **Batch repository mutations (MONITOR until measured):** reduce per-cell
   writes and post-write scans without weakening version/idempotency behavior.
7. **Concurrency and provider-latency study (MONITOR):** measure locks, slow
   providers, uncertain outcomes, and independent MOS progress in the isolated
   MOS-118 environment.

Each item warrants a separate, bounded story if evidence confirms operator
impact. MOS-119 does not implement them.

## Remaining non-production and rendered measurements

Before calling performance QA PASS, run the same tier shapes (or safely scaled
equivalents) in an isolated Apps Script workbook and capture cold/warm execution
time, Sheets calls, rows/bytes, lock waits, quotas/errors, and provider duration.
Render FollowUps, Today, Calendar Settings, Command Center, Jobs/job history,
customer timeline, RFQ/quote, and floor board at 1440x900, 1024x768, 768x1024,
and 390x844. Record initial load, navigation, mutation acknowledgement,
progress, repeated refresh, long-session behavior, browser payload/render cost,
and slow/unavailable-provider recovery. Establish targets only after these
baselines show what is both achievable and acceptable to operators.

## Reproduction

From the application root, run:

```powershell
node tests/performance-harness.test.js
node tools/performance/atlas-performance-harness.js
node tools/performance/atlas-performance-harness.js --stress
```

The default characterization omits STRESS to keep routine validation fast.
