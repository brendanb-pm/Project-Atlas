# ACTIVATION-V1-R6 Route Recovery and MOS-133 Handoff

## Evidence and scope

R6 used the reported live white-page failure plus executable/static inspection of the current MAIN shell. No live deployment, production data, module configuration, or real Apps Script/Sheets timing was changed or claimed. The R5 authentication boundary remains authoritative.

## Route failure matrix

| Destination | Route/template | Initial state before R6 | Demonstrated risk/class | R6 terminal contract |
|---|---|---|---|---|
| Mission Control | `home` / `Index` | Visible shell/loading | Existing bounded Command Center path | Loaded, empty, partial, or error |
| My Work | `my-work` / `MyWork` | Visible loading | Existing recovery already adequate | Loaded, empty, expired, or retry |
| Customers, RFQs, Quotes, Jobs, Invoices | commercial routes / `CommercialWorkflow` | Detail loader persisted when structured/transport failure occurred | MISSING_FAILURE_HANDLER | Loading, empty, expired, or actionable error |
| Sales Activity | `sales-activity` / `SalesActivity` | Shared links depended on page-level base targeting; this page lacked it | ROUTE_RESOLUTION | Explicit top-level navigation plus page fallback |
| Job Canvas | `job` / `JobCanvas` | Visible loading and root recovery already present | Existing recovery adequate | Loaded, empty, expired, or retry |
| Daily Production | `daily-production` / `DailyProductionBoard` | Structured failure left loading buckets | MISSING_FAILURE_HANDLER / MISSING_CONFIGURATION | Loaded, empty, expired, unavailable, or retry |
| Operations | `operations-dashboard` / `OperationsDashboard` | Root structured failure left summary loading and sections empty | MISSING_FAILURE_HANDLER | Loaded, partial, empty, expired, or retry |
| Floor Board | `floor-board` / `FloorBoard` | First-load failure claimed last-known data even when none existed | EMPTY_STATE / MISSING_FAILURE_HANDLER | Loaded/last-known, empty, or retry |
| Purchasing | `purchasing` / `PurchasingWorkspace` | Visible loading and recovery already present | Existing recovery adequate | Loaded, unavailable, expired, or retry |
| Tenant Administration | `admin` / `AdminSettings` | Root or nested failure left Loading/blank panels | MISSING_FAILURE_HANDLER | Loaded, partial, unavailable, expired, or retry |
| Unsupported/module unavailable | route gate | Visible unsupported/access templates | Existing recovery adequate | Unsupported or access unavailable |

The shared cause was not one backend exception. The shell had no explicit top-level link ownership or route-transition state, while several workspaces handled transport errors only in a notice and did not replace their loading/blank content. Template evaluation also lacked an Atlas error boundary.

## Recovery contract

Sidebar and brand links explicitly target the top-level Apps Script page. A route click synchronously announces and displays the selected workspace transition, marks the document busy, and changes to a “taking longer” recovery state after eight seconds without polling. Navigation-model failures, uncaught client errors, and unhandled promise rejections render a generic retry surface. Template evaluation failures render a minimal server-generated `RouteError` page. Destination handlers distinguish loading, empty, partial/unavailable, session-expired, and actionable retry states. Safe prior Floor Board content remains visible on refresh failure; a failed first load never claims cached data exists.

All server retries re-enter the existing callable authorization boundary. Error surfaces omit stack traces, record identifiers, tenant/user identifiers, capabilities, and persistence details. Existing request-generation checks continue to reject stale commercial/My Work responses; the shared route transition performs a top-level navigation so an earlier page cannot overwrite the new page. R5 strict authentication and tenant/capability resolution were not weakened.

## Timing and responsiveness evidence

Only code-level timing was available:

- T0 route activation and T1 visible route status occur in the same synchronous click task.
- T2 remains each destination’s existing first `google.script.run` call.
- At eight seconds without page replacement, the shell changes from ordinary loading to “taking longer than expected” with Retry.
- T3/T4 and server-call durations were not measured against live Apps Script/Sheets and remain activation evidence.

No polling, retry loop, global directory, browser dataset, or new bootstrap read was added. Floor Board’s existing 30-second refresh remains unchanged and is not generalized.

## MOS-133 observational handoff

- `Index.html` still uses `getMvpBootstrap` for legacy non-Command-Center sections. Retire those legacy loads behind purpose-built projections rather than expanding this dependency.
- Operations Dashboard loads `getShopDashboard` and then `getShopOperatorWorkloads` sequentially. A bounded combined projection is a strong batching candidate.
- Administration loads the base workspace and tenant-operations workspace sequentially. Measure before combining because capabilities differ.
- Command Center and My Work expose bounded browser projections, but their repository composition should be timed with representative sheet sizes.
- Commercial directory reads are browser-bounded, while Sheets repositories may still scan full entity sheets underneath. Customers, Quotes, Jobs, and Invoices need indexed tenant/status/date lookup evidence.
- `FloorBoardService_` composes Jobs, Customers, QR tokens, and Events using four broad repository reads. Daily Production also begins from the Job domain. Job/operation/due-date projections are the strongest first indexed relational candidate.
- Next likely relational candidates are commercial directory/search projections and My Work aggregation. Preserve service/repository contracts and do not make SQL a UI dependency.

MOS-133 should capture T2–T4 and server durations with representative data, row counts, payload bytes, repository read counts, and long-tail latency before choosing a migration sequence. Existing full-sheet adapter debt is reported, not hidden by the new loading UX.
