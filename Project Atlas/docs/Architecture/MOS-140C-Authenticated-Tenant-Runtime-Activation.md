# MOS-140C — Authenticated Tenant Runtime Activation and Release Acceptance

## Decision

**Current release decision: NO-GO / BLOCKED.** Source now contains the tenant-runtime composition and authenticated tooling API boundary, but no approved Vitality-equivalent tenant runtime, live OIDC configuration, or usable real PostgreSQL 17 engine was available for this acceptance. The Apps Script `ToolingWorkspace.html` remains the verified legacy/source UI and is not represented as a tenant-runtime UI. No production activation occurred.

## Implemented Runtime Boundary

The existing single-process secure-session edge now accepts a fixed protected-API router. Every `/api/tooling/*` request resolves the opaque server-side session, re-resolves the Atlas user and active tenant membership in tenant PostgreSQL, evaluates entitlement through the existing injected hook, and checks the required capability before a canonical service runs. Mutation routes additionally require the session-bound synchronizer token and accepted Origin/Referer. Browser tenant, user, role, capability, provider, and entitlement claims are ignored.

The production composition root uses:

- the existing PostgreSQL pool/runtime and readiness contract;
- `PostgresSessionStore` plus the new durable, single-use `PostgresAuthAttemptStore`;
- `PostgresAtlasAuthority` for external identity, user, membership, and capability resolution;
- the existing tooling, attachment, AI processing, and human-review services and PostgreSQL repositories;
- tenant-configured non-test object storage and AI adapters;
- PostgreSQL security audit events and safe correlation IDs.

The normal tenant runtime loads only the APPLICATION credential. It can inspect migration compatibility but cannot apply migrations and does not load or retain the MIGRATION credential; migrations remain a separate controlled installation action.

Production construction fails closed unless PostgreSQL is ready, the session store is PostgreSQL-backed, OIDC adapters are non-test, and object-storage/AI adapters are non-test. It never falls back to memory sessions or Sheets.

## Bound Routes

| Method and path | Capability | Canonical operation |
|---|---|---|
| `POST /api/tooling/tool-types` | `TOOLING_WRITE` | create Tool Type |
| `POST /api/tooling/tools` | `TOOLING_WRITE` | create physical Tool |
| `GET /api/tooling/tools` | `TOOLING_READ` | bounded list/search |
| `GET/PATCH /api/tooling/tools/:id` | `TOOLING_READ` / `TOOLING_WRITE` | detail/update |
| `POST /api/tooling/tools/:id/regrinds` | `TOOLING_WRITE` | atomic verified regrind |
| `POST /api/tooling/tools/:id/conditions` | `TOOLING_WRITE` | condition transition |
| `GET /api/tooling/tools/:id/history` | `TOOLING_READ` | bounded unified history |
| `POST /api/tooling/identifiers` | `TOOLING_WRITE` | issue opaque locator |
| `POST /api/tooling/tools/:id/identifiers/replace` | `TOOLING_WRITE` | rotate locator |
| `POST /api/tooling/identifiers/:id/revoke` | `TOOLING_WRITE` | revoke locator |
| `GET /api/tooling/locators/resolve` | `TOOLING_READ` | authorized locator resolution |
| tool attachment routes | `ATTACHMENT_READ/WRITE` | bounded list/upload/update/archive |
| tooling AI job/review routes | `AI_PROCESS`, `AI_PROCESS_READ`, and canonical `TOOLING_WRITE` on commit | request, inspect, retry, review, commit |

Binary attachment upload is bounded at 50 MiB and avoids a base64 JSON bootstrap. Lists and history retain the service maximum of 100 and deterministic repository ordering.

## Migration and Runtime Order

Migration `0015_authenticated_tenant_runtime` extends, rather than rewrites, the accepted chain through `0014_operational_tooling_closure`. It adds only the durable OIDC transaction table and bounded expiry index. The safe order is:

1. confirm a tenant-owned PostgreSQL 17 backup and D-A readiness;
2. stop or drain the tenant runtime;
3. apply migrations through `0015` with the migration role;
4. re-run checksum/schema/readiness validation;
5. configure tenant-owned OIDC, object storage, AI provider, secrets, origin, and entitlement cache;
6. start the runtime and require `/ready` to return `READY`;
7. activate tooling for the single approved tenant and run the operator acceptance workflow;
8. monitor safe auth failures, dependency failures, conflicts, and operation latency.

Readiness is diagnostic only. Runtime startup does not silently migrate, provision a database, activate a tenant, or switch authority to Sheets.

## Activation and Rollback

Activation must be an installation-local, tenant-bounded configuration/release action. It must not be a browser flag or global capability grant. If migration succeeds but activation fails, keep the additive schema, leave tenant routing inactive, and correct runtime configuration; do not reverse or edit applied migration history. If runtime activates and a dependency fails, `/ready` becomes unavailable and requests return deterministic safe unavailable/reauth/conflict states; there is no Sheets fallback.

Rollback disables the tenant-local runtime route, drains requests, revokes activation-test sessions, and restores the immediately preceding runtime artifact while retaining the forward-only compatible database schema. Before any future rollback is approved, the preceding artifact must be proven compatible with schema level `0015`. Operator writes must not be routed simultaneously through Apps Script and PostgreSQL.

## Acceptance Evidence

Deterministic preproduction tests prove OIDC callback → PostgreSQL auth-attempt/session state → PostgreSQL identity/membership/capabilities → protected tooling API → canonical PostgreSQL tooling services. The exercised flow creates a Tool Type and physical Tool, uploads evidence, records a verified regrind atomically, preserves NOMINAL `0.5000` separately from ACTUAL `0.4875`, rejects a stale mutation without a partial write, reads unified history, replaces a locator, rejects the old token, and resolves the replacement. Forged tenant/user/`PLATFORM_*` headers and bodies do not become authority.

The complete runtime suite passed with eight real-PostgreSQL suites accurately skipped. Those eight suites did **not** execute against PostgreSQL 17 in this run. Docker CLI was present, but the engine did not become responsive through safe ordinary startup; no system installation or cloud resource was attempted.

Production-representative performance, real query plans, authenticated operator UI acceptance, the three rendered tenant-runtime viewports, and physical screen-reader validation are **NOT PERFORMED**. Local in-memory PostgreSQL emulation timings are test-harness timings and are not release evidence.

## Exact Unblock Gate

Provide an approved disposable PostgreSQL 17 environment (or the established protected MOS-133H test database and role secrets), an approved safe Vitality-equivalent tenant installation, tenant-owned OIDC test credentials/callback origin, and configured non-test object storage/AI adapters. Then:

- apply and verify migrations through `0015` and run all eight opt-in PostgreSQL suites;
- exercise the bound runtime with an authorized operator and the tenant-hosted UI;
- perform the full regrind/evidence/history/locator workflow plus negative tenant/capability cases;
- capture bounded dataset performance and material `EXPLAIN` plans;
- repeat rendered QA at 1440×900, 1024×768, and 390×844;
- perform physical screen-reader validation if available;
- approve tenant-bounded activation only after all mandatory gates pass.

Until that evidence exists, a Vitality operator cannot be told that the complete authenticated physical-tool workflow is live.
