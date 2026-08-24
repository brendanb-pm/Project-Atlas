# Atlas secure-session edge — preproduction runtime

**Status:** IMPLEMENTED FOR LOCAL/PREPRODUCTION VALIDATION ONLY. It is not
deployed, configured with real provider credentials, or integrated with the
current Apps Script application. MOS-133C adds PostgreSQL runtime/provider/session
code; it has not connected to a tenant database or performed a business-domain cutover.

This package is the first tenant-hosted Atlas edge/API boundary. It runs one Node
process containing the HTTP edge and trusted API middleware. Keeping them in one
process for V1 prevents a public reverse-proxy header from becoming identity or
tenant authority.

## Implemented contract

- Google and Microsoft provider-neutral authorization-code + PKCE adapters;
- one-time, browser-bound state/nonce/PKCE attempts and callback replay rejection;
- explicit external identity -> Atlas user -> active membership resolution;
- opaque `HttpOnly`, host-only session cookie with no user, tenant, role,
  capability, entitlement, or provider-token claims;
- server-side session records, idle/absolute expiry, rotation, logout, revoke-all,
  tenant selection/switching, and synchronizer CSRF tokens;
- request-local capability and entitlement reauthorization through `AtlasAuthority`;
- same-origin-only mutations, no broad CORS, redacted audit events, safe error
  responses, security headers, bounded input, and rate-limit hooks;
- a protected **preproduction-only** context harness proving that forged browser
  tenant/user/capability fields are ignored.
- a server-only PostgreSQL 17-compatible pool, parameterized foundation provider,
  durable opaque-session store, checksummed migration runner, and safe readiness
  contract. `pg` 8.16.3 is the maintained pool/client; `pg-mem` is test-only.

The production configuration refuses the in-memory session store and refuses
preproduction test routes/providers. If a required production store is absent,
protected authorization fails closed.

## Local preproduction verification

```text
npm install
npm test
```

Tests use deterministic test-provider adapters. They are not selectable in
production configuration. They prove the browser-equivalent path:

```text
sign-in start -> callback -> opaque session -> protected context
-> tenant switch/rotation -> logout/revocation denial
```

This is **not** live Google or Microsoft acceptance. The runtime does not expose
an operator UI, create OIDC credentials, or call production providers.

## Configuration boundary

The runtime accepts server-side configuration only. Required future configuration
includes a canonical HTTPS origin, enabled provider configuration, tenant-bound
installation identity, session policy, and a PostgreSQL session store. OIDC client
secrets, if needed, live exclusively in tenant secret management. Do not put them
in source, package files, browser JavaScript, URLs, logs, or Sheets.

`jose` performs ID-token/JWKS validation and `pg` provides PostgreSQL pooling;
the package does not implement JWT or database protocols itself. Node's standard
`crypto` is used only for opaque random values, hashes, cursor integrity, and PKCE S256.

## PostgreSQL foundation (MOS-133C)

`createPostgresFoundation` is the server/install-controlled assembly point. It
requires `database.provider = POSTGRESQL`, an injected tenant secret provider,
and a server-only cursor integrity secret. It creates separate application and
migration runtimes: the application role performs bounded parameterized reads and
writes; only the migration role can apply ordered, checksummed migrations. The
normal runtime never auto-runs privileged migrations and never falls back to
Sheets or an in-memory session store if PostgreSQL is selected.

Production requires TLS with certificate verification, a bounded pool (default
maximum 10), acquisition/query timeouts, and a PostgreSQL session store. The
foundation schema is deliberately limited to migration metadata, installation
identity, opaque hashed sessions, security-event append storage, and a minimal
provider-contract test entity. It does **not** create Customer, Quote, Job, or
other business-domain tables.

Routine provider reads require an authoritative `{ tenantId, userId }` scope, an
explicit limit (maximum 200), stable allow-listed ordering, and an integrity-bound
keyset cursor. Values are query parameters; identifiers/order fields are fixed
server allow lists. Session cleanup is a bounded maintenance operation, not a
normal-request scan. Session activity touch is coalesced by a configured interval.

`npm test` uses `pg-mem` only as a deterministic SQL-contract harness. Its
transaction emulator is not accepted as PostgreSQL 17 transactional evidence;
the suite separately verifies the runtime's one-client `BEGIN`/`ROLLBACK` path.
Real PostgreSQL 17, RDS, and Azure Flexible Server acceptance remains **NOT YET
MEASURED** because this workspace has no Docker, `psql`, or local PostgreSQL service.

## MOS-133E / MOS-133D handoff

MOS-133E owns canonical domain schema: explicit `TenantID`, canonical text IDs,
UTC `TIMESTAMPTZ`, `NUMERIC` money/rates, integer optimistic versions, archive
timestamps, immutable history/event tables, composite tenant-safe foreign keys,
and per-access-pattern indexes. It uses this runner's forward-only checksummed
migrations, one migration role, advisory lock, readiness compatibility check,
transaction primitive, and idempotency uniqueness pattern. It must not alter
applied migration content.

MOS-133D owns the tenant installer/readiness flow: endpoint and TLS validation,
secret references, separate application/migration credentials, PostgreSQL version
and installation-tenant validation, controlled migration execution, session and
transaction smoke tests, backup acknowledgement, and post-restore compatibility.
No source component accepts browser-selected provider/database/tenant authority.

## Still required before live activation

- tenant-owned PostgreSQL session persistence and schema/migration acceptance;
- tenant HTTPS origin, certificate, secret manager, provider registration, and
  approved configuration policy;
- live Google/Microsoft OIDC, callback, consent, JWKS, provider outage, and logout
  evidence;
- browser/device/accessibility, preproduction deployment, security-header/CSP,
  session revocation, observability, backup/restore, and performance acceptance;
- separate authorization to publish or connect Apps Script/UI flows.
