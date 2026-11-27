# MOS-140C single-VM synthetic acceptance

## Authorization and placement

Initial activation in the existing synthetic acceptance resource group. On 2026-11-27 Azure Portal showed zero group resources, a $75 monthly budget with $0.00 reported spend, and $200 in trial credits. The budget sends alerts. Verify credit expiry and meter eligibility before submitting a deployment.

Candidate: West US 2, Ubuntu Server 24.04 LTS x64 Gen2, `Standard_B2als_v2` (2 vCPU, 4 GiB), non-zonal. The size picker listed $27.45 per month and **Insufficient quota - family limit**, so placement is **BLOCKED**. West US 2 managed PostgreSQL was previously denied for this subscription. West US 3 and Central US managed PostgreSQL were previously selectable without a qualified corresponding 4 GiB VM. Keep the single-VM design limited to synthetic acceptance.

| Planning cost before credits | Estimate |
|---|---:|
| VM compute | $27.45 per 730 hours / $0.0376 per hour |
| OS disk, 64 GiB E6 Standard SSD LRS | $4.80/month allowance |
| PostgreSQL disk, 32 GiB E4 Standard SSD LRS | $2.40/month allowance |
| Standard static IPv4 | $3.65/month allowance |
| Fixed baseline retained for 730 hours | $38.30/month |
| 24 or 72 hours with all fixed meters prorated | $1.26 / $3.78 |
| 24 or 72 compute hours with disks and IPv4 retained all month | $11.75 / $13.56 |

Disk figures are planning allowances. Confirm actual disk meters, transactions, egress, encrypted off-VM backup destination charges, and taxes before approval. External S3 and AI are separate, with provider, quotas, rates and maximum spend to be identified by the service owner. Nothing in this estimate authorizes resources or charges.

Request one scoped authorization once the SKU is selectable. Use an initial 24-hour window with an explicit stop time, the specified group, the exact SSH source IPv4 /32, a dedicated DNS A record for `atlas-acceptance.greyfirsystems.com`, and approved Entra synthetic users and stable verified OIDC subjects. Approve least-privilege Atlas permissions for two tooling operators in one tenant, a second-tenant operator, a reader, and a limited work-order role. Confirm a dedicated S3 bucket and scoped credentials, an approved AI endpoint/model, an encrypted backup destination and the secure host access and secret handoff. The existing two-user seed supports the basic fixture. Provision the broader approved membership matrix separately before live acceptance.

## Deployment sequence after approval

