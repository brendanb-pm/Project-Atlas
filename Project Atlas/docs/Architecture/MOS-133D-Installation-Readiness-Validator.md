# MOS-133D-A — PostgreSQL Installation Readiness Validator

**Status:** implemented for local/preproduction validation only. It neither
provisions infrastructure nor initializes, migrates, activates, or cuts over a
tenant installation.

## Boundary

`PostgresInstallationReadinessValidator` is a server-side, PostgreSQL-specific
inspection component behind a provider-neutral installation boundary. Its inputs
are server/install configuration, separately configured application and migration
runtimes, the accepted migration inventory, and an authoritative installation
tenant ID. It accepts no browser-selected provider, database, credential, or
tenant authority.

Readiness is rerunnable and read-only. An empty database returns
`INITIALIZATION_REQUIRED`; it does not call migration `apply()`. A transaction
smoke uses `BEGIN READ ONLY → SELECT 1 → ROLLBACK`; it creates no business data,
users, or sessions.

## Safe result contract

The result contains only an overall `state`, a bounded `remediationCode`, and
bounded check state/code pairs. It contains no password, secret reference,
connection string, host, SQL, stack trace, migration SQL, or raw driver error.

| Overall state | Meaning / next action |
| --- | --- |
| `READY` | Configuration, identity, roles, schema and rollback smoke are suitable for runtime. |
| `INITIALIZATION_REQUIRED` | No Atlas migration metadata or no installation identity; D-B may offer an explicitly authorized initialization action. |
| `MIGRATION_REQUIRED` | A known older Atlas schema requires separately authorized migration execution. |
| `UPGRADE_REQUIRED` | Migration metadata reports incomplete upgrade state; operator intervention is required. |
| `CONFIGURATION_ERROR` | Server configuration, version probe, or checksum drift is invalid. |
| `DATABASE_UNAVAILABLE` | Connectivity or bounded inspection failed. Retry after tenant cloud remediation. |
| `SECURITY_ERROR` | TLS, installation identity, tenant scope, or role separation/privilege is unsafe. |
| `INCOMPATIBLE` | Unsupported PostgreSQL version, schema-ahead state, or canonical schema structure is incompatible. |

## Validation order

1. Require server-controlled `POSTGRESQL` selection and a non-`PLATFORM_*`
   authoritative expected tenant ID.
2. Require distinct configured application and migration credentials.
3. Require production authenticated TLS configuration on both runtimes.
4. Test bounded connectivity and inspect PostgreSQL version. PostgreSQL 17 is the
   supported pilot. PostgreSQL 18 is explicitly reported as certification-required
   rather than treated as an opaque failure; no PostgreSQL-specific feature blocks
   later certification.
5. Inspect least-privilege application and separate migration role facts.
6. Detect empty migration metadata without creating it.
7. Validate exactly one installation identity and match it to the trusted tenant.
8. Check ordered/checksummed migration compatibility, C foundation tables, E
   domain tables, and session storage table.
9. Run the read-only rollback smoke.

## Role requirements

The **APPLICATION** role must not be superuser, own/create the serving schema, or
write `atlas_schema_migrations`. The **MIGRATION** role must be separate,
non-superuser, able to create the serving schema during controlled installation,
and able to maintain migration metadata. Deployment role grants must additionally
restrict normal application DDL and immutable-history mutations as documented by
MOS-133E. Production privilege facts require real-engine validation; local
pg-mem fixtures test the validator contract through deterministic role probes.

## Installation identity and schema level

`atlas_installation` must contain exactly one well-formed installation record whose
tenant matches the trusted server configuration. The validator treats missing,
empty, malformed, and mismatched records distinctly and never accepts browser
tenant input. It verifies C foundation and E canonical-domain structure without
claiming that data migration or domain cutover occurred merely because tables
exist.

## Real PostgreSQL evidence

**REAL POSTGRESQL 17 VALIDATION: NOT PERFORMED — ENVIRONMENT UNAVAILABLE.** No
safe disposable Docker, Podman, or `psql` environment was available. D-A's local
integration suite uses pg-mem only for deterministic structural/readiness checks.
Real PostgreSQL 17 privilege checks and representative `EXPLAIN` evidence remain
required in a later disposable tenant-owned preproduction environment; production
AWS RDS/Azure timing remains **NOT YET MEASURED**.

## MOS-133D-B handoff

D-B may render these safe codes in a tenant-admin/cloud-admin guided experience.
It must guide—not automate without explicit authority—AWS RDS PostgreSQL or Azure
Flexible Server selection, network/TLS, tenant secrets manager/key vault,
separate application and migration credentials, explicit initialization/migration,
first-admin and entitlement bootstrap, backup/restore acknowledgement, and final
readiness/go-live acceptance. D-B must keep readiness, initialization, migration,
installation UX, and production activation as separate actions.
