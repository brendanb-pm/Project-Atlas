# ADR — MOS-133 Tenant-Hosted PostgreSQL

Status: Accepted for implementation planning

Date: 2026-08-23

Decision owners: Atlas/MOS product and architecture

Source baseline: `803ad79945723ac48cbe82f000fbbee30d542fc6`

Standards baseline: `Codex-Standards.md` at `72e016ea42af375b9f2dbe10186cdc2c5fd74fca`

## Context

Atlas currently uses Google Apps Script, HTML/JavaScript clients, `google.script.run`, and Google Sheets repositories. That architecture enabled the MVP, but current evidence shows that browser-bounded read models often sit above unbounded or repeated Sheets reads. The design also cannot provide the secure browser session edge required for durable provider-neutral SaaS authentication.

The Atlas/MOS vendor sells and licenses software. Each tenant owns its cloud account, runtime infrastructure, PostgreSQL service, infrastructure cost, availability choices, backups, database administration, network policy, secrets, and business data. Atlas is not the tenant's managed-service provider.

This decision incorporates, without re-auditing, the evidence in:

- `docs/Architecture/ACTIVATION-V1-R6-Route-Recovery-and-MOS-133-Handoff.md`
- `docs/Architecture/MOS-119-Performance-Scale-Validation.md`
- `docs/Architecture/MOS-120-Bounded-Query-and-Read-Model-Architecture.md`
- `docs/Architecture/MOS-125-Authentication-and-Session-Architecture.md`
- `docs/Architecture/MOS-123A-SaaS-Commercial-Control-Story.md`
- `docs/ADR/ADR-001-Sheets-Repository.md`

R6 is source-complete at this baseline but has not been published by MOS-133A. Live Apps Script/Sheets route timings remain **NOT YET MEASURED**. The R5 secure-session-edge evidence remains incomplete for the long-term SaaS boundary.

## Decision

Atlas selects option **C: PostgreSQL is the default persistence for new tenant installations; Sheets remains a transitional/legacy provider for existing installations until an explicit migration is accepted**.

The target production topology is:

```text
Vendor control plane
  license, seats, subscription, module/version entitlement
                 |
          signed entitlement
                 v
Tenant-owned application plane
  browser -> secure-session/API edge -> Atlas services -> PostgreSQL
                       |                    |
                       |                    +-> tenant-local audit/health
                       +-> tenant secret manager

Google Apps Script during transition
  existing UI/runtime and selected integrations -> tenant API
  never direct browser/Apps Script access to PostgreSQL credentials
```

The tenant-hosted application/API runtime is authoritative for session validation, authorization, transactions, tenant-local data access, health, migrations, and entitlement-cache enforcement. Apps Script remains a transitional client/integration runtime and does not connect directly to PostgreSQL. Over time, Apps Script becomes integrations/automation only and is retired as the primary application runtime.

## Current Architecture

The current `SheetsRepository` contract provides header-based mapping, list, ID lookup, insert, update, archive, and uniqueness behavior. Its implementation repeatedly reads broad ranges:

- `list()` reads the full data range.
- ID and field lookup scan sheet data.
- insert/update paths rescan to return canonical data.
- sequential ID allocation scans under a document lock.
- many domain repositories call `list()` and filter in service code.
- identity, security operation, audit, commercial, purchasing, finance, operational, and Firearms persistence share this pattern.

The repository/service seam is valuable and remains the migration boundary. Browser APIs must continue to use the bounded domain query contracts from MOS-120; swapping storage must not expose SQL or global datasets to clients.

## Data Ownership

| Data category | Location | Ownership rule |
|---|---|---|
| Vendor control plane | Vendor-hosted | Tenant registration, license purchase, purchased seats, subscription/billing state, module/version entitlement, licensing audit only |
| Tenant operational data | Tenant-hosted PostgreSQL | Customers, Contacts, RFQs, Quotes, Jobs, operations, purchasing, finance, Follow-Ups, sales activity, Firearms and other business records |
| Tenant identity/security data | Tenant-hosted PostgreSQL | Atlas users, memberships, external identities, sessions, operation ledger, security audit events |
| Local installation/system configuration | Tenant runtime config and secret store; schema metadata in PostgreSQL | Installation identity, database/schema version, migration state, non-secret runtime references, local entitlement cache |

