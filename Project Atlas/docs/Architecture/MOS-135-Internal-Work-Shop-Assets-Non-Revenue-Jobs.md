# MOS-135 — Internal Work, Shop Assets, and Non-Revenue Jobs

**Status:** code-level contract implemented; rendered and live runtime acceptance
pending. **Production changes:** none.

## Current-state findings

Before MOS-135, Atlas had one operational `Job`/Work Order engine but no explicit
work classification. The legacy Sheets mapping required `CustomerID` and
`QuoteID`; Quote conversion populated both and preserved the accepted Quote
revision. Generic Job creation was technically available, but downstream
commercial and presentation services commonly assumed every Job had Customer
and Quote context. Invoice creation resolved Customer/Quote unconditionally.

Operational authority was already separate from commercial records:

- Floor Board read Jobs, Customers, active Job QR tokens, and Job Events.
- My Work selected assigned Jobs directly.
- Daily Production, Shop Floor, operation transitions, labor/time-oriented Job
  fields, purchasing, material/tool readiness, and completion were Job-based.
- Traveler was, and remains, a projection over Job current state, workflow,
  append-only Job Events, and the active revocable Job QR token.
- QR locates a Job; it is not Job identity or authorization by itself.
- Machines existed as Job/workflow values, but there was no tenant-owned
  canonical Asset/Equipment aggregate.
- `atlas_jobs.customer_id` was `NOT NULL` in the accepted MOS-133E schema and no
  Asset table existed.
- Job access used `OPERATIONS_READ`, `OPERATIONS_WRITE`, and
  `SHOP_FLOOR_OPERATE`; consequential changes used the security-operation ledger
  and Job Event recovery contracts.

No evidence showed a separate Traveler aggregate, a separate maintenance
application, or a safe basis for interpreting a Job with neither explicit
classification nor commercial linkage as Internal work.

## Accepted Job contract

`workClassification` is authoritative and bounded to `CUSTOMER` or `INTERNAL`.
Legacy rows with a Customer or Quote and no classification project as
`CUSTOMER`; rows with neither are `CLASSIFICATION REVIEW REQUIRED`. Missing
commercial context never implies `INTERNAL`.

### CUSTOMER

- Customer is required and must be in the authoritative tenant.
- Quote is optional so authorized direct-entry customer work remains possible.
- When Quote is present, its Customer must match the Job Customer; accepted
  Quote conversion remains unchanged and deterministic.
- `internalWorkType` and `assetId` are absent.
- The Job remains eligible for commercial context and invoicing according to
  existing authorization and lifecycle rules.

### INTERNAL

- Customer, RFQ, Quote, accepted Quote revision, and customer acceptance are
  absent and not synthesized.
- One internal work type is required:
  `MAINTENANCE`, `REPAIR`, `FIXTURE_TOOLING`, `CAPITAL_IMPROVEMENT`,
  `R_AND_D_PROTOTYPE`, `FACILITY`, or `OTHER`.
- A title or description is required. Priority, requested/created actor, owner,
  planned start, due date, status, operations, labor/time, material/tool
  readiness, purchasing, notes, attachments where already supported, Job
  Events, QR/Traveler projection, and completion reuse the shared Job engine.
- Asset is optional and, when present, must be an active Asset in the same
  authoritative tenant at assignment time.
- Internal Jobs are not invoice- or revenue-eligible. Commercial and billing
  sections are omitted and the invoice service rejects the operation
  server-side.

Classification is immutable through ordinary update. A correction must create
a reviewed replacement Job rather than rewriting Quote, invoice, payment,
operation, labor, material, or event history. A future correction story may
allow a tightly audited pre-history correction, but MOS-135 deliberately uses
the safer deny-by-default rule.

## Asset / Equipment contract

Asset is a tenant-owned operational entity with canonical
`ASSET-<UUID>` identity, tenant-unique immutable Asset Code, name, optional
description, category, `ACTIVE`/`ARCHIVED` status, optimistic version, archive
timestamp, and created/updated timestamps and actors. Email-like or mutable
display values are never identity.

Normal selectors return only a bounded, tenant-scoped active result set ordered
by Asset Code. The Apps Script compatibility adapter caps candidate inspection
at 200 and returns at most 50; normal UI requests return 25. Archived Assets are
excluded from new assignment but remain resolvable from historical Jobs. Asset
Code cannot be edited, normal update cannot mass-assign status, stale versions
conflict, and archive is explicit.

This seam supports later asset work history, downtime, maintenance/repair cost,
preventive maintenance, utilization, and capital planning. MOS-135 does not
implement a CMMS or preventive-maintenance scheduler. A lightweight Asset
history route is deferred until a bounded Job-by-Asset read model exists.

