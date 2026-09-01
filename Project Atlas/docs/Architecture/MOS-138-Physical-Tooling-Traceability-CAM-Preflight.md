# MOS-138 — Physical Tooling Traceability and CAM Preflight

## Status and boundary

MOS-138 adds the canonical PostgreSQL model, provider/service boundary, deterministic preflight engine, and operator workspace for physical cutting-tool identity and as-built geometry. It does not deploy or cut over production, add CNC/controller integration, generate CAM, or replace the accepted Job, Operation, Traveler projection, QR authority, or Asset identity models.

Production changes: **NONE**.

The Apps Script workspace is a source-level operator surface and rendered validation harness. Its data contract is intentionally the PostgreSQL tooling service; it does not introduce a new Sheets tooling store. Live route binding remains gated on the accepted PostgreSQL edge activation work.

## Domain model

The ordered `0007_physical_tooling_traceability` migration separates the identities that production must not collapse:

| Concept | PostgreSQL authority | Meaning |
| --- | --- | --- |
| Catalog tool | `atlas_tool_types` | Reusable nominal definition: class, catalog reference, nominal dimensions, material/coating, units, lifecycle |
| Physical cutter | `atlas_tool_instances` | Exact tenant-owned cutter, condition, current verified-measurement reference, storage, notes, attachments, version/lifecycle |
| Measurement | `atlas_tool_measurements` | Append-only observed geometry with timestamp, operator, method/source, and verification provenance |
| Condition event | `atlas_tool_condition_events` | Append-only condition transition with actor, reason, time, and correlation |
| Holder | `atlas_holders` | Persistent identity of the exact physical holder, independent of its cutter |
| Assembly | `atlas_tool_assemblies` | Time-bounded cutter-in-holder association and verified geometry snapshot/reference |
| Machine assignment | `atlas_tool_machine_assignments` | Time-bounded assembly-to-existing-`atlas_assets` machine/pocket association |
| Operation requirement | `atlas_operation_tool_requirements` | CAM/process expectation attached to existing `atlas_job_operations` |
| Execution | `atlas_operation_tool_executions` | Immutable record of the exact cutter, assembly, holder, machine/pocket, geometry, condition, preflight, operator, and correlation that ran |
| Physical identifier | `atlas_tool_identifiers` | Revocable, hashed opaque QR/Data Matrix token resolving an authorized cutter or holder projection |

All mutable/read tooling relationships are tenant-scoped. Composite foreign keys make cross-tenant type, cutter, holder, assembly, Asset, Operation, measurement, and execution stitching impossible. Canonical prefixed UUID-shaped IDs are checked in PostgreSQL and validated before service calls. Historical records are archived or ended; they are not destructively deleted.

## Nominal versus actual geometry

Nominal and actual geometry never overwrite one another:

- nominal dimensions remain on `atlas_tool_types`;
- observed dimensions are appended to `atlas_tool_measurements`;
- a physical cutter references the current verified measurement;
- an assembly snapshots the verified geometry used at install/verification;
- an execution snapshots nominal and actual geometry plus the cutter condition used at run time.

Changing or remeasuring a cutter therefore cannot rewrite the explanation of an earlier operation. `REGROUND` and `MODIFIED` transitions mark current verification stale. Precision work requiring verified actual geometry does not become ready until that chain is restored.

## Assembly and machine lifecycle

Partial unique indexes allow only one active cutter per holder and one active holder assembly per cutter. Removal uses optimistic version checks and preserves the historical assembly. Moving a cutter requires ending its active assembly before installing a new one.

Machine identity reuses MOS-135 `atlas_assets`; MOS-138 creates no competing equipment table. Assignment history records load/unload actor and time. Partial indexes enforce one active assignment per assembly and, where a pocket is supplied, one active assembly per machine/pocket. Unassignment uses optimistic version checks. Operation execution retains the assignment snapshot after later unload or relocation.

## Operation and Traveler integration

Tool requirements attach directly to `atlas_job_operations`. Traveler remains a projection of the Job/Operation aggregate; no `atlas_travelers` table or competing identity was added. A requirement can identify the catalog type, optional holder, CAM reference/tool number, expected diameter, radial stock to leave, verified-actual requirement, and a bounded JSON policy.

The execution record is append-only and provides the physical-tool portion of operation history. It records only `READY` or explicitly accepted `WARNING` preflight outcomes; blocked, stale, unverified, or unassigned states cannot be recorded as an execution by `ToolingTraceabilityService`.

## Preflight policy

`evaluateToolingPreflight` is pure and deterministic. It returns `READY`, `WARNING`, `BLOCKED`, `UNVERIFIED`, `NOT_ASSIGNED`, or `STALE`, ordered fail-safe by severity. It checks:

- active assembly and complete identity chain;
- required physical tool type, holder, and assembly;
- damaged, quarantined, retired, or archived state;
- verified current actual geometry for precision, reground, and modified cutters;
- measurement maximum age;
- required machine and pocket plus assignment verification;
- expected-versus-actual diameter using per-operation plus/minus tolerance and configurable warning/block outcome.

There is no hard-coded global dimensional tolerance. Policy is bounded to the operation requirement. When actual geometry is verified, it is the effective setup geometry; otherwise nominal remains visible but cannot make a precision regrind ready.

## QR and read models

Identifier issuance accepts an opaque QR/Data Matrix token only through a `TOOLING_WRITE` authorized service context. PostgreSQL stores its SHA-256 hash, not the plaintext token. Lookup hashes the presented token, remains tenant-scoped, requires `TOOLING_READ`, and returns the minimum current projection:

- holder: active assembly and physical cutter state, or explicit `EMPTY`;
- cutter/container: exact cutter plus active assembly, or explicit `STORED`.

Active-only indexed lookup prevents removed assemblies from appearing current. Tool search and history have validated limits of 1–100 (25 by default). Search uses one joined, tenant-bounded query; setup uses one fixed joined current-state query; history is loaded on demand and bounded. Routine screens do not hydrate all tools or full history.

## Authorization and attribution

Service entry points require authoritative server-derived tenant/user context and explicit `TOOLING_READ`, `TOOLING_WRITE`, or `TOOLING_OPERATE` capabilities. Browser-supplied tenant identity is not accepted. Platform tenant identities fail closed. Fixed parameterized SQL is used throughout.

Creation, measurement, condition, install/remove, machine load/unload, and execution records retain actor/time attribution. Condition changes and executions retain correlation IDs. Optimistic versions protect condition, archive, assembly removal, and machine unassignment changes. The provider is compatible with the established security audit context; HTTP exposure must continue to use the accepted secure-session edge authority/audit wrapper when the PostgreSQL route is activated.

## Operator workspace

`appscript/src/UI/ToolingWorkspace.html` presents the workflow:

`SCAN → SELECT → ASSIGN → PREFLIGHT → READY / BLOCKED → RUN`

It emphasizes `ACTUAL` while still displaying `NOMINAL`, condition, holder, assembly, machine/pocket, operation/CAM expectation, radial stock, and explicit reasons. It includes tool search/detail, measurement, assembly, scan/lookup, assignment, preflight, and on-demand history entry points.

Loading, empty, not found, unverified, warning, blocked, stale, unavailable/error, retry, quarantined, and retired semantics are explicit. The UI has programmatic labels, keyboard operation, visible Atlas controls, live status announcements, non-color-only state text, disabled Run on unsafe states, touch-sized controls, responsive breakpoints, and stale-response suppression. Rendered preview states are provided by `tools/ui/tooling-preflight-preview.js` without production data.

## 8767-00 representation

The deterministic incident fixture represents:

- catalog: 1/2 in end mill, nominal diameter `0.5000 in`;
- physical cutter: condition `REGROUND`, verified actual diameter `0.4975 in`;
- exact cutter installed in an exact holder and assembly;
- OP2 2D contour expectation `0.5000 in` with radial stock `0.0040 in`;
- per-operation minus tolerance `0.0010 in`;
- result: `BLOCKED`, with a `-0.0025 in` nominal/actual delta surfaced;
- immutable execution-shape tests proving exact geometry/assembly/condition snapshots survive later cutter changes.

This is synthetic deterministic test evidence based on the incident. It does not fabricate or migrate production job/part records.

## Migration and verification

The schema is additive and ordered after the accepted MOS-133 migrations. Focused pg-mem tests exercise table creation, tenant constraints, active-assembly uniqueness, canonical IDs, nominal/actual coexistence, and durable execution snapshots. Service tests cover capabilities, QR hashing, preflight states/policy, bounded queries, current holder resolution, and execution snapshots.

Real PostgreSQL 17 validation uses the established local disposable `atlas_preprod_vitality_mos133h` database and its separate non-superuser migration/application roles. It applies migration 0007, verifies CURRENT status, application visibility, required indexes, role limitations, and a real `23503` cross-tenant rejection. The transaction fixture rolls back, leaving no MOS-138 domain data.

## Deferred follow-on work

- Bind the operator workspace to authenticated PostgreSQL edge routes during the accepted edge/UI activation gate; do not add a Sheets tooling provider.
- Add production-specific operational policy ownership, backup/restore rehearsal, and migration authorization before any live cutover.
- Hardware presetter, CNC controller, automatic compensation, predictive tool life, purchasing/reorder, inventory optimization, CAM generation/post-processing, and autonomous control remain separate stories.
- Multi-element holders require an explicit future domain decision; MOS-138 deliberately enforces one active cutter per holder.

Production changes: **NONE**.