The vendor control plane must not store tenant business data, tenant database credentials, provider tokens, or tenant session data. Support access to tenant systems is tenant-approved, time-bounded, least-privileged, and audited.

## Vendor Control Plane

The minimum vendor-controlled service supports:

- tenant commercial registration and installation identity;
- license issuance and initial purchase evidence;
- purchased/active seat ceiling;
- subscription and billing standing;
- module/product entitlement;
- release/version eligibility;
- suspension/revocation state;
- append-only licensing audit.

It returns a signed entitlement bundle to the tenant runtime. It is not in the synchronous request path for normal production work.

## Tenant Data Plane

The tenant-owned installation contains:

- Atlas application/API runtime;
- secure browser session edge;
- PostgreSQL;
- tenant secrets and provider credentials;
- tenant business, identity, session, security, and audit data;
- schema migration and readiness tooling;
- tenant-local health, diagnostics, logs, and entitlement cache.

The Atlas application enforces trusted tenant context, membership, entitlement, capability, AuditContext, idempotency, and transaction rules. The tenant cloud administrator operates infrastructure; the Atlas vendor supplies compatible software, migrations, diagnostics, and support guidance.

## PostgreSQL Support

The deliberately narrow V1 support matrix is:

- Amazon RDS for PostgreSQL.
- Azure Database for PostgreSQL Flexible Server.
- PostgreSQL major versions 17 and 18 after Atlas certification; the initial pilot defaults to 17. Every installation runs a provider-supported current minor release.
- Unsupported and PostgreSQL end-of-life majors are blocked by readiness checks.
- UTF-8 database encoding and UTC database/session timezone. Business wall-clock rules additionally store the tenant's IANA timezone.
- TLS with server identity verification is mandatory; public unauthenticated database exposure is prohibited.
- No required PostgreSQL extensions for V1. Extensions are deny-by-default and enabled only by a versioned Atlas requirement. `pg_trgm` may be introduced later after measured search need.
- A migration role owns the Atlas schema and can execute versioned DDL; it is unavailable to the running application.
- The application role has only schema usage and required DML/sequence/function permissions. It cannot create roles, databases, extensions, or schema migrations.
- Connection pooling belongs in the tenant API runtime and is bounded to the database service capacity. Apps Script does not open database connections.
- The tenant owns backup retention, point-in-time recovery, high availability, engine patch scheduling, monitoring, and cost.

The version policy follows PostgreSQL's supported-major lifecycle and provider availability. Atlas release notes identify the certified minimum/maximum schema and PostgreSQL versions.

## Multi-Tenancy

Atlas uses **one database per tenant installation** in the tenant's cloud account.

| Model | Assessment |
|---|---|
| Database per tenant | Selected. Strong ownership and blast-radius isolation, tenant-controlled backup/restore, straightforward offboarding and portability, and no shared-row cross-tenant failure mode. Higher per-tenant infrastructure cost is consistent with tenant ownership. |
| Schema per tenant | Rejected for the tenant-hosted model. It adds shared-instance restore and upgrade coordination without useful vendor economies when each tenant owns infrastructure. |
| Shared database with row isolation | Rejected. It conflicts with tenant-owned infrastructure and increases cross-tenant, backup, offboarding, and vendor-operations risk. |

`TenantID` remains explicit on every tenant-owned table even in a physically isolated database. Composite foreign keys include `TenantID` where practical. This preserves trusted scope in audits and exports, detects misrouted imports/runtime requests, supports restore validation, and prevents a future topology change from silently weakening isolation. An installation metadata constraint identifies the single permitted tenant.

## Runtime and API

A tenant-hosted API/service layer is required between every primary UI and PostgreSQL. It owns:

- secure session presentation and CSRF protection;
- authoritative tenant/user/membership/capability resolution;
- bounded request validation and response projection;
- transaction and idempotency boundaries;
- repository provider selection;
- entitlement-cache validation;
- health/readiness checks and redacted diagnostics;
- database migration coordination;
- structured logging and API version compatibility.

