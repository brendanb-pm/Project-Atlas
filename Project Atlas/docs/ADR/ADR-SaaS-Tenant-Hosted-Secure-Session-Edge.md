# ADR — SaaS Tenant-Hosted Secure-Session Edge

Status: Accepted for implementation planning
Date: 2026-08-23
Decision owners: Atlas/MOS product and architecture
Source baseline: `37a1774eea7ee0d3905dc33337155468753887f4`
Standards baseline: `Codex-Standards.md` at `72e016ea42af375b9f2dbe10186cdc2c5fd74fca`

## Context

MOS-125 established a provider-neutral Atlas identity model, but its Apps Script
hosting assessment found that HtmlService and `google.script.run` cannot securely
present an Atlas application session at every protected request. Google Workspace
validation remains a legacy deployment profile, not a SaaS session edge. It must
not become an authorization bypass for Google, Microsoft, or future tenant-hosted
runtime use.

MOS-133A selects tenant-owned PostgreSQL and a tenant-hosted API/runtime for new
installations. This ADR defines the companion secure-session edge. It is
architecture and contract only: it neither enables providers nor changes current
Apps Script authentication.

## Decision

Each tenant installation runs a **tenant-hosted secure-session edge colocated
with the tenant-hosted Atlas API/runtime**. The normal request path is:

```text
Browser -- HTTPS --> tenant session edge/API --> Atlas service layer --> tenant PostgreSQL
                              |
                              +--> Google or Microsoft OIDC provider

Vendor control plane -- signed entitlement bundle --> tenant-local entitlement cache
```

For V1, the edge and API are one deployable application/process behind one
tenant-hosted HTTPS origin. This avoids a spoofable edge-to-API header boundary
and distributed session coordination. A future split requires a private network
and workload identity or mTLS, with the API rejecting direct public traffic and
untrusted forwarding headers.

The edge authenticates and establishes session context. The Atlas API still
reauthorizes every protected operation against authoritative user, membership,
active tenant, capability, and entitlement state. Successful provider login is
not blanket Atlas authorization.

## Implementation Status — SAAS-SESSION-EDGE-1B

The repository contains an isolated Node 24 preproduction runtime at
`runtime/secure-session-edge`. It deliberately runs the edge and API middleware
in one process, uses maintained `jose` JWT/JWKS validation for live-provider
adapters, and supplies deterministic Google/Microsoft test adapters only for
automated preproduction evidence. It implements the opaque-session, CSRF,
rotation, trusted-context, audit, rate-limit, and fail-closed store contracts in
this ADR. The in-memory store and protected context route are preproduction-only.

It is **not** a live OIDC deployment, PostgreSQL session store, Apps Script bridge,
or Vitality cutover. MOS-133C replaces its memory store through the published
session-store contract; a separately authorized activation validates tenant
infrastructure, real provider configuration, and browser evidence.

## Hosting, Domain, and Tenant Discovery

### Hosting model

Tenant-hosted per-tenant edge/API is selected over a vendor-hosted shared edge or
a hybrid session service. It matches tenant data/infrastructure ownership, limits
blast radius, preserves tenant portability, and avoids making vendor uptime a
normal production dependency. The vendor supplies versioned software, reference
deployment guidance, entitlement verification keys, and compatibility rules; it
does not operate the tenant's session store or provider credentials.

### V1 URL model

Each installation has one canonical HTTPS origin, initially a tenant-managed
subdomain or customer-owned domain, for example
`https://atlas.example-tenant.com`. A vendor-managed tenant subdomain may be an
optional onboarding convenience only if its certificate, DNS, support, and
offboarding ownership are explicitly agreed. Custom domains are a later option,
not a second simultaneous cookie authority.

The canonical origin is registered exactly in OIDC redirect configuration. Cookies
are host-only; no parent-domain cookie is used. A user who has memberships in
multiple installations changes installation/origin intentionally rather than
carrying one cross-domain cookie. Tenant switching within one installation is
allowed only among that installation's server-resolved memberships.

