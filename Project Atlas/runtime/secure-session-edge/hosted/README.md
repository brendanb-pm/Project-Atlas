# MOS-140C hosted acceptance package

Use a dedicated, short-lived Linux VM with Docker Compose. Only Caddy publishes ports. The Node image serves the authenticated APIs in production security mode. PostgreSQL 17 must be dedicated to this exercise, support authenticated TLS, and be reachable from the VM only over the approved network. This package requires an existing reserved host and service credentials. It does not provision external resources.

## Account and host setup

1. Approve a 4 GiB VM and test window. Use an existing isolated host first. As a reference, a Basic DigitalOcean 4 GiB Droplet is listed at $24/month or $0.03571/hour, about $0.86 for 24 hours. Database, object storage, DNS, AI and any egress are separately metered. Obtain explicit caps for those services and delete the VM after acceptance.
2. Reserve a dedicated DNS hostname. Allow TCP 80/443 to Caddy, restrict SSH to the deployment operator, and allow outbound PostgreSQL, OIDC, S3 and the AI gateway. Block public database access. Use a new DNS record and certificate, with no change to existing tenants.
3. In a dedicated Google test project or Microsoft test directory, register one web client with the exact callback `https://<acceptance-host>/auth/callback`. Use two synthetic users, verify their issuer and OIDC subject for this client, and keep MFA and normal provider protections. Use the provider discovery document for endpoints. The editor in `ACCEPTANCE-A` has tooling and attachment mutation permissions. The reader in `ACCEPTANCE-B` has tooling read permission.
4. Create a dedicated private AWS S3 bucket with the prefix `atlas-mos140c-acceptance-`. Block public access and enable encryption. Give an acceptance-specific principal only GetObject, PutObject and DeleteObject on the two fixture prefixes. Each prefix is the first 20 hex characters of SHA-256 of the literal tenant ID. Give bucket removal privileges to the cleanup operator only. Obtain an approved HTTPS extraction endpoint and scoped token with a low usage ceiling. It receives the schema-bound request with inline binary evidence encoded in `bodyBase64` and returns an object containing `proposals`. The endpoint must support that contract. Synthetic text only is sufficient to begin.
5. Create `atlas_mos140c_acceptance` on a verified isolated PostgreSQL 17 server. Create `atlas_acceptance_migrate` as database owner and `atlas_acceptance_app` as a separate login. Neither should have superuser, role creation, database creation, replication, or bypass-RLS privileges. Set the database comment to `MOS-140C SYNTHETIC ACCEPTANCE ONLY`. Revoke public database CONNECT and public schema CREATE, and grant the application role CONNECT and schema USAGE. Set passwords through the approved secret store. Migration and runtime credentials must be distinct.

## Configure and start after approval

Use separate host directories outside the checkout. Mount files read-only and restrict them to the host operator and container UID 1000. Prepare `settings-json` from the example in each directory. Both directories need their own `database-password` and `database-ca` PEM. The migration directory also needs `oidc-subjects-json`, a two-element JSON array ordered editor then reader. The runtime directory additionally needs `oidc-client-secret`, `s3-credentials-json` with AWS SDK credential keys, and `ai-gateway-token`. None of these files belong in Git, the Docker build context, or logs.

Set `ACCEPTANCE_HOST`, `ACCEPTANCE_RUNTIME_CONFIG`, and `ACCEPTANCE_MIGRATION_CONFIG`. Then from the runtime directory:

```sh
docker compose -f hosted/compose.yml config --quiet
docker compose -f hosted/compose.yml build
docker compose -f hosted/compose.yml run --rm --no-deps migrate
# Apply the application-role grants below as the dedicated database owner.
docker compose -f hosted/compose.yml up -d --wait application proxy
curl --fail --silent "https://${ACCEPTANCE_HOST}/ready"
```

The database role needs SELECT on migration metadata and identity tables. Grant SELECT/INSERT/UPDATE/DELETE only on the runtime-domain tables listed in `runtime-grants.sql`. Never give the app login the migration password or write access to Atlas identity records. Repeat migration seeding with the same subjects only. A different binding requires operator reconciliation.

## Acceptance and cleanup

Use the reviewed acceptance URL and two fresh browser contexts. Run the capture command twice, once for each tenant, with a new output path and the matching synthetic identity. Complete normal provider sign-in and MFA in the displayed browser. On Windows, protect the output directory with restrictive ACLs before running the command.

```sh
MOS140C_ACCEPTANCE_HOST="${ACCEPTANCE_HOST}" node hosted/capture-session.mjs \
  "https://${ACCEPTANCE_HOST}" /absolute/playwright/index.mjs /restricted/editor.json GOOGLE ACCEPTANCE-A
MOS140C_ACCEPTANCE_HOST="${ACCEPTANCE_HOST}" node hosted/capture-session.mjs \
  "https://${ACCEPTANCE_HOST}" /absolute/playwright/index.mjs /restricted/reader.json GOOGLE ACCEPTANCE-B
MOS140C_ACCEPTANCE_HOST="${ACCEPTANCE_HOST}" node hosted/accept.mjs \
  "https://${ACCEPTANCE_HOST}" /absolute/playwright/index.mjs /restricted/editor.json /restricted/reader.json
```

The API rehearsal checks sign-in state, permission and cross-tenant negatives, attachment upload, regrind, persisted readback and 25 sequential latency samples. It records p95 without inventing a production threshold. It creates synthetic records intentionally. Keep the states, query strings, OIDC codes, and cookies out of logs. Use container health and an approved external probe for HTTPS readiness. Collect container stdout and PostgreSQL audit events with restricted access and short retention. Keep reverse-proxy request logging off because callback and locator URLs can carry sensitive values.

The preserved implementation has no hosted tooling UI. The Apps Script tooling workspace is a separate execution path. Full rendered tooling, keyboard and accessibility scenarios need the real hosted UI. Live OIDC, S3 round-trip, AI review, across-restart persistence and representative performance require the approved target and evidence.

To clean up, archive sanitized test results, stop the named Compose project, remove its TLS volume, remove the specific DNS record, revoke the test OIDC and service principals, empty only the acceptance bucket, and delete only the marked acceptance database and its two roles. Delete restricted browser state and credentials. If a disposable VM or service was provisioned, delete it and confirm billing has stopped. Never run cleanup against an existing tenant.
