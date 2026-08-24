# MOS-133A — PostgreSQL Transition Plan and Backlog

> **MOS-133C implementation update (source/local only):** The tenant runtime now
> contains `pg` 8.16.3 configuration/pooling, explicit application versus migration
> roles, production TLS validation, PostgreSQL session persistence, a bounded
> parameterized provider, checksummed migration/readiness foundations, and an
> isolated `pg-mem` contract harness. No business domain has moved; Sheets remains
> authoritative for existing tenants; no dual-write, tenant DB, cloud resource, or
> production deployment exists. Real PostgreSQL 17/RDS/Azure timing and integration
> acceptance are **NOT YET MEASURED**. MOS-133D validates installation readiness;
> MOS-133E owns canonical domain schema.

Status: Architecture accepted for implementation planning

Repository baseline: `803ad79945723ac48cbe82f000fbbee30d542fc6`

Production changes: none

This plan operationalizes `docs/ADR/ADR-MOS-133-Tenant-Hosted-PostgreSQL.md`. It defines sequence and acceptance boundaries; it does not provision infrastructure, migrate data, publish Apps Script, or change production code.

## Current Domain-to-Persistence Matrix

All rows currently use the Sheets provider unless noted. “Scan” means repository/service inspection demonstrates broad sheet/range enumeration; it is not a measured production duration.

| Domain | Current repository/access pattern | Mutation/integrity behavior | Target |
|---|---|---|---|
| Customers/Contacts | entity repositories; full list or ID/field scan; service-side tenant/search filtering | generated IDs, append/update/archive, AuditContext | tenant PostgreSQL |
| RFQs/Quotes/Invoices/Jobs | generic entity repositories; broad lists and repeated relationship lookups | lifecycle/version/recovery services above adapter | tenant PostgreSQL |
| Quote costing/revisions/sources | parent/child repositories; list/filter and repeated reference checks | stable child IDs, aggregate checkpoints, idempotent issue/accept recovery | tenant PostgreSQL transactions plus retained command proof |
| Jobs/Travelers/Operations/QR | broad Job, QR, event reads; operator workload repeats reads | versioned mutations, events, recovery/idempotency | tenant PostgreSQL |
| Purchasing/Vendors | broad tenant purchase/vendor lists before bounded UI projection | separation of duties, approval/receipt audit/recovery | tenant PostgreSQL |
| Cash receipts/payments | command field lookup is a linear range scan | immutable command intent and reconciliation | tenant PostgreSQL |
| Follow-Ups/Sales Activity | full list/filter by tenant, owner, customer, status | deterministic identity/events and AuditContext | tenant PostgreSQL |
| Firearms | list/filter, duplicate serial and history scans | immutable custody/disposition/correction history | tenant PostgreSQL; compliance review remains separate |
| Atlas users/memberships/external identities/sessions | list/filter and field scans | server authority, active-state checks, audit/session revocation | tenant PostgreSQL |
| Security audit/operation ledger | broad operation/audit repository scans | fingerprint, lease, checkpoints, recovery actor separation | tenant PostgreSQL append/command tables |
| Tenant subscription/entitlement/seat data | currently Sheets commercial repositories | platform capability boundaries and audit | vendor control plane for commercial truth; tenant signed cache/seat assignments |
| Installation/schema/migration metadata | Script Properties/sheet configuration and source conventions | manual/additive initialization paths | local config + tenant PostgreSQL metadata + tenant secret manager |

## Demonstrated Sheets Limitations

- Full-range reads support many ID/status/owner/date queries.
- Header maps and post-write canonical reads add repeated range access.
- IDs and uniqueness rely on scans and broad document locks.
- Service-level bounded payloads do not guarantee bounded adapter work.
- My Work combines several broad domain reads.
- Floor Board performs four broad repository reads per refresh.
- Shop operator workload generation repeats broad Job/QR scans by operator.
- Operations and Administration clients make avoidably sequential requests.
- Commercial directories bound browser results only after repository enumeration.
- Quote/source relationships can introduce repeated child/reference lookups.
- Apps Script does not offer the target secure-session, pooling, networking, transaction, and runtime boundary.

