# MOS-133F — Customer / Contact PostgreSQL Migration and First Domain Cutover

**Status:** MAIN source tooling implemented for local/disposable preproduction validation. No Vitality data, workbook, Script Properties, Apps Script deployment, cloud infrastructure, live identity provider, or production persistence route was changed.

## Actual legacy-source evidence

The current Apps Script mapping defines a `Customers` sheet with `CustomerID`, Company Name, free-form Primary Contact, Email, Phone, commercial fields, and created/updated metadata. Tenant scope is supplied by the trusted repository/audit context. The repository has no first-class Contact repository, Contact mapping, Contacts sheet definition, or Contact lifecycle service. RFQ and Sales Activity mappings contain optional legacy `ContactID` fields only.

Consequently, the migration accepts explicit immutable Contact export records when a tenant has separately established deterministic source evidence. In the current repository baseline, a nonblank RFQ/Sales Activity ContactID without such a record is `UNRESOLVED`. The tool never creates a Contact from Customer.primaryContact, name similarity, email, phone, or positional row matching.

Legacy Sheets remain authoritative until the explicit cutover control succeeds. PLAN, VALIDATE, VERIFY, and CUTOVER_READINESS are read-only. MIGRATE writes only PostgreSQL through a separately authorized server runtime. There is no dual-write and no automatic PostgreSQL-to-Sheets write fallback.

## Reusable migration architecture

`LegacyCustomerContactSourceReader`
→ deterministic normalization and validation
→ Customer/Contact/reference reconciliation plan
→ `PostgresCustomerContactMigrationTarget`
→ post-load verifier
→ structured cutover-readiness report
→ optional `CustomerContactCutoverControl`

The source reader uses an opaque cursor, a maximum 200-row chunk, a 10,000-row configured ceiling, cursor-cycle rejection, authoritative tenant scope, and a deterministic SHA-256 source fingerprint. It preserves immutable row evidence supplied by the exporter and never writes Sheets. A production exporter must read a frozen/bounded Sheets snapshot without formula construction or production mutation.

The business-data migration is separate from the checksummed DDL migration runner. MIGRATE first reruns D-A readiness and D-B installation prerequisites, including application/migration role status, before it records a RUNNING audit or mutates business tables.

## Modes

- `PLAN`: reads and classifies the immutable source plus existing target records; reports intended inserts, idempotent matches, conflicts, warnings, and reference evidence.
- `VALIDATE`: repeats read-only normalization, validation, and target conflict analysis. Any BLOCKING issue prevents MIGRATE.
- `MIGRATE`: requires trusted tenant context, `CUSTOMER_CONTACT_MIGRATE`, explicit confirmation, and a safe run ID. It records RUNNING/COMPLETED/FAILED audit state, executes bounded set-based batches inside the accepted PostgreSQL transaction boundary, and reconciles before retry after failure.
- `VERIFY`: repeatable read-only source/target count and identity reconciliation, including any already-present RFQ/Sales Activity target references.
- `CUTOVER_READINESS`: reruns D-A/D-B readiness and requires verification, role readiness, no active partial run, no unresolved reference, defined source preservation, and zero blocking issues. It never flips authority itself.

There is intentionally no uncontrolled “run everything” action.

## Customer mapping

Valid existing Atlas-style Customer IDs are preserved. Missing or malformed legacy IDs map deterministically from authoritative tenant + source type + stable source-row identity using a version-5-shaped SHA-256-derived identifier; the same evidence always produces the same ID. Row numbers are not used unless an exporter explicitly supplies a stable immutable row identity.

Company Name is required and safely trimmed; normalized name is deterministic lowercase/space normalization for indexed search. Primary Contact remains display text. Email and phone remain ordinary optional fields. ACTIVE/ARCHIVED, version, created/updated timestamps, and archive evidence are preserved. Missing deterministic timestamp evidence uses the explicit epoch sentinel rather than a retry-dependent current time. Malformed meaning is blocked rather than guessed.

## Contact mapping and reconciliation

Contact remains tenant-owned and subordinate to exactly one Customer. Valid `CONTACT-<UUID>` IDs are preserved; other explicit legacy Contact records receive a stable deterministic CONTACT ID. DisplayName and CustomerID are required. ACTIVE/ARCHIVED, version, timestamps, optional email/phone/title-role, and normalized search fields are preserved. Email, phone, name, and title-role are not unique or identity.

References are classified as:

- `RESOLVED`: exactly one explicit Contact mapping exists and tenant + Customer agree.
- `BLANK`: canonical FK is `NULL`.
- `UNRESOLVED`: no deterministic Contact mapping exists; explicit evidence is retained with entity, source record, legacy ContactID, tenant, Customer context, reason, run ID, and resolution status.
- `CONFLICTING`: multiple mappings, Customer mismatch, or tenant mismatch; BLOCKING.