## Operational, commercial, and UI behavior

Jobs, My Work, Floor Board, Job Canvas, Shop Floor, Traveler, Job QR, Daily
Production, purchasing, labor/material readiness, and completion retain one
engine. Internal work remains visible as capacity and is labeled textually as
`INTERNAL · <TYPE>` with optional Asset identity; the distinction is not
color-only. Floor Board adds no Asset N+1 read. Job Canvas performs at most one
selected-Job Asset resolution.

The Jobs workspace exposes an intentional Customer Work/Internal Work choice.
Customer Work routes to the familiar Customer → RFQ → Quote flow. Internal Work
shows only Internal Work Type, title/description, a bounded active Asset search,
priority, planned start, and due date. It has immediate loading, safe error and
retry states, stale-response ownership, retained form values during Asset
search, semantic labels, keyboard controls, visible existing focus treatment,
44-pixel controls, and text classification. Code-level accessibility passed;
physical screen-reader, rendered desktop/mobile, and live runtime acceptance
were not performed.

The existing Job directory search now includes title, description, internal
type, and Asset ID. PostgreSQL indexes support future bounded filters by
classification, status/due date, internal type, and Asset. Dedicated filter
controls and reports remain a later read-model story; MOS-135 does not add a
full scan or reporting bootstrap.

## Authorization and auditability

No new capability taxonomy is required. Internal Job/Asset reads use
`OPERATIONS_READ`; creation and mutation use `OPERATIONS_WRITE`; shop execution
continues to require `SHOP_FLOOR_OPERATE`. Browser-supplied tenant authority is
never trusted. Internal Job creation is a high-risk, preallocated-resource
operation; Asset creation is preallocated and Asset update/archive are explicit
audited mutations. Asset and Customer relationships are revalidated at the
persistence boundary. No `PLATFORM_*` tenant authority is introduced.

Job creation records classification and security proof. Existing status,
completion, operation, problem, resolution, and QR transitions retain
append-only Job Event/recovery behavior. Classification cannot be silently
changed; Asset reassignment is validated, and archived historical references
remain readable. MOS-135 does not rewrite historical events.

## Persistence and migration contract

Migration `0006_internal_jobs_and_assets` adds `atlas_assets`; adds Job
classification, internal type, title/description, optional Asset, priority, and
planned start; makes `customer_id` nullable; and adds tenant-safe constraints
and indexes. Database checks enforce the two authority shapes. The Asset foreign
key includes `tenant_id`. Existing rows receive the deterministic PostgreSQL
default `CUSTOMER` before nullable customer support becomes available. Direct
customer Jobs remain supported; a Quote is not universally required.

Legacy Sheets receive additive mapping definitions only. No sheet, header,
property, or row was created or changed. Existing customer-linked Jobs project
as Customer work without a production backfill. Writing new Internal Jobs or
Assets on a legacy installation requires an explicitly reviewed compatible
Jobs mapping and Assets sheet; missing configuration fails safely instead of
inventing storage.

Future Job migration tooling must classify in this order:

1. Valid explicit `CUSTOMER` or `INTERNAL` evidence that satisfies its contract.
2. Otherwise, a valid Customer or Quote link → `CUSTOMER`.
3. Missing or conflicting evidence → blocking reconciliation.

It must never infer Internal from a blank Customer, create a fake Customer,
silently drop legacy references, or dual-write. Reconciliation must report
unknown classification, invalid internal type, customer/quote mismatch,
foreign/missing Asset, invoice/revenue conflicts, and contradictory operational
history. Asset codes and IDs require deterministic conflict checks. This story
creates no production rows and performs no Vitality migration.

## Boundaries and remaining evidence

- Traveler stays a projection; no Traveler table, ID, or lifecycle exists.
- Job QR remains a revocable opaque work locator. It is not a reusable WIP Bin.
- Physical WIP Bin/QR tracking remains a separate story; future Bin assignment
  relates a reusable Bin to the authoritative Job.
- Cost accounting may later aggregate existing labor, material, purchase, and
  machine-time facts by classification/type/Asset. No GL or revenue model was
  added.
- Real PostgreSQL 17 execution/planner validation remains required because this
  environment supplied deterministic pg-mem structural validation only.
- Rendered desktop/mobile review, physical accessibility testing, and live
  runtime acceptance remain pending and require a safe non-production runtime.

**Migration handoff:** `JOB DOMAIN READY FOR MIGRATION DESIGN`. A future Job
migration story must consume this contract, the MOS-133F/G bounded migration
patterns, the real-PostgreSQL validation gate, and explicit reconciliation
evidence before any source-of-truth cutover.
