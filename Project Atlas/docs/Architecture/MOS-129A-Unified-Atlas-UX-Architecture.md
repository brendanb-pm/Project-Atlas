# MOS-129A Unified Atlas UX Architecture and Interaction Model

Release channel: **MAIN**

Baseline: `4fb08eaee0dd939d207220c4ae5976027d725306`
Status: architecture and non-production prototype only

## Decision

Atlas will use one application shell with five complementary modes:

1. **Mission Control** — organizational exceptions and decisions.
2. **Record Canvas / 360** — durable context for one business object.
3. **My Work** — the signed-in person's execution queue.
4. **Shop Floor** — touch-first execution for current production work.
5. **Command / Search** — a global accelerator into authorized records and safe workflows.

These are presentation modes over existing canonical services, IDs, versions, capabilities, audit, and recovery. They are not new domains, sources of truth, or client-side authority. The governing questions are: **What needs attention? What am I working on? What is blocking it? What happens next?**

## Governing principles

- Put action before administration and exceptions before passive metrics.
- Carry known Customer, RFQ, Quote revision, Job, Vendor, Invoice, Firearm, and tenant context forward.
- Show one obvious primary action per context; subordinate the rest.
- Present human-readable relationships, with canonical IDs as optional traceability or power-user search terms.
- Keep business status separate from request/system status.
- Keep surrounding context usable during loading, validation, failure, conflict, or reconciliation.
- Use role/capability information to prioritize presentation only. Every read and mutation is still authorized by the server.
- Prefer bounded contextual read models and progressive detail over global browser datasets.
- Use density to support comparison and execution, not spreadsheet-like CRUD.
- Adapt the task to the device; do not merely stack a desktop dashboard.

## Mode contracts

### Mission Control — “What needs attention now?”

Audience: owner, manager, lead. Default content is an ordered, bounded attention queue: blocked production, overdue/due-today work, approvals, Quote/RFQ decisions, Follow-Ups, purchasing and finance exceptions, Firearms reconciliation, and actionable system health. Each item contains reason, consequence, owner, age/due state, readable record context, and one next action. Compact metrics summarize and filter the queue; they never displace it. Healthy/empty states explain that no intervention is required.

Mission Control does not become a replacement for record detail, a reporting warehouse, or a personal task list. Selecting an item opens the relevant Record Canvas or specialized mode with the originating filter preserved.

### Record Canvas / 360 — “What is this and what happens next?”

The canvas is the primary workspace after choosing a Customer, Quote, Job, Vendor, Firearm, Invoice, or Purchase Request. A shared frame contains:

- breadcrumb and safe Back destination;
- contextual header: readable identity, secondary canonical reference, owner, lifecycle/status, due state;
- one primary action derived from canonical state and returned capabilities;
- attention/blockers immediately below the header;
- object-specific sections for core detail, related work, documents, billing/commercial information, and append-only activity/history;
- side panel or drawer for short secondary tasks that should not destroy context;
- links that open related canvases with a contextual backlink; modifier/new-tab behavior remains native.

The canvas URL identifies the object and optional section. Reload, deep link, Back, and Forward must reproduce the same authorized context. Unavailable or unauthorized records use indistinguishable safe states and never display stale prior content.

The pattern is shared, but sections remain domain-specific:

| Canvas | First sections | Typical primary action |
| --- | --- | --- |
| Customer | Overview, activity, commercial work, jobs, billing, documents | Create RFQ or Follow-Up |
| Quote | Revision lifecycle, customer offer, internal costing, sources, history | Issue exact revision / create successor |
| Job / WO | Overview, production, purchasing, documents, billing, history | Start or advance current operation |
| Vendor | Overview, capabilities, contacts, estimates, purchasing history | Create Purchase Request / add estimate |
| Firearm | Identity, custody, associated work, regulatory events, documents | Context-valid custody/disposition action |
| Invoice | Overview, receipts, related Job/Quote, history | Record Payment |
| Purchase Request | Need, Vendor, approval, receipt, history | Approve or Record Receipt |

### My Work — “What do I personally need to execute?”

My Work is a bounded, capability-filtered queue composed from assignments and responsibilities: due today, overdue, blocked, waiting on me, approvals, Follow-Ups, and production operations. It differs from Mission Control by ownership: organizational risk belongs in Mission Control; an individual's executable commitments belong in My Work. Queue items support fast complete/open/defer actions only where the canonical workflow permits them. Filters are remembered per user and encoded safely enough for reload/back behavior.