These are code-path findings. Live route/database timing is **NOT YET MEASURED**.

## R6 Performance Handoff Applied

| Surface | Current access pattern | Known/suspected scans and sequencing | Expected SQL query shape | Likely index | Migration priority | Live timing |
|---|---|---|---|---|---|---|
| My Work | Follow-Ups, Jobs, purchasing and Customer context loaded then filtered/bounded | multiple broad domain reads | bounded union/projections by user, status and due date; batch Customer labels | Follow-Up/Job/Purchase `(TenantID, OwnerUserID, Status, DueAt, ID)`; Customer PK | High after Customer foundation | NOT YET MEASURED |
| Floor Board | Customers + QR tokens + events + Jobs | four broad reads per refresh | active Jobs/operations query plus bounded latest event/readiness joins | Job status/due; operation status; event resource/time | High | NOT YET MEASURED |
| Operations Dashboard | dashboard call followed by workload call; workload recomputes shop reads per operator | sequential client calls and repeated broad reads | one bounded operational snapshot and grouped workload query | Job/operation owner/status/due | High | NOT YET MEASURED |
| Administration | base workspace then tenant operations; identity lists | sequential calls, broad users/memberships/identities | bounded membership/user/role/module queries | membership tenant/status/user; external identity provider/subject | Medium-high | NOT YET MEASURED |
| Customers | full list then tenant/query filter | commercial directory scan | keyset page by normalized name/status and exact ID | Customer tenant/status/name/ID | First | NOT YET MEASURED |
| Quotes | broad directory plus revision/cost/source relationship reads | full scans and possible repeated hydration | keyset Quote page; exact root/current revision; batched lines/sources | Quote tenant/status/date; revision quote/number; line parent | High | NOT YET MEASURED |
| Jobs | broad list for due/owner/status views and relationships | full scans across critical operational paths | keyset active/due/owner queries; exact detail with batched operations | Job tenant/status/due; owner/status/due; operation job/status/sequence | Second domain group | NOT YET MEASURED |
| Invoices | directory/list and relationship filtering | broad scan before bounded projection | keyset status/due/customer/Job plus batched payment state | Invoice tenant/status/due; Job/Customer; payment invoice/time | Medium-high | NOT YET MEASURED |

The SQL target must retain MOS-120 bounded envelopes and the Codex performance budgets. It must measure, not assume, network, query, hydration, and render timing during later stories.

## Phased Migration

| Phase | Objective and scope | Prerequisites | Validation/cutover/rollback | Principal risk |
|---|---|---|---|---|
| 0 — Contract stabilization (MOS-133B) | Define storage-neutral query, transaction, command, error and health contracts; inventory direct Sheets dependencies | accepted ADR | contract tests against Sheets; no cutover | leaking Sheets or SQL semantics into services |
| 1 — Secure-session contract and implementation (SAAS-SESSION-EDGE-1A/1B) | Tenant-hosted OIDC/session/CSRF/revocation edge and trusted API-context contract | MOS-133B; R5 limitation evidence | adversarial session and preproduction deployment acceptance; no business cutover | creating a second weak auth boundary |
| 2 — Runtime/provider foundation (MOS-133C) | Tenant API boundary, PostgreSQL connection/pooling/provider skeleton, local entitlement and health interfaces | 1B trusted-context contract implemented; MOS-133B | connectivity/authorization/failure fixtures against disposable/preproduction infrastructure; no business cutover | allowing a production data boundary before the secure edge is proven |
| 3 — Schema/migrations/readiness (MOS-133E then MOS-133D) | versioned relational schema, migration engine, cloud readiness/install workflow | provider/runtime foundation | ephemeral AWS/Azure-compatible test targets; migration failure/restore drills | unsafe privilege or partial upgrade |
| 4 — First domain (MOS-133F) | Customer/Contact authoritative PostgreSQL persistence and indexed directory queries | schema and installer | export/import, shadow reads, counts/relationships, brief write freeze, explicit provider switch | identity/reference drift |
| 5 — Commercial/CRM | RFQ, Quote/revision/cost/source, Follow-Up, Sales Activity | Customer success; exact-money/recovery fixtures | domain reconciliation and atomic lifecycle acceptance | aggregate and financial history integrity |
| 6 — Operations | Jobs, Travelers/operations, My Work, Daily Production, Floor Board | commercial provenance available | due/readiness/event reconciliation; performance proof | operational outage/cutover timing |
| 7 — Purchasing/finance | Vendors, requests/approvals/receipts, invoices/payments | Customer/Job references and financial controls | exact-money, separation-of-duty, command replay and reconciliation | financial split state |
| 8 — Identity/security | users, memberships, external identities, sessions, audit/operation ledger | secure edge proven; tenant runtime stable | adversarial auth/tenant/audit/revocation/recovery acceptance | lockout or authority bypass |
| 9 — Vitality and compatibility (MOS-133G/H) | production migration tooling, accepted cutover, Sheets read-only/export retirement | all required domains accepted | full reconciliation, rollback rehearsal, live acceptance | incomplete historical migration |