The installation learns its single tenant from local protected configuration and
a vendor-issued, signed installation registration bound to the runtime origin.
Host/domain mapping is validated at startup. A query parameter, browser storage,
or client request header never establishes tenant identity. PostgreSQL retains an
installation metadata constraint and explicit `TenantID` on tenant-owned records
as the independent data-plane check defined by MOS-133A.

## OIDC and Identity

Google and Microsoft are the only planned providers. Each uses a provider-neutral
Authorization Code + PKCE flow:

1. The public sign-in surface offers only enabled providers and creates a
   one-time, expiring server-side transaction with state, nonce, PKCE verifier,
   safe allow-listed route intent, and correlation ID.
2. The edge redirects to the provider with S256 PKCE, state, nonce, exact redirect
   URI, and the minimum OIDC scopes.
3. The callback validates transaction ownership and single use before code
   exchange; validates issuer, audience, signature/JWKS evidence, expiry, nonce,
   and provider policy; then deletes the transaction and any failed assertion.
4. The verified `(provider, issuer, subject)` resolves an explicit
   `ExternalIdentityReference`, then an active Atlas user and active memberships.
   Email/display name are attributes only; no email auto-link or auto-provisioning
   exists.
5. The edge creates an Atlas session, chooses an active tenant only from the
   server-resolved permitted set, and restores only a safe allow-listed route
   after API authorization.

For Microsoft, issuer/audience and Entra account-mode policy are installation
configuration. For Google, issuer/audience and Workspace/eligible-account policy
are installation configuration. Provider applications are not activated by this
ADR.

### Provider ownership

V1 recommends a vendor-operated, multi-tenant Google and Microsoft application
as the documented default, with tenant-specific provider registrations available
for enterprises that require their own consent, issuer/account policy, or client
ownership. The tenant runtime owns the callback origin and stores client secrets
in its secret manager; the vendor does not retain tenant secrets. The vendor
default reduces initial installation effort but requires documented portability,
consent, outage, and support terms. Exact default-versus-enterprise eligibility is
an open product/security decision.

ID tokens are used only to establish identity and are discarded after validation.
Provider access tokens are not Atlas session credentials and are not retained
unless a separately approved provider integration requires them. Refresh tokens
are avoided for V1 authentication; if later required, they are purpose-limited,
encrypted at rest in tenant infrastructure, never browser-accessible, revocable,
and auditable.

## Application Session and Cookies

Atlas selects an **opaque, high-entropy random session identifier** in a host-only
cookie, backed by a tenant PostgreSQL server-side session record. This supports
immediate revocation, membership/tenant reauthorization, session rotation, and
tenant-local ownership more reliably than a self-contained signed token.

The browser receives only the opaque identifier in a `HttpOnly`, `Secure`,
host-only cookie with `Path=/` and `SameSite=Lax` by default. `SameSite=None;
Secure` is permitted only for an approved cross-site embedding/callback design
with compensating CSRF controls. The cookie carries no user ID, TenantID, role,
capability, entitlement, OIDC token, or trusted authorization claim. Cookie
lifetimes are bounded by the server record and are cleared on logout/revocation.

The server record contains: random session ID (stored hashed where practical),
authenticated user, provider/issuer/subject reference, permitted tenant IDs,
active tenant, issued/authenticated/last-activity timestamps, idle and absolute
expiry, status, revoked-at/reason, rotation/version, authentication strength and
correlation metadata. It does not make provider identity an Atlas permission.

Exact idle, absolute, recent-authentication, rotation, control-plane refresh, and
grace durations are **OPEN PRODUCT DECISIONS**. The implementation must make
them policy-configurable, bounded, and observable rather than embedding hidden
timeouts.

Tenant PostgreSQL is the V1 session store. A tenant-local cache may accelerate
reads or distribute revocations, but it is not authoritative and must fail closed
on uncertainty. A vendor control plane is never a session store and is not needed
for ordinary session validation.

### Multi-tenant selection and switching

One permitted tenant may be selected according to explicit installation policy;
otherwise the edge renders a server-populated tenant picker. A pending
tenant-selection session cannot access protected APIs. Switching is:

