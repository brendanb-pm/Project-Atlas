# Atlas secure-session edge — preproduction runtime

**Status:** IMPLEMENTED FOR PREPRODUCTION TESTING ONLY. It is not deployed,
connected to PostgreSQL, configured with real provider credentials, or integrated
with the current Apps Script application.

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

`jose` is the only runtime dependency and performs live ID-token/JWKS validation;
the package does not implement JWT cryptography itself. Node's standard `crypto`
is used only for opaque random values, hashes, and PKCE S256.

## MOS-133C handoff

MOS-133C must replace `PreproductionMemorySessionStore` with a PostgreSQL session
store implementing the same methods: `create`, `getByOpaque`, `get`, `update`,
`listActiveForUser`, `revokeAllForUser`, and `cleanupExpired`. The schema requires
opaque and CSRF hashes, user/provider/issuer/subject, permitted and active tenant,
issued/authenticated/activity/idle/absolute timestamps, status, version/rotation,
and revocation fields. Queries must be tenant-installation scoped, bounded, and
transaction-safe; session rotation must atomically create the replacement and
invalidate the prior record.

MOS-133C also supplies tenant runtime database connectivity, installation identity,
health/readiness, migrations, and the persistence-provider implementation. It may
not replace the trusted request-context or fail-closed production-store contract.

## Still required before live activation

- tenant-owned PostgreSQL session persistence and schema/migration acceptance;
- tenant HTTPS origin, certificate, secret manager, provider registration, and
  approved configuration policy;
- live Google/Microsoft OIDC, callback, consent, JWKS, provider outage, and logout
  evidence;
- browser/device/accessibility, preproduction deployment, security-header/CSP,
  session revocation, observability, backup/restore, and performance acceptance;
- separate authorization to publish or connect Apps Script/UI flows.