Unresolved evidence never enters canonical FK fields and never generates fake Contact rows. Customer.primaryContact remains unchanged legacy display text. Same-tenant/same-Customer composite relationships are verified for RFQ and Sales Activity records when those records already exist in PostgreSQL; absent downstream-domain rows are not fabricated by this story.

## Existing-target and transaction behavior

Target inspection is tenant-bounded and batched. Exact canonical matches are idempotent. Compatible partial migrations plan only missing inserts. Any conflicting canonical field, mixed-tenant source evidence, unknown target conflict, duplicate canonical ID, malformed row, or conflicting reference blocks.

The PostgreSQL adapter uses only fixed table/column shapes and parameter arrays/JSON batches. Customer and Contact inserts use set-based `jsonb_to_recordset` statements with `ON CONFLICT DO NOTHING` after an in-transaction exact-conflict recheck. Customer inserts precede Contact inserts. Existing RFQ/Sales Activity links are updated with separate fixed parameterized statements. Installation identity is checked inside the same transaction; any failure rolls back the atomic batch. Audit outcome is recorded outside the business transaction so failed/interrupted runs remain distinguishable.

The default maximum batch is 200 and routine configured batch is 100. There is no field-by-field or N+1 lookup design, global tenant scan, arbitrary SQL/table input, browser database access, or giant row report.

## Reconciliation and audit contract

Reports contain source fingerprint and counts; valid/rejected/archived Customer and Contact counts; inserts, already-present matches, and conflicts; RFQ/Sales Activity resolved/blank/unresolved/conflicting counts; structured BLOCKING/WARNING/INFO issues; unresolved-reference evidence; batch size; verification counts; missing/unexpected targets; and cutover readiness.

Audit state contains run ID, tenant, mode, source fingerprint, software version/SHA, schema migration level from D-A, operator, timestamps, counts, blocking count, warnings, and final outcome. Secrets, raw database errors, credentials, and arbitrary raw rows are excluded.

## Cutover and split-brain prevention

`CustomerContactCutoverControl` is the minimum server-authoritative per-domain boundary. A host-supplied persistent store must compare-and-set the tenant route atomically and audit the operation. Activation requires `CUSTOMER_CONTACT_CUTOVER`, server authorization, exact expected version, and a server-side readiness provider that recomputes `READY_FOR_CUSTOMER_CONTACT_CUTOVER`; caller-supplied readiness is never authoritative. It switches Customer and Contact together to PostgreSQL and marks legacy Sheets `READ_ONLY_MIGRATION_EVIDENCE`.

Before cutover, abort leaves Sheets authoritative and PostgreSQL staging may be discarded/reconciled. During MIGRATE, transaction failure rolls back the atomic unit and the audit remains FAILED/RUNNING for intentional reconciliation. Cutover abort leaves routing unchanged. After cutover, PostgreSQL failure is fail-closed: automatic Sheets write fallback is forbidden because PostgreSQL may contain newer writes. Recovery must restore PostgreSQL or explicitly reconcile authoritative post-cutover writes before any later product-approved route change.

No legacy Customer/Contact sheet rows are deleted or rewritten. Automated Sheets read-only enforcement is outside this source-only story; it is an operational prerequisite for a real cutover.

## Verification and real PostgreSQL evidence

Focused tests cover the required source, normalization, Contact contract, references, modes, authority, transaction/idempotency behavior, target conflicts, counts, cutover, redaction, batching, audit, and fixed parameterized PostgreSQL adapter surface.

**REAL POSTGRESQL 17 PREPRODUCTION GATE REMAINS OPEN.** No local PostgreSQL service, `psql`, Docker, or Podman is available in this environment. Real PostgreSQL 17 must still validate DDL migrations, constraints/FKs, rollback, role grants, set-based Customer/Contact loads, reference reconciliation, and representative `EXPLAIN (ANALYZE, BUFFERS)` evidence for tenant/name/status and Customer/Contact indexes before a real tenant cutover. pg-mem and fake-target tests are structural evidence only; no real planner or latency claim is made.

## Future-domain handoff

Reuse the bounded source reader, stable fingerprint/ID mapping, BLOCKING/WARNING/INFO model, target conflict comparison, RUNNING/COMPLETED/FAILED audit lifecycle, fixed set-based transactional loader pattern, repeatable verifier, cutover-readiness composition, compare-and-set domain routing, read-only source preservation, and post-cutover fail-closed rule.

Customer/Contact-specific logic includes primaryContact display preservation, subordinate Contact ownership, duplicate email/phone allowance, ContactID classification, and optional RFQ/Sales Activity linkage.

Do not begin Job migration. MOS-135 must first resolve CUSTOMER versus INTERNAL Job classification and conditional commercial linkage. No MOS-135 implementation is included here.

Production changes: **NONE**.