1. Compile `single-vm.bicep` and inspect the ARM template before loading it in Azure Portal. Run `Test-SingleVmPlacement.ps1` against the exact group, SSH CIDR and Ubuntu image version, then confirm these same values in the Portal review. Use explicit region, VM SKU and reviewed Ubuntu image version, a new dedicated prefix, SSH public key, and exact routable operator IPv4 /32. Validate that the plan contains only the acceptance VNet/subnet, NSG, NIC, IPv4, VM and two disks. The VM uses encrypted managed disks and retains disks on VM deletion. Inbound is TCP 22 from the approved source, TCP 80/443 for Caddy and a deny rule for other traffic. No database port or Azure database service is created.
2. Install Docker Engine and Compose on the qualified host. Identify the approved blank LUN by Azure disk identity and mount it persistently by UUID. Format only an explicitly approved blank disk. Use `findmnt --mountpoint` to confirm the exact mounted UUID before startup and after reboot. Point `ACCEPTANCE_DB_DATA` at a child directory created only on the mounted disk. Leave that child absent on the bare mountpoint so an automatic Docker restart cannot silently create a database on the OS disk. Do not create the child if the mount check fails.
3. Build the runtime image from the approved repository SHA. Record the base image, build inputs and content digest, then provide `ACCEPTANCE_APP_IMAGE` as the approved image digest. PostgreSQL and Caddy are pinned in the overlay. Mount individual secret files via root-controlled settings directories outside the checkout with read access only for the intended container UID. Never put secrets in command history, generated templates, environment files, image layers, logs, or the DNS record. The `/db-config` directory contains a bootstrap-password file, signed server certificate and private key. The server certificate must cover `postgres` in its SAN. Mount the trusted database CA in both runtime and migration settings, and set the database host to `postgres`.
4. Use `docker compose -f compose.yml -f compose.single-vm.yml` for all commands. Validate configuration with `config --quiet`. Start `postgres` with `up -d --wait postgres`. Connect locally as the PostgreSQL Unix user using `exec --user postgres postgres psql`. Create `atlas_acceptance_migrate` and `atlas_acceptance_app` as LOGIN roles without superuser, creation or replication rights. Set distinct secrets with interactive psql `\password` or the approved secret injection. Create `atlas_mos140c_acceptance` owned by the migration role, with database comment `MOS-140C SYNTHETIC ACCEPTANCE ONLY`. Revoke database access from PUBLIC and grant only the two intended roles. Never mount the bootstrap or migration passwords in the runtime.
5. Run `--profile maintenance run --rm migrate`. Apply `runtime-grants.sql` in the marked acceptance database as the owner or local bootstrap operator. Check exact migration IDs and checksums through 0016 and confirm the runtime role cannot create schema objects or change the ledger. Confirm PostgreSQL has no published port and rejects cleartext network connections. Check the app connection negotiated TLS using `pg_stat_ssl`. The app config enforces trusted CA and hostname verification.
6. After approving the DNS change, point the hostname at the reviewed IP. Start `up -d --wait application proxy`. Verify valid HTTPS and HTTP 200 with `{"status":"READY"}` on `/ready`. Caddy uses its existing HTTPS config. Confirm service and volume scopes and record the deployed SHA. The application can recover its pool after a temporary database interruption and has a bounded process-failure restart policy. No provider or deployment fallback is enabled.
7. Run the hosted acceptance tasks below. Verify the approved 4 GiB host with the compiled package under representative load. Record memory, CPU, swap, disk, p50/p95/p99 and recovery throughout the window.

## Acceptance coverage and evidence

| Gate | Evidence required |
|---|---|
| Infrastructure and migration | Portal inventory, deployed image digest, TLS checks, migration ledger and runtime-role denials |
| Entra | Tenant-specific discovery, callback, expected issuer/audience, durable session, expiration/logout, tenant-selection and unauthorized-identity tests |
| Tooling and MOS-141 | Browser evidence for keyboard search/selection, tool details, evidence, regrind/concurrency/history, locator replacement and acknowledgment, ambiguous mutation recovery and retries, work-order authorization and operation/revision handling |
| Object storage and AI | Real provider upload/retrieval, integrity, retry and scoped negative cases. Exercise real AI processing and human review with approved synthetic fixtures. Current hosted tooling screen does not expose evidence download or AI review; map any required rendered workflow to a scoped implementation before final acceptance. |
| Accessibility | Representative responsive layouts, keyboard, focus, labels, announcements and actual assistive-technology checks |
| Reliability | Same-tenant and cross-tenant workload with shadow-free persistence, deliberate excess, restart, database restore and full role/authenticated readback |

## Backup, stop and rollback

Use a restricted `pg_dump` archive and separately record role definitions, ownership and grants without role passwords. Encrypt the backup before transfer to the approved off-VM destination. Reproduce privileges and new secret bindings on a fresh isolated restore target, check migration IDs and checksums, role ownership, grants and authenticated runtime behavior, and record recovery time. Never restore over the active acceptance database. On failure stop ingress and application, retain verified volumes and sanitized evidence, and avoid down-migrations. Roll back only to an artifact compatible with the current ledger.

Before the approved stop time, stop ingress and the Compose project, then deallocate the verified acceptance VM in Portal if continued running is outside the approval. Read back its status and report any charges retained for disks, backups or IPv4. Preserve data, DNS and resources unless cleanup is separately authorized. If deletion is approved, inventory and remove only the reviewed acceptance resources and verify residual disks, IPs, backups and external fixtures separately.