No phase uses permanent bidirectional dual-write. Shadow reads and one-way, time-bounded delta capture are permitted only with a removal date and reconciliation evidence.

### MOS-133B implementation note

MOS-133B establishes the storage-neutral provider contract, server-controlled selection, bounded scoped reads, capability reporting, explicit Sheets non-transaction semantics, and representative Sheets adapter integration. It does not create PostgreSQL connectivity or a second source of truth. See `docs/Architecture/MOS-133B-Persistence-Provider-Contract.md`.

### Secure-session implementation note

SAAS-SESSION-EDGE-1B implements the preproduction Node edge/API contract in
`runtime/secure-session-edge`: provider-neutral Google/Microsoft adapters,
one-time state/nonce/PKCE callbacks, opaque host-only cookies, server-side session
rotation/CSRF/revocation, and trusted request context. Its in-memory store is
explicitly preproduction-only; production fails closed without the future
PostgreSQL store. See `docs/ADR/ADR-SaaS-Tenant-Hosted-Secure-Session-Edge.md` and
`runtime/secure-session-edge/README.md`. MOS-133C consumes this contract but does
not receive permission to cut over a domain or activate live OIDC.

## First Domain Selection

### Selected: Customer and Contact directory

Reasons:

- bounded equality/prefix/search behavior is clear;
- fewer consequential lifecycle transitions than Quotes, Jobs, finance, or security;
- tenant and relationship constraints are still meaningful;
- row counts, identifiers, archives, links, and search output are readily reconciled;
- rollback can be bounded before dependent writes move;
- it provides Customer foreign keys needed by later commercial and operational migrations.

### Candidates deferred

- **Jobs/due-work:** highest operational/index benefit, but business-critical mutations and Customer/Quote provenance increase first-cutover risk. It follows Customer/Contact.
- **My Work:** a cross-domain projection, not a bounded first ownership domain. It benefits as dependencies migrate.
- **All commercial directories:** too broad for the first cutover; Quote aggregates and exact-money increase risk.

## Vitality Migration Acceptance Plan

| Stage | Required evidence |
|---|---|
| Preflight | R6 publication accepted separately; source/runtime/schema versions; entitlement; backup and maintenance window; no dirty migration state |
| Export | immutable timestamped Sheets snapshot, manifest, row counts and hashes; no destructive edits |
| Normalize/map | deterministic enum/date/money/ID normalization; explicit orphan/legacy classifications; relationship map |
| Validate/import | schema constraints, idempotent batches, canonical IDs preserved, failure restartability |
| Reconcile | row counts, unique business keys, FKs, archives, exact money, identity/membership, audit/security operations |
| Shadow acceptance | bounded read equivalence, tenant isolation, workflow/security/recovery tests, measured performance |
| Final delta | short read-only/write-freeze window; delta import and reconciliation; no indefinite dual-write |
| Cutover | one authoritative provider, health and transaction smoke, persona/workflow acceptance |
| Rollback | pre-write return to frozen Sheets; post-write controlled export/restore procedure, never an unreviewed toggle |
| Closeout | tenant acceptance, backup/restore evidence, monitoring, deprecated Sheets path schedule |

No Vitality data is migrated by MOS-133A.

## Failure and Recovery Contract