```text
request target -> verify live membership in permitted set -> clear request context
-> re-resolve membership/capabilities/entitlement -> update active tenant
-> rotate session -> authorize safe destination
```

The rotation invalidates the prior session version, drops stale CSRF material, and
causes responses carrying the old request/session generation to be discarded.
Failure leaves the existing tenant session intact unless it was already invalid;
the user receives generic access-unavailable guidance, not a foreign tenant hint.

## CSRF, API Authorization, Logout, and Revocation

For cookie-authenticated mutations, logout, tenant switch, and account/security
actions, V1 uses defense in depth: SameSite policy, a per-session synchronizer
CSRF token delivered only to same-origin rendered markup/API bootstrap, and
Origin/Referer validation for browser requests. The API rejects missing, stale,
or mismatched tokens before the mutation and rotates CSRF material with the
session. Read endpoints remain subject to session/authentication validation.

The edge/session middleware derives only server-side context for the API:
session reference/version, user reference, active tenant, authenticated-at and
authentication context, plus correlation/request ID. It does not accept client
user, tenant, role, capability, entitlement, or forwarded identity headers. The
API resolves current membership, capability, and entitlement per its request-local
authorization policy, then creates `AuditContext`; it remains the operation-level
authorization authority.

Atlas logout revokes the server session, invalidates its CSRF/session version,
clears the cookie, records an audit event, and returns a public sign-in state.
Back/reload and stale pre-logout requests fail closed. Provider/global Google or
Microsoft logout is separate and optional; Atlas does not claim it happened.

Revocation triggers include Atlas logout, administrator/session revocation, user
or membership disablement, tenant suspension, identity unlink, security incident,
and material credential/security changes. Membership and user state are checked
on every protected request or against a short, revocation-aware tenant-local cache.
Concurrent sessions across browsers/devices are allowed in V1; administrators may
revoke one or all sessions. No device fingerprinting is required.

## Entitlement and Control Plane

Session validity and licensing are separate. The tenant API enforces a signed,
tenant-bound local entitlement bundle containing seat/module/release state. It
refreshes on a policy cadence, remains usable until expiry plus approved grace,
and records refresh/revocation evidence locally. The vendor control plane is not
on ordinary request paths. An unavailable control plane with a valid in-grace
bundle allows normal work; an expired bundle beyond grace applies the separately
defined continuity-restricted policy and never authenticates or authorizes by
itself. Membership disablement and tenant suspension fail closed regardless of a
valid session cookie.

## Key Management, Abuse Controls, and Observability

Tenant cloud administrators own tenant secret storage: AWS Secrets Manager or
Azure Key Vault as selected by installation. OIDC client secrets (when used),
CSRF/session encryption keys, and installation private material stay there.
The vendor publishes entitlement-verification public keys and may rotate them by
key ID with overlapping valid windows. Tenant runtime keys have key IDs, staged
overlap, tested rotation, least privilege, and redacted diagnostics. Migration
credentials remain separate from application/session credentials.

Rate limits are tenant-edge/API policy, not inherited Apps Script behavior:
stricter limits for sign-in initiation, callbacks, failed logins, session
rotation, and tenant switching; bounded per-session/user/IP controls for reads;
idempotency-aware limits for writes and expensive reads. Limits never silently
grant access and return a retryable, generic R6-compatible state.

The edge and API emit tenant-local, redacted metrics/logs for authentication and
callback latency/failure, session creation/rotation/revocation, CSRF and API
authorization rejection, tenant-switch failure, session-store latency, entitlement
cache state, and dependency availability. A correlation ID flows browser request
to edge, API, audit event, and safe diagnostic record. Logs exclude cookies,
tokens, secrets, raw claims, protected payloads, and unnecessary PII.

Tenant-local security audit records cover login success/failure, callback/state/
nonce/PKCE validation failure, suspicious replay, session creation/rotation,
tenant switch, logout, revocation, expired-session use, CSRF rejection, and
forbidden switch. Vendor control-plane audit records only licensing/install events
and redacted aggregate support telemetry where agreed; no tenant operational data
is exported.