No programming language/framework is selected by this ADR. MOS-133C must choose only after evaluating repository reuse, Apps Script transition, deployment footprint, pooling, supported cloud targets, and maintenance burden.

## Apps Script Transition

The long-term choice is a staged **B -> C -> D** transition:

1. Apps Script remains a transitional UI/runtime while the tenant API becomes authoritative.
2. Apps Script calls bounded, versioned tenant API endpoints; it never receives database secrets.
3. Authenticated primary web UX moves to the tenant runtime.
4. Apps Script remains only for explicitly valuable Google integrations/automation.
5. Apps Script is eventually retired as the primary application runtime.

Direct Apps Script-to-PostgreSQL access is rejected because it does not provide suitable pooling, secret/session boundaries, predictable latency, or long-term hosting independence.

## Secure Session Edge

The secure-session edge is **tenant-hosted**, colocated logically with the tenant API. The provider-neutral boundary validates Google/Microsoft OIDC, establishes secure HttpOnly application sessions, enforces CSRF, supports revocation and recent authentication, and supplies authoritative tenant context to API requests.

The vendor may publish provider configuration requirements and software, but it does not become the tenant's runtime authentication dependency. Tenant provider credentials and session data remain tenant-owned. The vendor control plane is not an identity provider and an entitlement cannot authenticate a user.

The separate **SAAS SECURE-SESSION EDGE** story follows MOS-133B and precedes production domain cutover. Its interface and threat model must be settled before MOS-133C finalizes the tenant API boundary. It does not wait until after data migration.

## Installation

Atlas supplies a guided installer/readiness tool instead of an unsupported checklist. The installer validates the chosen cloud/database target, connectivity, TLS, versions, roles, permissions, schema state, migration compatibility, entitlement, transaction behavior, and application health. Cloud provisioning and security choices remain tenant actions.

| Step | Classification | Outcome |
|---|---|---|
| 1. Choose supported deployment target | Guided tenant action | AWS RDS or Azure Flexible Server selected |
| 2. Responsibility acknowledgment | Blocking guided tenant action | Tenant accepts infrastructure/backup/uptime ownership |
| 3. Provision cloud resources | Tenant cloud admin action | Tenant runtime/network resources exist |
| 4. Provision PostgreSQL | Tenant cloud admin action | Supported database is available |
| 5. Configure network/firewall | Tenant cloud admin action | Only approved runtime/admin paths can connect |
| 6. Configure secret storage | Tenant cloud admin action | Credentials stored in tenant secret manager |
| 7. Configure runtime connectivity | Guided tenant action | Runtime references secret and database endpoint |
| 8. Validate TLS | Blocking, automated by Atlas | Verified encrypted connection |
| 9. Validate engine version | Blocking, automated by Atlas | Certified major/current minor confirmed |
| 10. Test connection | Blocking, automated by Atlas | Bounded connection succeeds |
| 11. Validate permissions | Blocking, automated by Atlas | App/migration role separation confirmed |
| 12. Validate extensions/settings | Blocking, automated by Atlas | UTF-8, UTC, allowed extensions confirmed |
| 13. Detect empty/existing schema | Blocking, automated by Atlas | Safe installation mode selected |
| 14. Validate schema version | Blocking, automated by Atlas | Release/schema compatibility confirmed |
| 15. Apply migrations | Blocking, automated by Atlas with tenant approval | Versioned migration completes under migration role |
| 16. Seed required metadata | Automated by Atlas | Installation/tenant/schema metadata created idempotently |
| 17. Establish first tenant admin | Guided tenant action | Explicit, audited identity mapping; no email-only auto-link |
| 18. Validate license/entitlement | Blocking, automated by Atlas | Signed entitlement/install identity accepted |
| 19. DB read/write transaction smoke | Blocking, automated by Atlas | Rollback and committed transaction paths verified |
| 20. Application health check | Blocking, automated by Atlas | Runtime, session edge, DB, entitlement cache healthy |
| 21. Readiness summary | Automated by Atlas | Pass/blockers and redacted diagnostics produced |
| 22. Confirm backup/restore responsibility | Blocking guided tenant action | Tenant records policy and recovery test owner |
| 23. Go-live | Guided tenant action | Explicit cutover approval and audit record |

