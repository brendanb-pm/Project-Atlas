# MOS-133E — Canonical PostgreSQL Domain Schema

**Status:** schema implemented; no domain service, Sheets migration, production
data migration, dual-write, cloud provisioning, or production deployment is
implemented by this story.

## Conventions

Every tenant-owned table retains `tenant_id`, even in a one-database-per-tenant
installation. Composite parent keys and composite foreign keys reject cross-tenant
imports, restores, and misrouted writes. Atlas canonical IDs remain text and are
scoped by `(tenant_id, canonical_id)`; no database-only surrogate replaces them.

Mutable aggregates use `version INTEGER NOT NULL CHECK (version >= 1)`, with
atomic expected-version updates in a future domain repository. UTC instants use
`TIMESTAMPTZ`. Currency values use integer minor units (`BIGINT`) and quantities
use `NUMERIC(20,6)`; financial truth never uses float types. Stable state values
are constrained text rather than PostgreSQL enums. Archive-only aggregates have
`archived_at`; normal application behavior does not hard-delete history.

## Domain matrix and relationships

| Domain | Current state | Immutable / append history | Key relationships and access paths |
| --- | --- | --- | --- |
| Customer | `atlas_customers` | archive timestamp | bounded normalized-name/status directory |
| Contact | `atlas_contacts` | archive timestamp; historical references remain resolvable | required same-tenant Customer; Customer/status/name/email indexes |
| RFQ | `atlas_rfqs` | archive timestamp | required Customer; optional Customer-consistent Contact; status/customer/due/owner indexes |
| Quote | `atlas_quotes` | Quote Revision is authoritative issued history | Customer/RFQ, current/issued/accepted revision references |
| Quote Revision / line | `atlas_quote_revisions`, `atlas_quote_lines` | issued/finalized revision values retained | unique revision number per Quote; exact minor-unit totals and ordered lines |
| Job / operations | `atlas_jobs`, `atlas_job_operations` | `atlas_job_events` | Job is current operational aggregate; status/owner/due/Customer indexes |
| Traveler | none | Job Events and QR lifecycle | generated projection only; no Traveler ID/table/lifecycle |
| QR | `atlas_job_qr_tokens` | rotation/revocation timestamps | opaque hashed token tied to Job; not business identity or standalone authority |
| Vendor / purchasing | `atlas_vendors`, `atlas_purchase_requests`, `atlas_purchase_approvals` | approval records are decision history | Job/Vendor/requester/approver relationships and approval queue indexes |
| Finance | `atlas_invoices`, `atlas_cash_receipts` | issued/finalized/posting timestamps retained | exact money, tenant-safe invoice/customer/payment relationships |
| Follow-up / sales | `atlas_follow_ups`, `atlas_sales_activities` | archive timestamps | bounded owner/status/due My Work and optional Customer-consistent Contact |
| Identity/security | `atlas_users`, `atlas_tenant_memberships`, `atlas_external_identities`, `atlas_security_audit_events` | security audit is append-only | provider/issuer/subject unique, tenant membership and recent/audit correlation indexes |
| Firearms | `atlas_serialized_firearms`, `atlas_firearm_regulatory_events` | regulatory events append-only | tenant-scoped serialized identity/custody/event history; module remains inactive |

## Approved Contact contract

Contact is a first-class tenant-owned CRM entity but subordinate to one required
Customer in V1. `contact_id` must pass the portable UUID-shaped `CONTACT-`
database check; the future canonical ID generator must validate full
`CONTACT-<UUID>` hexadecimal form. `display_name`
is required; email, phone, and title/role are optional ordinary domain data, not
identity or authorization keys. `ACTIVE` and `ARCHIVED` are the only V1 statuses.
Email, phone, display name and title/role are intentionally not unique.

Contact cannot be reparented through normal update. Customer archival never
silently deletes Contacts or historical references. RFQ and Sales Activity Contact
links are optional; if present, the composite FK requires the same tenant and
Customer. `Customer.primaryContact` remains legacy display text. Future
MOS-133F/G migration classifies ContactIDs as resolved, blank, unresolved, or
conflicting; it never fabricates rows from names, email, phone, or that display
text.

## Operational / Traveler contract

`atlas_jobs` is mutable current state, operations are ordered work steps, and
`atlas_job_events` is append-only transition/history evidence. A QR token is an
opaque, revocable Job/workflow print/scan reference. Traveler rendering is a
projection over those sources plus workflow configuration. The schema deliberately
does not create `atlas_travelers`, `TravelerID`, or a parallel Traveler lifecycle.

## Transactions, idempotency and immutability

Future domain repositories execute Quote revision creation, Quote acceptance to
Job conversion, purchase approval, invoice state transition, cash-receipt posting,
operation completion, identity/membership administration, and firearms custody
transition as bounded tenant-scoped transactions. They retain MOS-121 command and
recovery behavior: a database transaction does not make email, payment, or other
external effects atomic. Purchase requests and cash receipts reserve a tenant
command ID; audit and Job/firearm event tables are append-only by application-role
policy. Deployment role grants must deny ordinary application-role `UPDATE` and
`DELETE` on immutable event tables; migration-role authority remains separate.

## Index and performance direction

Indexes target tenant-bounded Customer/Contact directories; RFQ status/customer/
due/owner; Quote customer/status/revision; Job status/owner/due/Customer;
operation job/assignee/status; purchasing approval queues; invoice state/due;
Follow-Up owner/status/due; identity provider lookup; and recent/correlation audit.
They enable later replacement of R6’s broad My Work, Floor Board, Operations,
Administration, Jobs/due-work and commercial-directory scans with bounded indexed
queries. No query-plan or latency claim is made here: **real PostgreSQL 17 query
plans and AWS/Azure production timing are NOT YET MEASURED**.

## Migration and compatibility

MOS-133C migration `0001_postgres_foundation` is immutable. MOS-133E adds ordered
checksummed `0002_domain_identity`, `0003_domain_crm_commercial`,
`0004_domain_operations`, and `0005_domain_supporting_workflows`. The existing
lock-protected forward-only runner applies them transactionally where PostgreSQL
permits and reports checksum or schema compatibility failure before readiness.
Table presence is not domain-cutover acceptance.

The future generic data-migration sequence is: immutable source export →
normalization → validation → idempotent import → counts/reference/exact-money
reconciliation → bounded shadow read → brief write freeze/cutover → post-cutover
acceptance. No dual-write is authorized.

## MOS-133F handoff

The first authoritative domain remains Customer + Contact. MOS-133F must map the
Customer Sheets headers and the approved Contact contract to `atlas_customers` and
`atlas_contacts`, preserve canonical IDs, normalize search fields and UTC dates,
classify unresolved legacy ContactIDs, reconcile counts/archives/references, prove
bounded indexed directory search with shadow reads, use a defined write-freeze,
and retain a Sheets rollback boundary. It must not infer Contacts from
`primaryContact`, email, phone, or display name.

## MOS-133D handoff

Installer/readiness must verify an empty or known Atlas database, installation
tenant identity, PostgreSQL version and TLS, separate application/migration roles,
checksummed migration level, session and domain schema smoke, transaction smoke,
and tenant backup/restore responsibility. A restored database with a mismatched
installation tenant must fail readiness rather than being silently adopted.

## Deferred decisions

- First-class operations/work-step lifecycle beyond the demonstrated Job workflow
  projection is a future product decision.
- Firearms tables cover only stable demonstrated serialized identity, custody
  state, and regulatory event history; no activation or regulatory data migration
  is authorized.
- Real PostgreSQL 17 planner evidence, cloud installation validation, and all
  domain service migrations remain later work.