| Condition | Service behavior | User-visible state |
|---|---|---|
| DB timeout/unavailable | bounded timeout, preserve command identity, reconcile uncertain mutation | partial/source unavailable or actionable error/retry |
| Pool exhaustion | reject/shed safely; no retry storm | taking longer/unavailable with retry |
| Credential/network failure | fail closed; redacted health category | configuration/access unavailable to admins; generic error to operators |
| Schema mismatch/partial migration | block incompatible writes | upgrade required; no blank page |
| DB failover/restart | reconnect with bounded backoff; reconcile uncertain commits | loading then success/error; no blind replay |
| Vendor control plane unavailable | use signed valid/grace cache | non-blocking admin warning; production continues within policy |
| Entitlement expired beyond grace | continuity-restricted policy | clear access state and export/admin route |
| Restore to old schema | startup compatibility block | migration/compatible release required |

Every retry reauthorizes and rechecks entitlement. A stale success cannot overwrite a newer route/session state.

## Installation Package Deliverables

MOS-133D will supply:

- provider selection and responsibility acknowledgment;
- AWS/Azure prerequisite guidance;
- provider-neutral config/secret references;
- TLS/version/network/permission/setting checks;
- empty/existing schema detection;
- migration and metadata seed orchestration;
- first-admin and entitlement validation;
- transactional smoke and health checks;
- redacted readiness report;
- backup/restore ownership confirmation;
- explicit go-live gate.

Terraform reference modules are the first IaC format. Provider-native CloudFormation and Bicep templates remain deferred. A CLI drives the same readiness logic for Terraform and guided-console installs.

## Licensing Decisions for Implementation

The data contract must support, without fixing cryptographic algorithms in MOS-133A:

- signed bundle ID/version and installation/tenant binding;
- issued, refresh-after, expires, grace-until and effective-revocation times;
- purchased/active seat ceiling;
- module and release/version eligibility;
- policy and signing-key identifiers;
- monotonic replay protection and clock-skew handling;
- tenant-local cache and audit records;
- signed, scoped, expiring emergency override.

Open product/legal decisions: exact periods, delinquency notices, grace exhaustion behavior, regulatory-work continuity, emergency approval, and post-termination application rights.

## Responsibility Summary

- **Vendor:** software, release/schema compatibility, migration logic, licensing/billing/entitlement truth, product defects, vendor control-plane security.
- **Tenant Admin:** business users/seats within entitlement, modules/configuration, migration/go-live business approval, operational acceptance.
- **Tenant Cloud Admin:** cloud account, runtime/database provisioning, network, secrets, credentials, HA, backups/restores, patching, cloud cost, infrastructure monitoring and incidents.
- **Atlas Application:** validates sessions/tenant/capabilities/entitlements, applies transactions/migrations, emits audits/health, fails visibly and safely.

Atlas is the software vendor, not the tenant's database or cloud MSP.

## Security and Operational Acceptance Themes

Every implementation story must test:

- database-per-tenant routing plus explicit TenantID enforcement;
- parameterized queries and allow-listed bounded query contracts;
- application/migration role separation and secret redaction;
- secure-session authority distinct from entitlement authority;
- signed entitlement replay/expiry/grace behavior;
- migration checksum/lock/partial-failure behavior;
- command idempotency, timeouts and external outbox reconciliation;
- backup/log sensitivity and tenant-owned response;
- restore/version compatibility;
- visible R6 states under failure.

## Follow-On Stories