Optional steps include HA, read replicas, customer-specific monitoring integrations, and pre-production environments. They may become blocking under a tenant's selected service level.

## Infrastructure as Code

The smallest repeatable V1 approach is:

1. a provider-neutral Atlas installer/CLI for readiness, schema, migrations, smoke tests, and diagnostics;
2. versioned Terraform reference modules for the supported AWS and Azure topologies;
3. a guided-console fallback for tenants unable to adopt Terraform.

CloudFormation and Bicep/ARM templates are deferred until demand justifies maintaining additional equivalent stacks. Container packaging is recommended for the tenant API/runtime but is not mandated by this ADR.

## Secrets

Production secrets never appear in Git, source, browser JavaScript, Sheets, URL parameters, logs, or vendor control-plane tenant records.

- AWS installations use tenant-owned AWS Secrets Manager.
- Azure installations use tenant-owned Azure Key Vault.
- The application consumes secrets through a provider-neutral runtime interface/workload identity where available.
- Application and migration credentials are separate. The migration credential is injected only for an approved migration and removed from normal runtime access.
- Tenant cloud administrators own rotation and emergency revocation. Atlas supplies rotation validation and health checks.
- Vendor support sees redacted identifiers and error categories, never secret values, unless a tenant explicitly establishes audited break-glass access.

## Relational Schema Strategy

Canonical Atlas IDs remain stable primary keys during migration. Tables also carry `TenantID`, `Version`, authoritative timestamps, status, actor/audit correlation, and archive fields where applicable. Cross-tenant relationships use composite `(TenantID, ID)` foreign keys. Business document numbers have tenant-scoped unique constraints. Regulatory and security events are append-only.

| Domain | Relational shape and key constraints | Lifecycle/history |
|---|---|---|
| Customer | `customer(CustomerID PK, TenantID, Name, Status, Version, ...)`; unique tenant business key when defined | archive/soft-delete; referenced history retained |
| Contact | `contact(ContactID PK, TenantID, CustomerID FK, ...)` | archive; customer relationship enforced |
| RFQ | `rfq(RFQID PK, TenantID, CustomerID FK, Status, ReceivedAt, Version, ...)` | status/version; source relationships separate |
| Quote | root `quote(QuoteID PK, TenantID, RFQID/CustomerID FK, Status, AcceptedRevisionID, Version, ...)` | root lifecycle and exact accepted revision |
| Quote Revision | `quote_revision(RevisionID PK, TenantID, QuoteID FK, RevisionNumber, Status, ...)`; unique `(TenantID, QuoteID, RevisionNumber)`; stable `quote_line_item` children | issued snapshots immutable; successor revisions append |
| Job | `job(JobID PK, TenantID, CustomerID, SourceQuoteRevisionID, Status, DueAt, OwnerUserID, Version, ...)` | archive/cancel/complete; accepted-revision provenance |
| Traveler/Operation | traveler root plus stable operation children keyed to Job, sequence/order separate from identity | transition events append; current state versioned |
| Purchase Request/Approval | request root plus append-only approval/receipt decisions | separation-of-duty actor FKs and command IDs |
| Vendor | vendor root, contacts/capabilities/locations as stable children | archive/inactive references remain explainable |
| Invoice | invoice root/lines linked to Job/Customer | issued financial facts retained; correction entries rather than rewrite |
| Cash Receipt/Payment | receipt/payment linked to Invoice/Customer, unique tenant command/idempotency key | append/correct/reconcile; no destructive rewrite |
| Follow-Up | owner/assignee, due/status, related resource | lifecycle version and events |
| Sales Activity | immutable or correction-aware activity linked to Customer/Contact | append/correction, authoritative actor |
| Atlas User | tenant-local user identity keyed independently of email | active/inactive; audit changes |
| Tenant Membership | user/tenant/status/role bindings | versioned/archived; capability derivation remains server-side |
| External Identity | user FK plus provider, issuer, subject; unique stable provider identity | no email-only merge; auditable linking |
| Security Audit Event | append-only event with tenant, actor, correlation, action, target, outcome | immutable retention and redacted details |