## Failure and Availability Model

Every failure follows the R6 visible-state contract: loading, public sign-in or
reauthentication, access unavailable, partial/source unavailable, or actionable
error/retry—never a blank page.

| Condition | Security decision / retry | User-visible state | Audit |
|---|---|---|---|
| Provider unavailable | No session; retry later/other enabled provider | Sign in: provider temporarily unavailable | failure category |
| Invalid/replayed/expired callback, state, nonce, or PKCE | Fail closed; consume/invalidate transaction; fresh sign-in | Authentication failed, retry | required |
| Session store or PostgreSQL unavailable | No protected authorization; bounded retry after recovery | Source unavailable/actionable retry | required |
| Tenant API unavailable | No protected content; retry after recovery | Service unavailable | operational |
| Entitlement plane unavailable, valid cache in grace | Continue local authorization | Normal use; admin health warning as policy permits | refresh failure |
| Entitlement expired beyond grace | Apply policy; never use as identity | Clear access/continuity state | required |
| User/membership disabled, tenant suspended, session revoked | Invalidate/reject session; reauth cannot restore disabled access | Generic access unavailable/sign in | required |
| CSRF failure or bad tenant switch | Fail closed; no mutation/switch; fresh token or retry | Action could not be completed | required |
| Stale browser response | Discard by session/request generation | Current state remains intact | optional diagnostic |
| Edge/API version mismatch | Block incompatible protected operation | Upgrade/service unavailable | required |

Login requires the edge, API identity/membership store, and OIDC provider. Normal
authorized use requires edge/API plus session/identity storage and valid local
entitlement state; it does not require the vendor control plane or provider.
Tenant switching requires current membership/entitlement resolution. License
refresh requires the control plane only on cadence. Administrator revocation
requires tenant-local API/session storage. Software upgrade requires version and
schema compatibility plus normal tenant backup/change controls.

## Threat Review

| Threat | Required mitigation | Residual risk / evidence needed |
|---|---|---|
| Session fixation/theft/XSS | new opaque ID on login/switch/reauth, HttpOnly/Secure host-only cookie, CSP/XSS hardening, revocation | endpoint/XSS and browser testing in 1B |
| CSRF/login or logout CSRF | synchronizer token plus Origin/Referer and SameSite | cross-browser callback and logout testing |
| Code interception/PKCE downgrade | authorization code + mandatory S256 PKCE; exact callback URI | provider integration tests |
| State/nonce replay/callback confusion | single-use bound transactions, issuer/audience/nonce validation, correlation audit | live provider evidence |
| Open redirect | route allow-list; no arbitrary URL or record context retention | adversarial routing tests |
| Tenant confusion/cross-tenant switch | installation binding, server membership set, active-context rotation, API tenant checks | concurrent-switch tests |
| Forged internal headers | one process in V1; future private network/workload identity or mTLS; ignore public forwarded identity | deployment review before split |
| Stale authorization/entitlement confusion | request-local membership/capability checks; local signed entitlement cache is separate | cache/revocation timing policy |
| Cookie-domain mistakes | canonical host-only origin, no parent-domain cookie | custom-domain/onboarding review |
| Token/secret/audit leakage | minimum retention, tenant secret manager, redaction, append-only audits | operational log review |

## Apps Script Transition

1. **Legacy:** Apps Script remains the Vitality runtime using its strict mapped
   Google Workspace validation path. It does not claim OIDC session authority.
2. **Coexistence:** selected flows use the tenant API only after the secure edge
   is deployed; no double session authority, browser token bridge, or direct
   Apps Script-to-PostgreSQL access is introduced.
3. **Primary runtime:** the tenant-hosted UI is served from the canonical session
   origin and every protected request carries the edge-owned cookie.
4. **Integration/retirement:** Apps Script is limited to explicit Google
   automation/integrations or removed. Rollback preserves one authoritative
   routing/authentication surface; it never toggles two write/session authorities.