### Shop Floor — “What do I do to this Job now?”

Shop Floor is a specialized, touch-oriented mode entered from My Work, a Job Canvas, or QR/scanner lookup. It prioritizes WO/Job, Customer, current operation, next valid action, due state, operator, readiness, blockers, problem reporting, and completion. Commercial, finance, and administration stay secondary. Targets are at least 44 pixels and normally larger; primary operation actions remain visible without precision scrolling. QR state is revalidated on entry and every command uses canonical authorization, version/idempotency, and uncertain-outcome reconciliation.

### Command / Search — “Take me to the thing or safe action.”

A persistent launcher searches bounded, authorized summaries across Customer, RFQ, Quote, Job, Invoice, Purchase Request, Vendor, Firearm, FFL, member, and document. Results show type, readable label, useful disambiguation, status, and context. Known business IDs are accepted but never required. Grouped results load progressively and never expose foreign-record existence.

Safe commands include `Open VMC-0128`, `Find serial ABC123`, `Create Follow-Up`, `Create Quote for H2`, and `Open overdue work`. Commands resolve to an existing contextual workflow; they do not directly assert tenant, actor, capability, status, or consequential mutation. Consequential actions still require their domain form, exact record/revision proof, confirmation where appropriate, and recovery behavior.

## Canonical global shell

Desktop uses a persistent compact left rail and a short top header. The rail contains **Home**, **My Work**, **Customers**, **Commercial**, **Production**, **Purchasing**, **Finance**, optional **Firearms**, and **Administration**. Child entities such as RFQs, Quotes, Vendors, and Invoices appear within group landing pages, command results, or record relationships rather than all competing at top level.

The header contains the global command trigger, current tenant, current contextual record when one exists, attention entry point, and user/session menu. Tenant switching is an explicit authoritative session action, never a client filter. Mobile uses a bottom or compact menu for Home, My Work, Search, and the current mode; deeper destinations live in an accessible sheet. Shop Floor may suppress ordinary chrome while retaining tenant/session identity and an exit path.

## Persona presentation model

| Persona | Default | Primary queue/actions | De-emphasized presentation |
| --- | --- | --- | --- |
| Owner / Manager | Mission Control | exceptions, approvals, blocked work, risk | routine record administration |
| Sales / PM | My Work | Follow-Ups, RFQs, Quote revisions, Customer/Job context | system health and floor-only controls |
| Shop Operator | Shop Floor / My Work | assigned operation, readiness, problem, complete | costing, finance, tenant administration |
| Purchasing | My Work | requests, Vendor context, approvals, receipt | unrelated CRM/admin surfaces |
| Finance | My Work | invoices, payment attempts, finance exceptions | production controls and internal routing |
| Tenant Admin | Administration | users, roles, modules, health/configuration | routine operational queues unless also capable |

Capabilities returned by trusted server context determine available data and actions. Persona choice only orders and labels what the user is already authorized to access; hidden UI is never an authorization control.

## Navigation and context rules

- Canonical routes identify mode, record type, record ID, and optional section using stable parameters.
- List/filter state is preserved in history or safe session presentation state; Back/Forward always reconciles URL and rendered content through an authorized read.
- Breadcrumbs express business hierarchy, not storage hierarchy: `Customers / H2 / Quotes / Q-1042`.
- Related-record links open the related canvas and retain a `Back to …` context label; no mutation occurs during navigation.
- Reload and deep links use the same bounded read and capability validation as ordinary navigation.
- Stale/deleted/inaccessible records produce one safe unavailable state. Foreign existence is not distinguishable.
- Disabled modules say the module is unavailable and offer authorized alternatives. Unknown routes never silently masquerade as Home.
- Mobile transitions preserve a compact context header; drawers become full-screen task sheets with explicit Cancel/Back.

## Action hierarchy

| Level | Use | Examples |
| --- | --- | --- |
| Primary | one state-appropriate next action | Create Quote, Start Operation, Record Payment |
| Secondary | nearby supporting work | Edit, Assign, Add Document |
| Tertiary | inspection or occasional utility | History, Export, View details |
| Consequential | durable/high-impact action with explicit context | Issue Quote revision, Dispose Firearm, Accept Quote, Record Receipt |