`SecurityOperation`, idempotency commands, entitlement-cache records, schema versions, source-document links, Firearms custody/correction events, and outbox records are first-class tables even though not all are shown above.

## Transaction Boundaries

PostgreSQL transactions replace split Sheets writes only when all affected canonical records live in the same tenant database. They do not remove command idempotency, retry safety, AuditContext, or recovery proof for timeouts and external effects.

| Workflow | Transaction boundary | Contracts retained |
|---|---|---|
| Quote revision save | revision, stable lines, pricing/source relationship changes, checkpoint/outbox | command identity, optimistic version, issued immutability |
| Quote issue/accept | revision transition, Quote root, exact accepted revision, audit/outbox | idempotency, stale-version rejection, authoritative actor |
| Quote -> Job | Job, source revision provenance, conversion command, audit/outbox | one Job per accepted revision/command |
| Payment posting | receipt/payment, invoice state, command, audit/outbox | immutable financial intent and reconciliation; external settlement remains separate |
| Purchase approval/receipt | request transition, approval/receipt, version, audit/outbox | separation of duties and replay protection |
| Job creation/production completion | Job/operation current state, canonical event, audit/outbox | optimistic concurrency and command idempotency |
| Identity/membership change | principal/membership mapping and security audit | recent auth, capability checks, revocation freshness |
| Security operation | operation/idempotency record, mutation proof, audit | lease/recovery for cross-boundary or uncertain outcomes |
| Firearms custody/disposition | serialized record state, immutable custody/disposition/correction event, audit | legal/compliance review remains required |

External provider calls use an outbox/saga boundary: commit the authoritative command and outbox record, perform the external call outside the database transaction, and reconcile idempotently. Broad locks across provider calls are prohibited.

## Index and Search Strategy

Indexes are derived from Atlas access patterns, not speculative analytics:

- every table: primary key plus `(TenantID, ID)` uniqueness where needed for composite foreign keys;
- Customers: `(TenantID, Status, normalized_name, CustomerID)` and customer business key;
- RFQs: `(TenantID, Status, ReceivedAt DESC, RFQID)`, plus Customer relationship;
- Quotes: `(TenantID, Status, UpdatedAt DESC, QuoteID)`, RFQ/Customer links; revisions `(TenantID, QuoteID, RevisionNumber DESC)`;
- Jobs: `(TenantID, Status, DueAt, JobID)`, `(TenantID, OwnerUserID, Status, DueAt, JobID)`, Customer and source revision;
- Operations: `(TenantID, JobID, Status, Sequence, OperationID)` and active status/update indexes;
- Follow-Ups: `(TenantID, OwnerUserID, Status, DueAt, FollowUpID)`;
- Purchase Requests: `(TenantID, Status, RequiredBy, RequestID)` and approver queue;
- Invoices: `(TenantID, Status, DueAt, InvoiceID)` and Job/Customer; payments by Invoice/ReceivedAt;
- recent events/history: `(TenantID, ResourceType, ResourceID, OccurredAt DESC, EventID)`;
- command/recovery: unique operation/idempotency keys and `(TenantID, CorrelationID)`;
- external identities: unique `(Provider, Issuer, Subject)` within the tenant database, plus UserID.

V1 search uses bounded equality, normalized prefix queries, and bounded `ILIKE` where indexes remain effective. PostgreSQL full-text and `pg_trgm` are introduced only after measured need. Elasticsearch/OpenSearch is not part of V1.

## Licensing and Offline Continuity

The vendor signs an entitlement bundle containing tenant/installation identity, purchased seat ceiling, enabled modules, eligible versions, issue/refresh/expiry times, policy version, and unique entitlement ID. The tenant runtime verifies and caches it locally; the tenant cannot mint, edit, increase, or broaden it.

Recommended defaults, subject to product/legal approval:

- refresh every 24 hours with bounded jitter;
- bundle validity seven days;
- connectivity grace up to 30 days after expiry;
- five-minute clock-skew tolerance;
- explicit revocation applies when a newer signed bundle is retrieved, with worst-case offline enforcement bounded by validity plus grace.

