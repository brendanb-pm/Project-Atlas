# MOS-133D-B — Guided Tenant PostgreSQL Installation

**Status:** MAIN source package implemented for local/preproduction validation. It does not provision cloud resources, initialize production databases, activate identity providers, or migrate business data.

## Deployment and responsibility boundary

Normal MOS users open the tenant HTTPS URL in a browser; no desktop client is required. A tenant infrastructure administrator prepares the tenant-owned PostgreSQL and runtime environment.

Atlas controls application releases, licensing and entitlements, schema/migrations, compatibility policy, and readiness tooling. The tenant controls its AWS/Azure account, PostgreSQL hosting and uptime, networking/firewalls, database and application secrets, cloud patching/billing, HA, backups, retention/PITR, restore tests, and disaster recovery. The installer requires responsibility and backup acknowledgements but does not claim that Atlas validated backup quality.

Supported guidance targets are Amazon RDS for PostgreSQL with AWS Secrets Manager, Azure Database for PostgreSQL Flexible Server with Azure Key Vault, and an advanced compatible PostgreSQL path using approved server-side secret storage. All targets must meet the same PostgreSQL 17 pilot baseline, authenticated TLS, role separation, identity, schema, and backup requirements. Target selection provisions nothing and cannot change the trusted persistence provider.

Secrets are never accepted in this render contract, returned to the browser, placed in URLs/browser storage/Sheets/vendor records, or logged. Endpoint, database, and role credentials enter only through trusted server-side configuration. Application credentials remain least privilege; separate migration credentials hold only the authority required by the accepted migration runner and are not runtime credentials.

## Ordered workflow

1. Review the web deployment model and tenant/vendor responsibilities.
2. Select AWS RDS, Azure Flexible Server, or compatible PostgreSQL guidance.
3. Review the supported PostgreSQL version; D-A validates the actual server.
4. Configure the trusted server-side endpoint, reachability, private networking where practical, firewall/security-group policy, and database name.
5. Require TLS with certificate validation; there is no normal production bypass.
6. Store application and migration credentials in approved tenant-owned server-side secret storage.
7. Configure the least-privilege application role without schema/migration authority.
8. Configure a distinct non-superuser migration role with required migration authority.
9. Invoke MOS-133D-A with no browser-supplied tenant, provider, credential, or readiness input.
10. Present `EMPTY_COMPATIBLE`, `ATLAS_FOUNDATION_ONLY`, `ATLAS_DOMAIN_SCHEMA`, `ATLAS_OUTDATED`, `ATLAS_INCOMPATIBLE`, `CHECKSUM_MISMATCH`, `UNKNOWN_NON_ATLAS_DATABASE`, or `UNAVAILABLE` without raw SQL/errors.
11. Stop on malformed or conflicting installation/tenant identity. Browser TenantID never overrides trusted identity.
12. Present migration level, target release, checksum/compatibility, backup acknowledgement, and execution availability.
13. Require explicit confirmation, backup acknowledgement, and server authorization before calling the accepted migration runner. Merely viewing or validating never migrates. If no authorized executor is installed, execution is `PENDING`.
14. Re-run D-A after migration. An uncertain failure is `MIGRATION_FAILED` and must be reconciled before retry.
15. Surface D-A session-schema/transaction smoke plus an optional bounded server runtime smoke; no live OIDC activation occurs.
16. Surface an intentional, tenant-scoped first-admin bootstrap; it cannot grant `PLATFORM_*` authority.
17. Require tenant backup/restore/PITR/disaster-recovery acknowledgement.
18. Present the final readiness matrix and distinguish `READY_FOR_NEXT_STEP` from production go-live.

## Authoritative readiness and safe states

`PostgresInstallationReadinessValidator` remains the only technical readiness authority for connectivity, PostgreSQL version, TLS, role privileges, migration/checksum compatibility, schemas, installation identity, tenant scope, and transaction capability. D-B projects only allow-listed D-A state/code fields, translates them into operator actions, and may add a bounded session/runtime smoke. It does not duplicate D-A SQL or policy.

Final dimensions are `DATABASE`, `TLS`, `APPLICATION_ROLE`, `MIGRATION_ROLE`, `SCHEMA`, `CHECKSUMS`, `INSTALLATION_IDENTITY`, `SESSION_STORE`, `RUNTIME`, `FIRST_ADMIN`, `BACKUP_RESPONSIBILITY`, `LIVE_OIDC`, and `BUSINESS_DATA_MIGRATION`, each using `PASS`, `ACTION_REQUIRED`, `PENDING`, `NOT_APPLICABLE`, or `UNAVAILABLE`. Overall state is only `READY_FOR_NEXT_STEP` or `NOT_READY`; `goLiveEligible` remains false because database installation readiness is not production acceptance.

Remediation categories cover database reachability, TLS, version, application and migration roles, unknown/incompatible databases, outdated schema, checksum failure, installation-identity conflict, session/runtime readiness, migration required/failed, OIDC pending, and ready. Each identifies the responsible party, broad safe action, and whether retry is safe.

## Interaction, accessibility, and concurrency

Validation immediately enters `VALIDATING`, exposes `aria-busy` and a polite live status, disables duplicate retry, and remains in a deterministic state until completion. Each attempt has a monotonically increasing generation; late or cancelled results are ignored and cannot overwrite newer configuration. There is no polling. Migration execution rejects duplicates and never blindly retries an uncertain mutation.

The render contract uses semantic headings, ordered progress navigation, labelled status regions, non-color-only text states, keyboard-reachable controls, visible focus, disabled/busy semantics, and 44px minimum controls. It escapes rendered values and never renders stack traces, credentials, connection strings, or raw PostgreSQL errors. Rendered visual, screen-reader, and physical-device acceptance remain later host-integration gates; source/tests are code-level evidence only.

## MOS-133F handoff

Before MOS-133F Customer/Contact migration begins: D-A PostgreSQL readiness must pass; installation identity and tenant scope must be confirmed; MOS-133C/E migrations/checksums must be valid; application and migration roles, session store, and tenant runtime must be ready; backup/rollback expectations must be acknowledged; and the authenticated first-admin/activation boundary must be controlled. Source Sheets remain authoritative until an explicitly accepted F cutover. No dual-write is assumed, and Customer/Contact migration tooling is still required.

Production changes: **NONE**.
