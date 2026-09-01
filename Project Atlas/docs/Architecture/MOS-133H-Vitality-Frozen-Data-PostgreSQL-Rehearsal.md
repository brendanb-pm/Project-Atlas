# MOS-133H — Vitality Frozen-Data PostgreSQL Migration Rehearsal

## Status

**PASS.** A newly acquired, immutable Vitality workbook snapshot completed the accepted MOS-133F Customer/Contact workflow against disposable local PostgreSQL 17 after the Vitality data owner explicitly classified two ID-only records as test data and authorized their exclusion.

Production changes: **NONE**. The live Google Sheet remained read-only and authoritative. No cutover action, Apps Script change, Script Properties change, deployment, permissions change, production PostgreSQL operation, or production persistence-route change occurred.

## Execution identity

- Project Atlas starting baseline: fe5200acc46b3681ba404a2f8218552e3a1508ef.
- Canonical Codex Standards: 68a6d872c96c88d002b2d2605c407c42a1058a03.
- Local server: PostgreSQL 17.11 on loopback with SCRAM-SHA-256 authentication.
- Disposable database: atlas_preprod_vitality_mos133h, explicitly marked as a local MOS-133H rehearsal resource.
- Roles: separate non-superuser migration and application roles; credentials remained in process-local/DPAPI-protected handoff storage and never entered repository files or logs.
- Accepted Atlas schema migrations: CURRENT.
- MOS-133D-A readiness: READY.
- MOS-133D-B installation prerequisites: READY_FOR_NEXT_STEP.
- Raw source, exact source identifiers, and credentials remained outside the repository.

## Frozen source provenance

- Workbook ID: 1pWL1_FZmrCTJI6yCHqtNUIPBjQ0zG_2GqiYUOZTCAco.
- Workbook title: Project Atlas - MOS.
- Drive modification timestamp observed before export: 2026-08-17T22:41:51.258Z.
- Acquisition timestamp: 2026-09-01T06:32:28.9666113Z.
- XLSX SHA-256: 268BBB8A0CFD4662B4CF622B96B0F6A7ADFC7B525788E3D9E8A856385687D430.
- Normalized workbook-value SHA-256: 1A7F0C034FF0DD402201CC6F2D6ED21A3EBAE62FF4E16C22B9220B247D4F1FD8.
- Raw MOS-133F source fingerprint: 9c2b8186d37030f4a94d9eeb876f39d9a482b53cde7bfb5de0e08e31c87b2ada.
- Effective source-plus-decision fingerprint: f433325165676157a142575912126768fa840898dab517ba8ac83dfd33871a3e.
- Sheet count: 37.

The normalized value fingerprint matches the prior blocked snapshot, confirming the data itself did not move between acquisitions. The new byte fingerprint and acquisition timestamp identify the new frozen export. All execution reads after acquisition used the frozen local copy. Its byte hash was rechecked after the rehearsal and remained unchanged.

## Source scope and classification

| Classification | Count | Scope |
| --- | ---: | --- |
| SUPPORTED_NOW | 1 | Customers |
| PARTIAL | 1 | RFQs as Customer/Contact reference evidence only |
| FUTURE_DOMAIN | 31 | All other business, identity, administration, and audit tabs |
| LEGACY_ONLY | 4 | Analytics, domains, system catalog, readme |
| UNKNOWN | 0 | None |

Raw executable evidence contained five Customer rows, zero explicit Contact rows, one RFQ row, and zero Sales Activity rows. The workbook has no Contact sheet. Customer primary-contact display text, names, email, phone, and row position were never used to synthesize Contacts.

## Authorized test-data exclusions

The data owner decision MOS-133H-COMPLETION-2026-08-31 authorized exactly:

| Entity | Sanitized source-identity hash | Classification | Target matches |
| --- | --- | --- | ---: |
| Customer | A996CFBD2052 | AUTHORIZED_TEST_DATA | 0 |
| RFQ | F13095B6712D | AUTHORIZED_TEST_DATA | 0 |

The Customer was ID-only with no Company Name. The RFQ was ID-only with no Customer relationship. Neither record was repaired, synthesized, reclassified as business data, or migrated. No unrelated row was excluded.

The accepted source reader now supports a narrow exclusion manifest with these controls:

- only the explicit AUTHORIZED_TEST_DATA reason is accepted;
- entity, authorizer, decision reference, and bounded printable opaque source identity are required;
- every entry must match exactly one frozen source row;
- duplicate, unmatched, malformed, or unsupported entries fail closed;
- raw and effective counts/fingerprints remain distinct;
- exclusion evidence flows through PLAN, VALIDATE, MIGRATE reports, and PostgreSQL migration audit details.