| State | Runtime behavior |
|---|---|
| Valid | Enforce signed seats/modules/version; normal production |
| Refresh unavailable, bundle valid | Continue normally; audit failure and retry with bounded backoff |
| Expired, within grace | Preserve last signed seat/module ceiling and existing production access; deny seat/module expansion and incompatible upgrades; show non-blocking admin warning |
| Grace exhausted | Enter continuity-restricted mode: safe read/export/backup/administration and explicitly approved completion of in-flight safety-critical work; deny new sessions/new business commitments according to approved policy; show actionable admin state |
| Explicit suspension/revocation received | Apply signed effective time and policy; never rewrite tenant data; retain read/export/offboarding path |
| Billing delinquent | Vendor control plane issues a future-effective signed state under approved commercial policy; no immediate destructive lockout from a transient billing/provider error |

Active-seat enforcement counts authoritative active seat assignments in the tenant database against the signed ceiling. Deactivating a seat is audited. Tenants cannot assign `PLATFORM_*` authority or unlicensed modules. An emergency/support override is a separately signed, time-limited, scope-limited, single-installation grant, issued by authorized vendor support and audited by both planes; it is not a tenant-mintable bypass.

The exact durations, continuity-restricted write policy, delinquency timing, and regulatory-work exceptions are product/legal decisions before production activation.

## Resilience and Visible Failure

The R6 terminal-state contract applies to the tenant runtime: every request ends in loaded, loading, empty, partial/source unavailable, session expired, access unavailable, actionable error/retry, or unsupported state—never a blank page.

| Failure | Required behavior |
|---|---|
| PostgreSQL unavailable/timeout | Bounded timeout; no blind consequential retry; visible unavailable/retry; reconcile uncertain commands after recovery |
| Connection exhaustion | Shed load, preserve pool health, emit tenant-local metric; user sees delayed/unavailable state |
| Invalid/revoked credential | Fail closed, redact secret details, health marks configuration blocked |
| Firewall/network failure | Same visible unavailable state; readiness diagnostics identify network category without exposing endpoints publicly |
| Schema mismatch/partial upgrade | Block incompatible writes and render upgrade-required/admin guidance; do not run ad hoc migrations on request path |
| Migration failure | Release lock safely, retain failure record, require operator resolution/restore or forward repair |
| Vendor licensing unavailable | Use valid/grace entitlement cache; production does not stop immediately |
| Entitlement refresh failure/expiry | Apply the staged model above; audit transitions |
| Tenant restore to older backup | Startup compatibility check blocks incompatible writes and guides migration/compatible app rollback |
| DB restart/failover | Pool reconnects with bounded backoff; in-flight uncertain operations reconcile by command identity |

## Schema Migration and Upgrade Model

- `atlas_schema_version` records version, checksum, release, state, started/completed times, and actor/tool identity.
- Migrations are ordered, checksummed, version-controlled, and acquire a PostgreSQL advisory lock.
- Preflight validates engine, extensions, free capacity signals available to the runtime, role permissions, current version, entitlement/version eligibility, and tenant backup acknowledgment.
- Migrations are forward-only by default. Destructive changes use expand/migrate/contract releases and compatibility windows.
- Application releases declare minimum and maximum schema versions and refuse incompatible writes.
- A failed migration records failure and blocks application writes until forward repair, compatible application rollback, or tenant-owned database restore.
- Rollback uses backward-compatible application deployment where possible; database rollback relies on an explicitly tested tenant backup/restore, not improvised down migrations.
- Upgrades sequence backup/readiness, migration, smoke test, application rollout, health verification, and tenant acceptance.

## Migration Strategy

Atlas uses incremental, domain-owned cutovers and avoids indefinite dual-write:

1. stabilize storage-neutral repository/query/transaction contracts;
2. introduce tenant API and PostgreSQL provider foundation;
3. establish schema/migration/readiness tooling;
4. import and shadow-read a bounded domain, compare results, then use a short write freeze for authoritative cutover;
5. move related domains in dependency order;
6. retain signed exports and reconciliation reports for rollback evidence;
7. retire each Sheets write path after its acceptance window.

Dual-write is not the steady state. If a transition requires change capture, it is one-directional, time-bounded, observable, idempotent, and removed at cutover.

