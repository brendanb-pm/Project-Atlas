# MOS-133D-B — Guided Tenant PostgreSQL Installation

**Status:** preproduction installer package implemented. It guides and reports;
it does not provision cloud resources, initialize a database, execute migrations,
activate identities, or migrate business data.

## Package boundary

`TenantInstallationGuide` is a server-side orchestration layer over the D-A
readiness validator. It never accepts database URLs, passwords, certificates,
provider authority, or tenant authority from browser input. It stores only a
safe readiness projection and tenant acknowledgements. It does not expose a
public runtime route: a future authenticated D-B host integration must authorize
tenant administration before rendering or invoking it.

## Guided sequence

1. Choose an informational deployment target: Amazon RDS for PostgreSQL or Azure
   Database for PostgreSQL Flexible Server. Selection provisions nothing and does
   not select Atlas persistence authority.
2. Confirm the tenant owns hosting, uptime, backups/restores, HA, networking,
   firewall, secret custody, patching, and cloud billing. Atlas supplies software,
   licensing, schema/migration tooling, and readiness validation.
3. Configure endpoint and credentials only through trusted server-side installation
   configuration and tenant secret-manager/key-vault integration.
4. Configure authenticated TLS and separate application/migration roles.
5. Invoke D-A once to check connectivity, PostgreSQL version, role privileges,
   identity, migration/checksum/schema compatibility, session storage, and the
   safe rollback transaction smoke.
6. Prepare, but do not activate, an intentional tenant-scoped first-admin
   bootstrap. It cannot grant `PLATFORM_*` authority.
7. Acknowledge backup/restore responsibility and review the final safe summary.

## State mapping

The package uses `NOT_STARTED`, `ACTION_REQUIRED`, `VALIDATING`, `READY`,
`NOT_READY`, `UNAVAILABLE`, `UPGRADE_REQUIRED`, and `CONFIGURATION_ERROR`.
D-A is authoritative: unavailable connectivity becomes `UNAVAILABLE`, migrations
become `UPGRADE_REQUIRED`, initialization becomes `ACTION_REQUIRED`, and security
or incompatible schema becomes `NOT_READY`. Retry starts a fresh request
generation; a stale result is ignored.

`goLiveEligible` is true only when D-A is `READY`, first-admin bootstrap is safely
prepared, and responsibility plus backup acknowledgements are present. It is an
eligibility indication, not initialization, migration, identity activation, or
production authorization.

## UX and security contract

The render contract gives immediate `aria-busy`/live status, step states, a
keyboard-reachable retry control with visible focus and 44px minimum target, and
no blank terminal state. It has no browser secret input, browser storage, URL
parameters, logs, cloud credentials, provisioning calls, business writes, or
polling. Delayed validation remains in `VALIDATING` with a stable message until a
fresh result resolves.

## Next handoff

A future authenticated tenant-admin host may bind this package to UI after it
implements server-authenticated installation authorization. It must keep D-A
readiness, explicit initialization, explicit migration execution, first-admin
activation, backup acknowledgement, and production go-live acceptance as separate
auditable actions. MOS-133F remains blocked from business-data migration until
that authorized tenant installation/readiness flow is accepted.