| Story | Objective | Dependencies | Complexity | Principal risk | Acceptance boundary | Production changes? |
|---|---|---|---|---|---|---|
| MOS-133B — Persistence Provider Contract | Storage-neutral CRUD/query/transaction/idempotency/error/health interfaces and contract tests | MOS-133A | High | leaking adapter semantics or weakening MOS-121 proof | Sheets provider passes contract; no SQL implementation required | No |
| SAAS-SESSION-EDGE-1A — Secure-Session Edge Architecture | tenant-hosted OIDC/session/CSRF/revocation and API-trust ADR | MOS-133B interface context; R5 evidence | High | identity/session bypass or vendor dependency | architecture accepted; no runtime changes | No |
| SAAS-SESSION-EDGE-1B — Secure-Session Edge Implementation | provider-neutral edge/API session middleware and preproduction adversarial acceptance | 1A; approved runtime, domain, secret, and provider-ownership decisions | Very high | weak browser session or cross-tenant authority | trusted context and preproduction security/deployment acceptance | Test/preproduction only initially |
| MOS-133C — PostgreSQL Provider Foundation | tenant API runtime, pooling, parameterized provider, roles, health, entitlement-cache interfaces | MOS-133B; 1B trusted-context contract implemented | High | unsafe credentials/pooling/tenant routing | provider contract and failure tests against disposable PostgreSQL | Test/preproduction infrastructure |
| MOS-133E — Schema + Migration Framework | base schema, version table, checksummed migrations, lock, compatibility, rollback/restore runbooks | MOS-133C | High | partial/destructive migration | fresh install, upgrade, contention and injected-failure acceptance | Test/preproduction DB |
| MOS-133D — Tenant Database Installation / Readiness Wizard | guided AWS/Azure setup/readiness, secrets references, migrations, smoke and go-live report | MOS-133C/E | High | unsafe cloud guidance or false readiness | blocking 23-step readiness contract on both supported targets | Test/preproduction cloud; production only when tenant authorizes later |
| MOS-133F — First Domain PostgreSQL Migration | Customer/Contact import, indexed queries, authoritative cutover contract | MOS-133C/D/E | High | relationship drift or split authority | counts/FKs/search/security/performance/rollback acceptance | Later authorized tenant cutover |
| MOS-133G — Vitality Migration Tooling | full deterministic export/import/reconcile/cutover/rollback tooling | accepted domain migrations | Very high | financial/audit/identity loss | dry-run and signed reconciliation before production authorization | Production only in separate approved activation |
| MOS-133H — Sheets Retirement / Compatibility | remove writes, retain bounded export/read compatibility, document support sunset | Vitality/pilot acceptance | High | losing rollback/export path | no hidden Sheets dependency; export and archival acceptance | Yes, separate approved cutover |

## Recommended Overall Order

1. Publish and live-accept R6 under its own activation story; MOS-133A does not publish it.
2. Close remaining R5 live evidence specifically enough to support the target edge; do not treat Apps Script validation as SaaS session acceptance.
3. MOS-133B — Persistence Provider Contract.
4. SAAS-SESSION-EDGE-1A — secure-session edge architecture.
5. SAAS-SESSION-EDGE-1B — implement and preproduction-accept the trusted session/API context before MOS-133C production-boundary finalization.
6. MOS-133C — PostgreSQL Provider Foundation and tenant API skeleton using the 1B contract.
7. MOS-133E — Schema + Migration Framework.
8. MOS-133D — Tenant Database Installation / Readiness Wizard.
9. MOS-133F — Customer/Contact first-domain migration in disposable/preproduction environments.
10. Commercial/CRM then Jobs/operations, purchasing/finance, and identity/security domain stories under the phase model.
11. MOS-133G — Vitality migration dry runs, reconciliation, rollback rehearsal, then separately authorized cutover.
12. External-tenant pilot with tenant cloud administrator acceptance, measured performance, backup/restore, and security evidence.
13. MOS-133H — Sheets retirement/compatibility after accepted pilot and rollback windows.

## Activation Dependencies and Post-Decision Evidence

- R6 live publication/acceptance: separate activation dependency.
- SaaS secure-session edge: architecture and implementation dependency before PostgreSQL production cutover.
- Live Apps Script/Sheets timings: **NOT YET MEASURED**.
- Live AWS RDS/Azure Flexible Server timing, failover, pooling, migration and restore evidence: **NOT YET MEASURED**.
- Real tenant workload/query cardinality and index selectivity: **NOT YET MEASURED**.
- Vitality data quality/orphan counts and migration duration: **NOT YET MEASURED**.
- Exact entitlement/grace and contractual offboarding rules: open product/legal decisions.

## MOS-133A Validation Boundary

MOS-133A requires documentation read-back, internal consistency, correct baseline/state, terminology review, link/path checks, allowed-file diff review, credential scan, and `git diff --check`. A full Atlas regression is intentionally not required because no runtime or test code changes.