The manifest containing exact source identities remained local and untracked. Committed evidence uses only deterministic truncated identity hashes.

## PLAN and VALIDATE

| Mode | State | Blocking | Warnings | Time |
| --- | --- | ---: | ---: | ---: |
| PLAN | READY | 0 | 0 | 2.27 ms |
| VALIDATE | READY | 0 | 0 | 0.83 ms |

Raw counts reconciled to effective counts as follows:

| Entity | Raw | Authorized exclusions | Effective |
| --- | ---: | ---: | ---: |
| Customers | 5 | 1 | 4 |
| Contacts | 0 | 0 | 0 |
| RFQs | 1 | 1 | 0 |
| Sales Activities | 0 | 0 | 0 |

Both modes planned four Customer inserts, zero Contacts, and zero reference updates. They produced no unresolved/conflicting reference evidence and made no PostgreSQL mutation.

## MIGRATE and VERIFY

The initial confirmed migration MOS133H-VITALITY-1 completed transactionally:

- Customers: 4 inserts, 0 already present, 0 conflicts.
- Contacts: 0 inserts; no Contact synthesis.
- RFQ/Sales Activity reference mutations: 0.
- Verification: PASS.
- Missing Customers/Contacts: 0/0.
- Unexpected target rows: false.
- Final scoped target: 4 Customers, 0 Contacts, 0 RFQs, 0 Sales Activities.

Exact reconciliation passed:

    raw source - authorized exclusions = effective source = PostgreSQL target
    Customers:       5 - 1 = 4 = 4
    Contacts:        0 - 0 = 0 = 0
    RFQs:            1 - 1 = 0 = 0
    Sales Activity:  0 - 0 = 0 = 0

The repeatable VERIFY run observed four exact already-present Customers, zero missing records, zero unexpected records, no reference conflict, defined source preservation, and no active partial run.

## Idempotency and recovery

The confirmed second pass MOS133H-VITALITY-2 used the same raw and effective fingerprints, completed with zero inserts, and reconciled all four Customers as already present.

A bounded controlled interruption then changed one Customer inside the accepted transaction wrapper and threw before commit. The run recorded FAILED, the transaction rolled back, and the original value remained exact. MOS133H-VITALITY-RECOVER then completed successfully with all four Customers already present.

PostgreSQL audit evidence contains four distinct terminal runs:

- MOS133H-VITALITY-1: COMPLETED;
- MOS133H-VITALITY-2: COMPLETED;
- MOS133H-VITALITY-FAIL: FAILED;
- MOS133H-VITALITY-RECOVER: COMPLETED.

Every run retained raw counts, effective counts, and both authorized exclusion entries. Audit scanning found no credential, connection string, or password material.

## Security, performance, and cutover boundary

- Source access was read-only and frozen before planning.
- Migration required authoritative tenant context, explicit capability, confirmation, and safe correlation IDs.
- PostgreSQL access used separate least-privilege roles and fixed parameterized SQL.
- Cross-tenant, duplicate, unmatched exclusion, target-conflict, and malformed-manifest paths fail closed.
- No raw tenant row or secret is committed.
- A representative tenant-bounded Customer list EXPLAIN (ANALYZE, BUFFERS) returned four rows with 0.032 ms planning and 0.009 ms execution on the disposable dataset. The top plan node was Limit; this is bounded rehearsal evidence, not a production latency claim.
- Total scripted PLAN/MIGRATE/VERIFY/idempotency/recovery evidence completed in approximately 136.5 ms, excluding dependency installation and workbook acquisition.
- CUTOVER_READINESS evaluated READY_FOR_CUSTOMER_CONTACT_CUTOVER.
- Cutover action invoked: **NO**. Sheets remain authoritative; there is no dual-write or automatic fallback.

## Verification scope

Focused exclusion-manifest and Customer/Contact migration tests cover exact matching, audit propagation, raw/effective reconciliation, fail-closed invalid decisions, immutable evidence, tenant authority, fixed SQL, no Contact synthesis, target conflicts, idempotency, and recovery. Because the change affects shared Customer/Contact migration infrastructure, the full secure-session-edge suite and proportional repository regression are required before delivery.

## Handoff

MOS-133H establishes a successful local frozen-data rehearsal for the currently accepted Customer/Contact scope only. It does not authorize production migration or cutover, and it does not begin any future-domain story. A separate production authorization gate must reacquire/freeze the approved source, validate environment-specific backup/restore and operating ownership, rerun readiness and reconciliation, and explicitly authorize the cutover control.

Production changes: **NONE**.