The first real migrated domain is **Customer and Contact directory**. It offers clear tenant/search constraints, limited lifecycle complexity, straightforward counts and relationship validation, an easy rollback boundary, and meaningful evidence for indexed directory access. Jobs/due-work follows immediately after the directory foundation because it has the strongest demonstrated operational read pressure.

## Vitality Migration

Vitality migration is designed but not executed in MOS-133A:

1. verify R6/live prerequisites, backups, supported schema/runtime, entitlement, and maintenance plan;
2. export immutable source snapshots with hashes and row counts;
3. normalize dates, enums, IDs, money, whitespace, and legacy/unresolved references without silently inventing relationships;
4. build deterministic old-to-canonical relationship maps;
5. validate destination schema and migration eligibility;
6. import in dependency order using idempotent migration commands;
7. reconcile row counts, unique keys, cross-table references, archives, and orphan classifications;
8. reconcile exact-money totals independently for Quotes, invoices, purchasing, and cash receipts;
9. reconcile users, external identities, active memberships, roles, and capabilities without email-only mapping;
10. reconcile audit/security operation counts and immutable attribution;
11. run shadow bounded reads and workflow acceptance;
12. enter a short read-only/write-freeze window for final delta export/import;
13. switch one authoritative provider and run health/smoke tests;
14. preserve the Sheets snapshot and rollback decision point;
15. complete post-cutover security, workflow, performance, backup/restore, and tenant acceptance.

Rollback before new PostgreSQL writes can return to the frozen Sheets source. After authoritative PostgreSQL writes begin, rollback requires a controlled reverse export/compatibility procedure or database restore; silent provider toggling is prohibited.

## Operations and Responsibility Matrix

R = Responsible, A = Accountable, C = Consulted, I = Informed. `Tenant Admin` means Atlas business administration; `Tenant Cloud Admin` means infrastructure administration.

| Activity | Vendor | Tenant Admin | Tenant Cloud Admin | Atlas Application |
|---|---|---|---|---|
| License/subscription/module/version issuance | A/R | I/C | I | validates/caches/enforces |
| Billing and purchased seat ceiling | A/R | C/I | I | enforces signed ceiling |
| Seat assignment within ceiling | C | A/R | I | validates/audits |
| Software releases and defects | A/R | I/C | C | reports compatibility/health |
| Schema migration logic | A/R | C | C | executes approved migrations |
| Database/runtime provisioning | C | I | A/R | readiness validation |
| DB uptime, HA, patching, cloud billing | I/C | I | A/R | health/degraded UX |
| Backups and restore testing | C | C/I | A/R | compatibility validation |
| DB credentials, rotation, firewall/network | I/C | I | A/R | least-privilege use/redaction |
| Infrastructure/DB monitoring and logs | C | I | A/R | emits tenant-local signals |
| Application logs and functional health | A/C | I/C | R for hosting | R for emission/redaction |
| Security incident in product | A/R | C/I | C | evidence/audit controls |
| Security incident in tenant cloud/data | C | C | A/R | tenant-local evidence |
| Migration approval/failure response | R for software/remediation | A for business window | R for backup/restore | fail closed/reconcile |
| App/schema/version compatibility | A/R | I | C | blocks unsafe combination |

This matrix does not make the vendor responsible for operating tenant infrastructure.

## Offboarding and Portability

- Tenant-owned PostgreSQL and backups remain under tenant control after license termination.
- Vendor runtime/control-plane access terminates without deleting tenant data.
- Atlas supplies versioned export and schema metadata sufficient for portability and reconciliation.
- Read/export behavior during grace or termination follows the signed entitlement and approved product/legal policy; destructive lockout is prohibited.
- Module disablement prevents new module operations but preserves historical records and exportability.
- A tenant can retain an entitled compatible application version subject to the eventual license contract; this ADR does not invent perpetual-use rights.
- Vendor-assisted migration is a separately scoped service, not assumed infrastructure operation.

Legal/product review is required for retention obligations, post-termination runtime rights, support access, export format commitments, grace duration, regulatory-data continuity, and destruction instructions.

## Security Review