Consequential actions name the record, effect, and authoritative target. They disable duplicate submission, distinguish failure from uncertainty, reconcile before replay, and restore safe controls. Destructive styling is reserved for destructive outcomes, not every important action.

## Status and attention model

Business status uses text plus shape/icon and color: **Normal**, **Due soon**, **Overdue**, **At risk**, **Blocked**, **Waiting**, **Completed**, **Cancelled**, and **Unknown**. Attention is separately ranked as **Critical blocking**, **Action required**, **Due/overdue**, or **Informational**. System/request state uses **Loading**, **Saving**, **Confirmed**, **Validation needed**, **Permission denied**, **Failed—safe to retry**, **Uncertain—reconciling**, **Conflict—refresh required**, and **Unavailable**. A request spinner never substitutes for business status.

## Failure and recovery contract

Every mode defines applicable loading, empty, validation, permission, transient failure, uncertain outcome, stale conflict, session expiry, cancel/back, retry, and unavailable-reference states. The universal sequence is:

`Failure → stable surrounding context → clear guidance → authoritative refresh/reconciliation when needed → safe retry or alternate action`.

Draft input remains when safe. Busy ownership belongs to the active request. Stale callbacks cannot replace current state. Session expiry offers the existing reauthentication flow and preserves only safe route/draft context. Uncertain consequential operations never expose a blind retry. Historical unavailable relationships remain readable and never rebind.

## Canonical selector pattern

Customer, RFQ, Quote, Job, Vendor, Firearm, FFL, Invoice, Purchase Request, member, workflow operation, and document selectors share: visible label; debounced bounded search; independent request generation; loading/results/no-results/error; keyboard and touch operation; explicit selection; readable selected and unavailable-historical states; and server validation. Free text is a query, never a canonical relationship. IDs are accepted as power-user queries and shown secondarily where helpful.

## Responsive task model

| Viewport | Mission Control | Record Canvas | My Work | Shop Floor | Command/Search |
| --- | --- | --- | --- | --- | --- |
| 1440+ | rail, attention + compact supporting columns | sticky context, main canvas + contextual side panel | queue + preview/detail split | focused board or work card | centered overlay with grouped results |
| ~1024 landscape | compact rail, two-column attention | compact header, main + collapsible side panel | queue/detail split | large touch actions, limited chrome | wide sheet/overlay |
| ~768 portrait | attention-first single column; metrics below | context + primary action, collapsible sections | full-width queue, detail as sheet | one operational task at a time | full-height command sheet |
| ~390 mobile | top attention items before summaries | compact sticky identity/action; task sections | today/overdue first; filters in sheet | scanner/job/action focus, largest targets | full-screen search with recent/suggested actions |

No critical data depends on hover, color, horizontal viewport space, or desktop-only panels. Tables become intentional comparison scroll regions or task-specific cards—not indiscriminate vertical stacks.

## Current surface migration matrix

| Current surface | Decision | Future placement |
| --- | --- | --- |
| Command Center | **EVOLVE** | Mission Control; retain bounded attention model |
| Customers | **EVOLVE** | Customer list + Customer Canvas |
| Sales Activity | **MERGE** | Customer Canvas activity and My Work capture action |
| Follow-Ups | **EVOLVE** | My Work queue; Customer Canvas relationship |
| RFQs | **MERGE** | Commercial landing + Customer/Quote context |
| Quotes / Quote Builder | **MERGE** | Quote Canvas with revision-safe lifecycle |
| Jobs | **EVOLVE** | Job Canvas; entry to production and Shop Floor |
| Daily Production | **MERGE** | Manager Production landing and My Work slices |
| Shop Floor | **SPECIALIZED MODE** | preserved execution mode linked to Job Canvas |
| Floor Board | **SPECIALIZED MODE** | large-display production projection |
| Operations Dashboard | **MERGE** | Mission Control/Production exception views |
| Purchasing | **EVOLVE** | Purchasing landing + Purchase Request Canvas |
| Invoices | **EVOLVE** | Finance landing + Invoice Canvas |
| Vendor | **EVOLVE** | Vendor directory + Vendor Canvas |
| Firearms | **SPECIALIZED MODE + CANVAS** | module landing, Firearm Canvas, compliance attention |
| Tenant Admin | **EVOLVE** | Administration landing; role/module/health workspaces |
| Ideas | **DEPRECATE AS TOP LEVEL** | optional secondary workspace/feedback entry |
| Traveler | **SPECIALIZED MODE** | contextual Job document/print view; not routine navigation |

