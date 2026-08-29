# MOS-133G — Real PostgreSQL 17 Validation and Migration Rehearsal

## Scope and isolation

MOS-133G validated the accepted Atlas PostgreSQL foundation, guided installation workflow, secure-session edge, and MOS-133F Customer/Contact migration against a locally hosted PostgreSQL 17 instance. The rehearsal used only the clearly marked disposable database `atlas_preprod_mos133g`. It did not connect to Vitality data, a tenant production database, or any production Atlas route.

The database and two login roles are created only after exact disposable identity checks. The migration role owns the rehearsal database but is not a superuser and cannot create databases or roles. The application role is separately authenticated, cannot create schema objects, cannot modify installation identity or migration metadata, and receives only the table DML required by the runtime. Generated role credentials remain in process memory. Bootstrap credentials were supplied through process-local environment variables and were not written to repository files, logs, reports, or connection strings.

## PostgreSQL and schema results

- Server major: PostgreSQL 17.
- Empty-database classification: MOS-133D-A returned `INITIALIZATION_REQUIRED` without mutation.
- Schema source: the accepted checksummed `FOUNDATION_MIGRATIONS` only; no parallel DDL was introduced.
- First migration: `CURRENT` and ready, with migrations recorded in order.
- Reapply: idempotent; migration timestamps remained unchanged.
- Checksums: accepted checksums passed; a controlled mismatch failed closed without metadata mutation.
- Concurrent apply: two runners serialized successfully through one session-pinned advisory lock.
- Final readiness: MOS-133D-A returned `READY`, including PostgreSQL 17 support, separated least-privilege roles, current schema, session schema, installation identity, and rollback proof.
- Guided installation: MOS-133D-B consumed the real readiness result and returned `READY_FOR_NEXT_STEP`, while retaining `goLiveEligible: false` and `productionGoLive: PENDING`.

Real PostgreSQL enforced the tested primary keys, foreign keys, tenant relationships, required fields, status checks, positive versions, partial uniqueness, external-identity uniqueness, exact large integer money values, and numeric quantity precision. Successful Customer/Contact writes committed together. A controlled failure rolled back the complete transaction.

## Secure-session edge

The PostgreSQL session store passed create, opaque-hash lookup, rotation, single-session revocation, user-wide revocation, bounded expired-session cleanup, restart persistence, and opaque-hash uniqueness tests. Browser session secrets were not stored in plaintext. Runtime evidence and logs were checked for credentials and connection strings.

## MOS-133F rehearsal

The accepted MOS-133F implementation was exercised without rebuilding it:

- `PLAN` and `VALIDATE` were read-only.
- Initial `MIGRATE` loaded three synthetic Customers and three synthetic Contacts transactionally.
- Identical retry was idempotent with stable canonical IDs and source fingerprint.
- A compatible partial target restored only the missing Contact.
- Resolved and blank RFQ references and a Sales Activity reference reconciled correctly.
- `VERIFY` was repeatable and compared fields and references, not counts alone.
- Unresolved, conflicting, and cross-tenant reference cases failed closed; Customer display/email/phone fields never synthesized Contacts.
- Controlled Customer and Contact mismatches were detected.
- A controlled interrupted migration rolled back, recorded a distinct failed audit result, and then recovered successfully.
- Completed and failed audit evidence remained distinct and credential-safe.
- `CUTOVER_READINESS` became ready only after successful reconciliation and did not itself change authority.

A disposable PostgreSQL cutover-control table then proved an atomic Customer-and-Contact compare-and-set switch. A stale version and browser-supplied authority were rejected. Post-switch routing was PostgreSQL-only with no dual write and no automatic Sheets fallback. This isolated proof did not alter Atlas production routing.

## Query-plan evidence

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` was run for representative Customer lookup/list, Contact lookup/by-Customer, RFQ and Sales Activity references, opaque session lookup, and recent migration audit queries. PostgreSQL selected indexes in every recorded plan, including Customer, Contact, RFQ, Sales Activity, session opaque-hash, and recent security-audit indexes. Execution times in the accepted local run were below 0.1 ms for each representative query. The initial schema migration completed in approximately 145 ms, the initial synthetic Customer/Contact migration in approximately 39 ms, and reconciliation verification in approximately 3 ms. These local, low-volume timings prove basic query shape and index use; they are not production capacity or latency claims. No material index-design gap was found.

## Differences from the in-memory harness

Real PostgreSQL exposed three relevant behavioral differences:

1. Advisory locks are session-affine. The previous migration runner acquired and released a lock through pool-level queries, so different sessions could leak the lock and block later runs. The runtime now pins one migration-role client until unlock and release. A focused unit test and the concurrent real migration test cover the corrected contract.
2. PostgreSQL's extended query protocol rejects parameterized multi-statement query strings. Rehearsal setup calls were split into one statement per query. Accepted production paths already use parameterized, single-statement calls.
3. `timestamptz` values decoded by the client reflect client timezone representation. Rehearsal assertions normalize timestamps explicitly; the stored database instants were correct.

The advisory-lock issue was classified as a code defect and fixed. The other two were rehearsal-harness assumptions, not accepted Atlas runtime defects. Real SQLSTATE behavior, constraints, transaction semantics, and planner selection are now proven in addition to the existing in-memory coverage.

## Remaining gates and handoff

Production changes: **NONE**.

Before a Vitality rehearsal, use a newly authorized non-production copy, provision tenant-specific secret references and separated roles, prove backup/restore responsibility, run MOS-133D-A and MOS-133D-B, execute MOS-133F in `PLAN` and `VALIDATE` first, preserve migration/audit evidence, and require reconciled `VERIFY` plus explicit cutover authority. Rotate any bootstrap credential disclosed through an interactive channel. Vitality production activation remains a separate authorization and acceptance event.

Job/Work Order migration, MOS-133F expansion beyond Customer/Contact, and MOS-135 remain deferred.