## MOS-133C Contract

MOS-133C may assume: a tenant-local API owns the persistence provider boundary;
one installation has one tenant database and trusted installation identity;
all protected API requests receive edge-derived context; tenant PostgreSQL stores
sessions; credentials remain inside tenant secret management; and the API retains
operation-specific authorization, transaction, idempotency, AuditContext, and
bounded read responsibilities.

MOS-133C may not assume provider credentials, callback registrations, exact
timeouts/grace periods, a chosen API framework, a split edge/API topology, or a
production deployment exists. It must not invent an Apps Script session bridge.

## Follow-on: SAAS-SESSION-EDGE-1B

**Objective:** implement and independently validate the tenant-hosted Google/
Microsoft OIDC edge, opaque session/CSRF middleware, tenant switching, logout,
revocation, audits, and the trusted API context contract.

**Prerequisites:** this ADR; MOS-133B; approved runtime/deployment choice;
tenant-owned secret-store and domain/certificate readiness; explicit provider
ownership and timeout/grace policy decisions.

**Scope:** edge/API middleware, session schema/store, provider adapters, callback
routes, public auth UX, abuse controls, observability, adversarial tests,
preproduction deployment and rollback runbook.

**Non-scope:** PostgreSQL domain migration, Google/Microsoft production credential
activation, Apps Script bridge, vendor billing implementation, or data migration.

**Acceptance:** no browser-controlled authority; code+PKCE/state/nonce/replay
defenses; host-only secure cookie; CSRF enforcement; reauth/revocation/logout;
tenant isolation/switch rotation; redacted failures; provider/session/tenant
adversarial and deployment acceptance; rollback proves no session resurrection.

**Production classification:** preproduction infrastructure and credentials only
until a separately authorized tenant activation. Provider enablement, DNS, and
production session cutover require their own change authorization.

**Sequence decision:** **B — implement the minimum complete edge before MOS-133C
production-boundary finalization, and complete its production-grade acceptance
before any PostgreSQL domain migration or cutover.** MOS-133C may begin only
against disposable/preproduction infrastructure after the 1B trusted-context
contract is implemented and tested; it cannot make a production cutover on an
unproven session boundary.

## Consequences and Open Decisions

This design removes SaaS session authority from Apps Script, preserves tenant
ownership and vendor-control-plane independence, and creates a clear API trust
boundary. It also requires tenant HTTPS origins, secret management, provider
registration decisions, and preproduction deployment/security evidence.

Open product decisions: exact session/reauth/rotation durations; entitlement
grace and continuity policy; vendor-default versus tenant-owned provider
registration eligibility; custom-domain support; supported concurrent-session
administration UX; and post-termination/provider portability terms.

Open security decisions: precise CSP/security-header baseline; reverse-proxy or
cloud workload-identity implementation if edge/API split; token encryption design
if an approved integration needs refresh tokens; callback/domain verification
automation; and control-plane signing/rotation ceremony. These do not change the
selected tenant-hosted edge topology.

## Alternatives Rejected

- **Apps Script as primary session authority:** cannot securely present the same
  application session to `doGet` and every `google.script.run` request.
- **Vendor-hosted shared session edge:** conflicts with tenant ownership and adds
  vendor uptime/blast-radius responsibility to normal tenant production use.
- **Signed self-contained browser session token:** weakens immediate revocation,
  tenant-switch rotation, and server-side session control relative to an opaque
  server record.
- **Browser-selected tenant/role/session headers:** violates Atlas trusted-context
  and MOS-121 authorization requirements.

## References

- `docs/Architecture/MOS-125-Authentication-and-Session-Architecture.md`
- `docs/ADR/ADR-MOS-133-Tenant-Hosted-PostgreSQL.md`
- `docs/Architecture/MOS-133A-PostgreSQL-Transition-Plan.md`
- `docs/Architecture/MOS-133B-Persistence-Provider-Contract.md`
- `docs/Architecture/ACTIVATION-V1-R6-Route-Recovery-and-MOS-133-Handoff.md`