Duplicate landing/dashboard/list surfaces are consolidated in presentation only after their existing read and mutation contracts are preserved by regression tests.

## Incremental roadmap

1. **MOS-129B — Unified shell and Mission Control:** introduce the shell behind existing routes; migrate Command Center attention; preserve legacy route aliases and authorization.
2. **MOS-129C — Record Canvas foundation:** create shared context header, section routing, related-record link/back contract, loading/unavailable states; pilot Customer and Job.
3. **MOS-129D — My Work:** compose bounded personal queues from existing services; migrate Follow-Ups, approvals, and assignments incrementally.
4. **MOS-129E — Shop Floor integration:** connect Job Canvas, QR entry, Daily Production, Shop Floor, Traveler, and Floor Board without changing command/recovery semantics.
5. **MOS-129F1 — Commercial/finance/purchasing canvases:** migrate Quote, Vendor, Purchase Request, and Invoice around canonical revision/payment services.
6. **MOS-129F2 — Firearms/admin canvases and Command/Search:** migrate specialized context, then add bounded federated search and safe command routing.
7. **MOS-129G — Independent UX acceptance:** cross-persona, route, failure/recovery, responsive, security, and representative-performance gate.

Every story migrates one bounded slice, keeps proven services authoritative, supports rollback to the prior route, and removes an old presentation path only after equivalence and navigation evidence pass. No big-bang replacement is permitted.

## Performance implications

Each shell badge, queue, search group, canvas header, section, and history uses a purpose-built bounded read model. The shell does not preload business collections. Search fans out only to authorized bounded endpoints with per-group limits and cancellation; it does not serialize all records. Canvas relationships are batch-hydrated from deduplicated IDs, histories paginate, and background refresh is scoped to the visible section. Polling is reserved for measured operational needs and uses snapshot/delta contracts where available.

MOS-120 debt remains relevant: generic MVP bootstrap, full repository scans in some adapters, calendar/global relationship reads, Job history, and Floor Board refresh can undermine the intended experience. Those are measured adapter/read-model migrations, not reasons to weaken canonical semantics or block this architecture prototype.

## Help and future manual architecture

- **Role quick starts:** first-day paths for manager, Sales/PM, operator, purchasing, finance, and tenant admin.
- **Task guides:** outcome-led topics such as “Issue a Quote revision” or “Recover an uncertain payment,” aligned to UI verbs.
- **Contextual help:** section-level explanations, status meanings, and recovery links keyed by stable help-topic IDs rather than route implementation names.
- **Troubleshooting:** symptom → safe interpretation → recovery → escalation, with no secrets or storage internals.
- **Admin guide:** users, roles/capabilities, modules, configuration health, integrations, activation, and audit expectations.
- **Module guides:** Firearms and future optional modules remain clearly scoped from Atlas Core.
- **Glossary:** one canonical vocabulary for Customer, RFQ, Quote revision, Job/WO, operation, Vendor, and attention states.

MOS-130 or equivalent should author the full manual from these contracts and validate terminology against shipped labels.

## Decisions requiring Brendan

1. Confirm **My Work** as the default for execution personas and **Mission Control** for manager personas; otherwise choose a tenant-wide default with a remembered personal override.
2. Confirm whether the desktop left rail may collapse to icons or should always retain labels for learnability.
3. Confirm whether command search launches with `/`, `Ctrl/Cmd+K`, or both (prototype uses both conceptually).
4. Confirm whether Ideas remains a tenant-enabled secondary workspace or moves entirely to feedback/admin tooling.
5. Confirm first Record Canvas pilot after the shared foundation: recommended **Job**, then **Customer**.

## Prototype and safety boundary

`docs/prototypes/MOS-129A-Unified-Atlas-UX.html` demonstrates all five modes using synthetic data. `tools/ui/unified-atlas-ux-preview.js` serves that single file locally for viewport review. Neither artifact is included by Apps Script, registered as a route, connected to services, or deployed. The prototype contains no production identifiers, tenant data, credentials, mutation calls, or schema assumptions.

## Acceptance boundary

MOS-129A selects architecture, vocabulary, interaction contracts, migration order, and representative presentation. It changes no production route, UI template, service, repository, schema, configuration, deployment, or data. Subsequent implementation stories require their own code, rendered, security, recovery, and performance evidence.