| Risk | Material mitigation | Residual/open risk |
|---|---|---|
| Cross-tenant access/misrouting | database per tenant; explicit TenantID; composite FKs; authoritative session context; installation tenant constraint | support tooling and imports must verify destination tenant |
| SQL injection | parameterized repository queries; no browser SQL; allow-listed sort/filter contracts | provider implementation review required |
| DB credential leakage | tenant secret manager/workload identity, no browser/Sheets/vendor storage, redacted logs | tenant cloud posture remains tenant risk |
| Over-privileged app/migration roles | separate roles; app no DDL/role/extension privileges; ephemeral migration use | break-glass procedures require audit |
| Vendor control-plane impersonation/license forgery | signed bundles, key rotation/versioning, installation binding, replay/expiry checks | cryptographic design and key custody deferred |
| Stale entitlement abuse | bounded validity/grace, monotonic entitlement version, clock-skew checks, audit | exact offline maximum is product decision |
| Backup/log leakage | tenant encryption/access controls, redaction, no secrets/sensitive payloads by default | tenant operational controls require acceptance evidence |
| Migration privilege escalation | checksummed migrations, dedicated role, advisory lock, approved release provenance | supply-chain signing design deferred |
| Session/data-plane trust confusion | tenant-hosted secure edge supplies authoritative session; entitlement never authenticates; API reauthorizes | secure-session story required before cutover |
| Restore to incompatible schema | startup schema compatibility gate; migration/readiness workflow | restore runbook and rehearsal required per tenant |

## Alternatives Considered

- **A: Immediate default for all production persistence.** Rejected because Vitality migration, runtime, session edge, schema, installer, and rollback evidence do not exist yet.
- **B: PostgreSQL optional indefinitely.** Rejected because it would double the long-term support/test matrix and allow known Sheets scaling constraints to persist as a first-class production choice.
- **D: More Apps Script MVP work first.** Rejected as the strategic default. R6 recovery is still published separately, but further broad Sheets optimization would not solve pooling, relational integrity, transaction, or session-edge constraints.
- **Shared vendor-hosted multi-tenant database/runtime.** Rejected because it conflicts with the tenant-hosting ownership model and makes the vendor an infrastructure operator/data custodian.
- **Apps Script directly accesses PostgreSQL.** Rejected for session, secrets, networking, pooling, and runtime-limit reasons.
- **Broad SQL-engine or search-engine support.** Rejected to keep compatibility and support burden bounded.

## Consequences

Positive:

- tenant-owned data and operational availability;
- indexed bounded queries, relational constraints, and real transactions;
- stronger restore/offboarding isolation;
- secure-session/API boundary no longer constrained by Apps Script;
- vendor licensing can remain independent from the synchronous production path.

Costs and risks:

- tenants need cloud/database competence or a chosen third-party operator;
- Atlas must maintain AWS/Azure validation, migrations, installation diagnostics, exports, and compatibility policy;
- migration is multi-phase and requires acceptance evidence;
- Sheets and PostgreSQL coexist transitionally, increasing near-term test burden;
- database/runtime availability becomes a tenant operational responsibility.

## Open Questions

The following must be resolved before production activation, without blocking this architecture decision:

1. Exact entitlement validity, grace, delinquency, continuity-restricted write, and emergency-override policies.
2. Certification evidence and release timing for enabling PostgreSQL 18 generally; the selected policy remains 17/18 support with 17 as the initial pilot default.
3. Tenant API implementation language/framework and deployment packaging.
4. OIDC tenant-provider registration and secure-session key custody model.
5. Regulatory retention/continuity rules for Firearms data after license changes.
6. Support/break-glass access contract and audit process.
7. Export format/version support commitment and post-termination application rights.
8. Measured live Apps Script/Sheets and pilot PostgreSQL performance baselines.
9. Whether optional `pg_trgm` is justified by measured Customer/part/search behavior.

## References

- PostgreSQL version policy: https://www.postgresql.org/support/versioning/
- Amazon RDS for PostgreSQL release calendar: https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html
- Amazon RDS for PostgreSQL SSL/TLS: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html
- Azure Database for PostgreSQL version policy: https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-supported-versions
- Azure Database for PostgreSQL TLS: https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls-how-to-connect
- AWS Secrets Manager: https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html
- Azure Key Vault: https://learn.microsoft.com/azure/key-vault/general/overview
