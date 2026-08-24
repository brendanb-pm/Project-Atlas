# MOS-133B — Persistence Provider Contract

Status: Implemented on source baseline `67a1490e064334013324b753f35803698665822e`

Release channel: MAIN

Production changes: none

## Purpose

MOS-133B establishes the persistence seam:

```text
Atlas service -> domain repository -> persistence provider -> Sheets now / PostgreSQL later
```

It does not add PostgreSQL connectivity, credentials, SQL, schema, migrations, cloud resources, workbook changes, or provider cutover.

## Canonical Contract

`Repository/PersistenceProvider.gs` defines the storage-neutral provider vocabulary:

| Need | Contract |
|---|---|
| Trusted scope | `createTenantPersistenceScope_(AuditContext)` or `createControlPlanePersistenceScope_(systemContext)` |
| Exact read | `getForScope(scope, canonicalId)` |
| Existence | `existsForScope(scope, canonicalId)` |
| Bounded filtered list | `listForScope(scope, { limit, filters, orderBy, cursor })` |
| Uniqueness/idempotency lookup | `findUniqueForScope(scope, criteria)` and `createForScope(..., { idempotencyCriteria })` |
| Create | `createForScope(scope, record, options)` |
| Conditional update | `updateForScope(scope, id, changes, { expectedVersion })` |
| Archive | `archiveForScope(scope, id, changes, options)` |
| Append-only record | `appendForScope(scope, event, options)` |
| Capability discovery | `capabilities()` |
| Atomic transaction | `runInTransaction(work)` |

Routine provider reads require an explicit positive `limit`, are capped at 200, validate filter/sort fields against the canonical mapping, order deterministically with `id` as the tie-breaker, and return a cursor-ready envelope:

```text
{ items, limit, hasMore, nextCursor, orderBy }
```

Bulk import/export and migration operations are deliberately absent. They belong to the separately privileged migration/install tooling planned in MOS-133D/E/G, not a browser-facing repository API.

## Tenant Scope

Tenant-scoped provider methods accept only an immutable scope created from an authoritative Atlas AuditContext. A raw tenant string, browser request, or unmarked object is rejected. The provider verifies a configured tenant field on every scoped read/write and stamps that field from the trusted scope during scoped creates.

Control-plane operations use a separate trusted system scope. This prevents tenant data APIs from becoming a platform-control-plane bypass.

Legacy workbook entities that lack a durable tenant column remain on legacy aliases during transition. They cannot be claimed as tenant-safe merely by passing a browser tenant ID. Their existing service/AuditContext guards remain authoritative until their domain migration adds the PostgreSQL tenant constraint. This is a documented temporary exception, not a fallback security model.

## Provider Selection

`ConfigPersistence.gs` reads the server-side, installation-controlled `ATLAS_PERSISTENCE_PROVIDER` property:

- absent or `SHEETS`: select the Sheets provider;
- `POSTGRESQL`: reserved for MOS-133C;
- any other value: configuration error;
- `POSTGRESQL` before a registered provider: `PROVIDER_UNAVAILABLE`.

Selection is never derived from browser input. There is no automatic PostgreSQL-to-Sheets fallback, avoiding competing authority after future cutover.

## Capability and Transaction Semantics

The Sheets provider reports:

```text
atomicTransactions: false
optimisticConcurrency: true
indexedSearch: false
cursorPagination: true
boundedRoutineReads: true
bulkMigration: false
```

`runInTransaction` explicitly returns `TRANSACTION_UNSUPPORTED`; it does not simulate relational atomicity. Future PostgreSQL may report real atomic transactions and indexed search without changing service-facing contract names. Existing command IDs, AuditContext, operation ledger, recovery checkpoints, and external-effect reconciliation remain necessary even when a future database transaction makes an in-database aggregate atomic.

## Sheets Adapter

`SheetsPersistenceProvider_` delegates to the proven `SheetsRepository_` mapping/serialization/write behavior. Its legacy aliases (`list`, `findById`, `findFirstByFields`, `insert`, `insertUnique`, `updateById`) preserve current domain services without workbook migration or extra provider reads.

The following constructors now select the provider rather than directly instantiate Sheets:

- generic MVP Customer/RFQ/Quote/Job/Invoice factory;
- Atlas identity repositories, including scoped SecurityAuditEvent helpers;
- operational JobEvent and JobQrToken factory.

The unconverted direct Sheets constructors remain temporary wrappers: Quote costing/source, commercial control-plane, purchasing, cash receipts, Follow-Up/calendar, Sales Activity, Ideas, Firearms, and selected legacy repositories. Existing JobEvents also remain legacy for tenant-scoped reads because their supplied workbook mapping has no durable tenant column. They continue to use the same `SheetsRepository_` implementation and are conversion work for their respective domain migrations; MOS-133B intentionally does not rewrite them merely for uniformity.

## Error Model

Storage-neutral errors now cover:

- `NOT_FOUND`;
- `CONFLICT`;
- `PROVIDER_UNAVAILABLE`;
- `TRANSACTION_UNSUPPORTED`;
- `SCHEMA_INCOMPATIBLE`;
- existing validation, configuration, authorization, unknown-outcome, and operation-in-progress errors.

Client-safe errors do not expose sheet names, ranges, SQL, database hosts, credentials, or raw driver exceptions. Provider-specific diagnostics remain server-side/redacted under existing error handling.

## Representative Proof

`tests/persistence-provider-contract.test.js` is reusable against the Sheets implementation and future PostgreSQL implementation. It proves:

- authoritative tenant scope creation and rejection of untrusted scope;
- provider capability declaration and transaction non-support;
- explicit bounded list/read, deterministic ordering, cursor continuation, and no extra wrapper list calls;
- foreign tenant denial before record return or write;
- create/update/idempotency replay/conflict behavior;
- append-only event behavior;
- fail-closed provider selection;
- generic, identity/security, and operational repository factory integration.

Existing MOS-121 recovery and Sheets persistence tests remain the regression proof that the adapter has not changed canonical IDs, mappings, idempotency, audit, or recovery behavior.

## MOS-133C Boundary

MOS-133C may add a PostgreSQL implementation of this contract and a tenant-hosted runtime/provider foundation. It must not alter the selection fail-closed rule, tenant scope contract, bounded routine-read envelope, or the distinction between real transactions and higher-level recovery.
