# MOS-125 — Authentication and application sessions

**Release:** MAIN. **Activation state:** code/configuration foundation only; no provider is enabled and no production resource is changed.

## Security boundary

Atlas preserves `verified OIDC principal -> ExternalIdentityReference(provider + issuer + subject) -> active AtlasUser -> active TenantMembership -> commercial entitlement -> capability -> immutable AuditContext`. Email and display name are attributes only. Matching email never creates or links an account. One Atlas user may own multiple explicit identity references. Calendar connections, QR tokens, `Session.getEffectiveUser()`, provider account claims, browser TenantID, roles and capabilities never authenticate or authorize an operator.

Microsoft and Google share `AtlasOidcAdapter_`. Authorization requests use one-time state, nonce and PKCE S256. Completion requires an external verification gateway to perform authorization-code exchange and cryptographic token verification, then Atlas independently checks signature-verification evidence, issuer, audience, subject, nonce, expiry and Microsoft account-mode policy. State is high entropy, single-use, and expires according to the bounded `transactionTimeoutSeconds` policy (default 300 seconds; allowed 60–600 seconds). Return navigation is an allowlist of route identifiers, not a URL.

`AtlasAuthSessions` stores only a SHA-256 hash of the opaque 384-bit application token, stable principal linkage, selected/permitted tenant context, issued/authenticated/expiry/revocation timestamps and status. The raw token is returned once. Resolution rejects missing, expired or revoked sessions. Tenant selection accepts only a live active membership from the session's server-derived permitted set. Authorization continues to read current user, membership, entitlement and capabilities; session creation does not freeze or grant them. Recent-authentication age is independently available for high-risk policy. Atlas logout revokes only Atlas's application session and does not claim Microsoft/Google global logout.

Request-local authorization still performs one principal/session resolution followed by one identity, user, membership, entitlement and capability decision; it is not repeated per service call. The current Sheets repositories implement identity/session lookup by scanning their backing sheet, so real Apps Script measurement and a bounded adapter index are activation performance work. Authorization is intentionally not cached across requests because membership, entitlement, capability and revocation changes must take effect under the established MOS-121 policy.

Account linking requires an already-authoritative Atlas context, a separately verified new provider principal, recent authentication, explicit invocation, and globally unique provider/issuer/subject. It never merges on email and does not confer a new tenant membership.

## UX and failure states

`SignIn.html` uses neutral Atlas design tokens, configured-provider buttons, keyboard focus, live announcements and at least 44px controls. `AuthCallback.html` handles provider failure, identity-not-provisioned, inactive/unavailable membership, tenant selection and successful return without exposing OAuth details. Additional operator states map to safe messages: signed out, signing in, provider unavailable, session expired, reauthentication required, tenant unavailable and commercial restriction. Responses never disclose whether a guessed tenant or unrelated account exists.

Every unsuccessful attempt terminates in a clean signed-out or safe denied state. A server-side browser-flow correlation owns exactly one state/nonce/PKCE record; beginning a replacement invalidates its predecessor, and callback consumption or explicit abort removes both records. Provider cancellation/error, validation failure, timeout, reload, back navigation, and interrupted callback clear browser transaction metadata and restore enabled provider controls without requiring refresh. A callback is terminal: it either establishes an active Atlas session or returns to Sign In. A stale callback cannot consume or authenticate a newer flow. No failed assertion or provider token is persisted.

The browser watchdog uses the same configured transaction timeout returned by the server. It aborts the transaction and requires fresh state/nonce/PKCE material. Double-clicks are suppressed while an attempt is active. A failed reauthentication does not modify an unrelated active Atlas session. Multi-tenant authentication creates only a `PENDING_TENANT` session, which the principal resolver rejects until a permitted active membership is selected; callback interruption revokes that pending session.

## Apps Script hosting assessment

**NOT RECOMMENDED FOR LONG-TERM SAAS authentication.** The current manifest is `USER_DEPLOYING + ANYONE`. Apps Script HtmlService cannot set a normal application-owned HttpOnly/Secure/SameSite cookie, and `google.script.run` does not provide an application session header/cookie to the server boundary. Browser `sessionStorage` supports callback UX but is **not** accepted as production authorization by itself. Script/User Cache is not a durable per-browser security session under deployer execution. Implementing Microsoft sign-in by trusting browser claims or global cache state would be insecure.

The approved production composition is an external HTTPS authentication/session edge (or future host) that owns OIDC code exchange, JWKS/signature validation, secure cookies, CSRF and session presentation. It returns only verified claims to the Atlas adapter and supplies the opaque Atlas session to every protected request. Apps Script business services remain compatible because `AtlasApplicationSessionPrincipalResolver_` produces the same provider-neutral principal consumed by MOS-121. Until that edge is deployed and integrated with every callable, ENFORCED writable production must remain blocked; native restricted Google `getActiveUser()` validation remains a separate deployment profile, not Microsoft support.

## Configuration and additive persistence

`ATLAS_AUTH_CONFIG` contains public/policy configuration: enabled providers, public client IDs, authorization endpoints, exact allowed issuers, account mode, scopes, verification gateway URL, exact redirect URI, allowed return routes, and bounded session/recent-auth lifetimes. Provider secrets, private keys, access/refresh/ID tokens and credentials are prohibited. The external gateway retrieves credentials from its approved secret store.

Add headers only through controlled activation:

- `ExternalIdentityReferences`: add `Issuer`.
- `AtlasAuthSessions`: `SessionID`, `Token Hash`, `UserID`, `Provider`, `Issuer`, `Subject`, `TenantID`, `Permitted Tenants JSON`, `Issued At`, `Expires At`, `Authenticated At`, `Revoked At`, `Status`, `Created At`, `Updated At`.

No automatic initializer or historical rewrite exists. Rollback disables providers, revokes active Atlas sessions through the approved administration process, retains identity/audit history, and restores the last approved principal resolver. It never deletes provider accounts or globally logs users out.

## Production activation gate

1. Deploy the verified external session edge and secret storage; configure provider applications from the runbooks.
2. Add/validate additive headers in a non-production workbook.
3. Integrate session presentation into every protected Apps Script callable; prove no browser identity fallback.
4. Validate active/inactive user, membership removal, entitlement denial, zero capability, multi-tenant selection, recent auth, revocation, logout and provider outage live.
5. Run cross-browser/device, keyboard/screen-reader and real latency sessions before changing deployment access or enabling providers.

Live Microsoft/Google credential exchange, secure cookie behavior, consent, provider logout, production session revocation and Apps Script timing remain unvalidated.
