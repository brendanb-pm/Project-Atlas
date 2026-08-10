# MOS-121C Deployment Security Profiles and Identity Enforcement Plan

## Boundary and adopted decisions

Release channel: **MAIN**. Baseline:
`0e51f520ed9c375dd6119ded7f6c68d5de2a9a7f`.

The repository was verified as `brendanb-pm/Project-Atlas` on `main`. This
policy adopts Google identity as an allowed initial VMOS authentication adapter
while keeping Atlas identity provider-neutral; requires active tenant
membership; defines capability-based roles; requires financial separation,
named shop operators, QR-as-navigation only, step-up support for high-risk
actions, and atomic audit or durable reconciliation. It does not change the
manifest, OAuth, sharing, credentials, schema, audit history or production.

Current `USER_DEPLOYING + ANYONE` remains an observed implementation state, not
an approved production security profile for protected reads or mutations.

## Deployment security profiles

| Profile | Authentication and access | Identity/membership | Credentials/providers | Mutation policy |
| --- | --- | --- | --- | --- |
| **LOCAL / DEVELOPMENT** | No public endpoint. Local tests use explicit fake principals; anonymous fixtures may test denial only. | Deterministic fake Atlas users, tenant and memberships. No production identity assertion is accepted. | Fake gateways and dummy credential references only; local secret files ignored. | Synthetic/in-memory or isolated disposable data only. Production mutation forbidden. |
| **NON-PRODUCTION VALIDATION** | Isolated deployment restricted to named test users. Real authentication adapter may be exercised; every protected request passes the application identity gate. No unguarded `ANYONE` mutation endpoint. | Verified principal must map to an active test-tenant membership and capabilities. Identity-resolution evidence is retained without production data. | Approved test accounts/calendars and secure non-production credentials; provider validation isolated per MOS-118. | Explicit test records only. Destructive/provider actions limited to the isolated target with rollback. |
| **INTERNAL VMOS PRODUCTION** | Named-user authentication required. Either restricted Google deployment access with proven caller identity, or a verified Google-to-Atlas session gate in front of execute-as-deployer. Anonymous/public entry never grants protected data or mutation. | Verified Google principal maps to Atlas User and active VMOS membership. Capabilities, resource tenant and recent-auth policy are enforced server-side. | Production credentials remain in approved secure configuration; calendar/provider grants remain separate per user. | Only authorized capabilities may mutate. Audit context required. Current raw `ANYONE` deployment is **not approved** for production mutation until implementation and validation pass. |
| **FUTURE MULTI-TENANT ATLAS** | Provider-neutral authentication gateway supports approved issuers. Tenant is resolved from trusted host/deployment routing before membership evaluation. | Stable Atlas User, ExternalIdentity and active tenant-specific Membership; cross-tenant denial occurs before repository access. | Encrypted, access-controlled tenant/user credential service; providers remain optional adapters. | Tenant-scoped authorization/audit on every operation; isolation, concurrency and SaaS operations independently validated. Apps Script may remain an adapter, not the universal trust boundary. |

An environment cannot self-declare a stronger profile. It must present the
profile's evidence: configuration, identity resolution, membership/RBAC tests,
audit behavior, provider separation, rollback and access review.

## Initial VMOS authentication composition

### Recommended composition

```text
Google authentication assertion
  -> GoogleIdentityAdapter verifies issuer/audience/signature/expiry/nonce
  -> provider-neutral AuthenticatedPrincipal(issuer, subject, auth time)
  -> ExternalIdentity lookup
  -> Atlas User + active VMOS TenantMembership
  -> Atlas session/request context
  -> capability gate
```

For the first controlled implementation, use Google as the VMOS adapter and a
server-verified Atlas session/request context. Atlas Core receives only the
provider-neutral principal. Email is a display/discovery claim; the stable key
is verified issuer + subject. Authentication never auto-creates an active
membership or grants a default production role.

Two Apps Script compositions may be validated:

1. **Restricted access + execute as accessing user:** the adapter uses a proven,
   non-empty `Session.getActiveUser()` identity in the approved Workspace/account
   context. Users may require Apps Script scopes and underlying resource access.
2. **Execute as deployer + verified application session:** a Google assertion is
   cryptographically verified server-side and exchanged for a protected Atlas
   session. Every server entry point validates it; deployer/effective-user
   identity is recorded only as system execution identity. CSRF, replay, nonce,
   audience, expiration and revocation controls are mandatory.

The second composition better preserves centralized resource access and future
identity-provider portability, but it is approved only if Apps Script can store
keys/session state securely and enforce the guard on every callable endpoint.
The first is operationally simpler if non-production proves identity availability
and resource-sharing burden acceptable. `execute as accessing user` alone still
does not supply Atlas membership or authorization. If neither composition can
meet the gate/session/audit contract, stop and introduce an external identity
gateway rather than weakening the boundary.

## Trusted request context

Client code may carry an opaque assertion/session token and business inputs; it
cannot construct or override the trusted context.

```text
TrustedRequestContext {
  principal: { issuer, subject, method, authenticatedAt, sessionId, assurance },
  user: { userId, status },
  tenant: { tenantId, deploymentKey },
  membership: { membershipId, status, roleKeys },
  permissions: string[],
  request: { correlationId, requestedAt, endpoint },
  audit: immutable AuditContext,
  recentAuthenticationAt
}
```

The server derives TenantID from trusted deployment/host configuration, resolves
ExternalIdentity and User, loads the membership for that tenant, expands roles
to capabilities and creates immutable AuditContext. Client `tenant`, `role`,
`permission`, `actor`, `approvedBy`, `createdBy` or `updatedBy` values are ignored
for trust decisions. Legitimate owner/requester/operator inputs remain business
assignments and are separately validated.

AuditContext contains TenantID, ActorUserID, MembershipID, principal
issuer/subject, authentication method/time, session and correlation IDs,
timestamp, and optional trusted system/delegation data. Services receive the
context by reference/value that application code does not mutate.

## Capability model

Keep the vocabulary coherent and resource-oriented. Roles are tenant-configured
bundles; services never compare role names.

| Capability group | Stable capabilities | Current use |
| --- | --- | --- |
| Core records | `records:read`, `records:create`, `records:update`, `records:cancel` | Customer/RFQ/Quote/Job/Invoice CRUD and lifecycle. Resource policy can narrow entity/scope without multiplying role names. |
| Sales | `sales:read`, `sales:activity_write`, `sales:manage` | Account timelines, SalesActivity creation, ownership/next actions and manager reassignment. |
| FollowUps | `followups:read`, `followups:write`, `followups:reassign`, `followups:close` | Due/schedule, assignment, completion/cancellation. |
| Operations | `operations:read`, `operations:transition`, `operations:configure` | Shop floor, JobEvents, ProcessTrials, QR/workflow administration. |
| Commercial | `commercial:edit`, `commercial:review`, `commercial:approve`, `commercial:issue` | RFQ review and quote preparation/approval/issuance. |
| Purchasing | `purchasing:submit`, `purchasing:approve`, `purchasing:receipt` | Purchase requests, separation-controlled approval and receipt evidence. |
| Finance | `finance:read`, `finance:receipt_record`, `finance:deposit` | Cash receipt/deposit and sensitive financial views/mutations. |
| Calendar | `calendar:self_manage`, `calendar:reconcile`, `calendar:manage_all` | Own connection, ordinary review, and manager-wide reconciliation. |
| Administration | `admin:configuration`, `admin:users_roles`, `admin:audit` | Deployment settings, membership/role administration and audit review. |

Initial conceptual role templates:

- **SHOP_OPERATOR:** operations read/transition and necessary Job read; no
  configuration, finance, approval or identity administration.
- **SALES:** core/customer/RFQ reads, appropriate record creation/update, sales
  and own FollowUp/calendar capabilities; no financial approval.
- **MANAGER:** broader operational/sales/follow-up management and reconciliation;
  commercial approval only if explicitly included by tenant policy.
- **FINANCE:** finance and purchasing receipt capabilities; purchase approval
  only when assigned and never self-approval above threshold.
- **ADMIN:** configuration, users/roles and audit plus separately granted
  operational capabilities. ADMIN does not silently bypass separation of duties.

## Mutation gate placement

Create one server-side `AuthorizedExecution`/endpoint-dispatch boundary around
all Apps Script-callable operations:

```text
executeAuthorized(requestToken, policy, businessInput, handler)
  1 authenticate and validate session/recent-auth requirement
  2 resolve trusted tenant, user and active membership
  3 evaluate capability + resource tenant + assignment/lifecycle constraints
  4 construct immutable AuditContext/correlation
  5 invoke service(command, context)
  6 persist mutation and required audit atomically, or durable reconciliation
  7 return an operator-safe result
```

Endpoint policy declares read/mutation, capability, resource resolver and
step-up requirement. Business services enforce domain invariants and accept
AuditContext; repositories enforce tenant scoping and persistence integrity but
do not reimplement user authorization. High-risk services may assert that an
approved context/capability decision is present as defense in depth.

Direct calls that bypass the endpoint dispatcher are not production entry
points. Triggers/webhooks use narrowly scoped trusted system principals and
their own policies.

## Critical-path migration order

Partial migration must not be advertised as secure. Maintain an endpoint
inventory and a single `IDENTITY_ENFORCEMENT_COMPLETE` activation gate; until all
protected endpoints are covered, current production exposure remains a known
blocker.

1. Implement/test identity contracts, Google adapter abstraction, session
   validation, membership/RBAC, tenant scope, AuditContext and endpoint inventory
   with fake identities only.
2. Run non-production report-only resolution to prove Google issuer/subject,
   Session behavior and unresolved-user telemetry. No client actor becomes
   trusted during observation.
3. Add additive User/ExternalIdentity/Membership/Role persistence; seed reviewed
   VMOS named members and capability bundles through separately approved work.
4. Put the authorization dispatcher in front of **every protected endpoint** in
   code, initially disabled in production. Tests must prove no alternate callable
   mutation path bypasses it.
5. Remove client-authoritative identity from purchase approval/receipt and gate
   purchase/cash/finance mutations; enforce UserID separation and step-up.
6. Gate generic canonical CRUD, record cancellation, configuration and user/role
   administration.
7. Gate shop-floor transitions/configuration and require named/kiosk operator
   attribution; QR remains navigation only.
8. Gate quote approval/issuance, RFQ review, FollowUp lifecycle/calendar
   reconciliation and SalesActivity management.
9. Gate protected reads, beginning with broad bootstrap/calendar/dashboard and
   tenant-sensitive detail/history endpoints.
10. Dual-write new authoritative ActorUserID/audit events while preserving legacy
    display fields; reject/ignore client actor fields and instrument remaining
    legacy consumers.
11. Complete the security test matrix, controlled access/deployment validation,
    rollback and independent completion gate. Only then change production access
    or enable enforcement. Retire the legacy helper as an actor authority.

If any protected endpoint remains ungated, documentation/UI must say enforcement
is partial; do not create false confidence by securing only the highest-profile
screen.

## Production deployment policy

Allowed production profiles after implementation/validation:

- **VMOS restricted Google:** named/domain-restricted access, execute-as-user
  identity proven, active membership/RBAC and AuditContext enforced.
- **VMOS application-gated:** execute as deployer only behind a cryptographically
  verified Atlas session and universal endpoint guard; direct anonymous calls
  receive no protected data or mutation authority.

Forbidden:

- `ANYONE` as the only control for a web app executing with deployer authority;
- relying on workbook sharing, obscurity of URL, QR possession, effective-user
  email, calendar connection or browser actor fields as Atlas authorization;
- activating production mutation before membership, capability, audit and
  bypass tests pass.

The current manifest remains unchanged by MOS-121C and is **not approved for
writable production use** under this policy.

## Shared/kiosk station policy

Named operator identity is the default. A shared station may hold a restricted
kiosk principal that can open the shop shell and resolve minimal Job information,
but it cannot independently perform consequential transitions.

- Permitted kiosk capabilities: minimal operations read/navigation and health;
  optionally prepare a command awaiting operator confirmation.
- Prohibited: finance, purchase/quote approval, record cancellation, calendar
  reconciliation, configuration, user/role administration, broad customer data,
  or silent actor attribution to the kiosk.
- Consequential shop actions require a named operator authentication/confirmation
  associated with that command. The audit actor is the operator; station/kiosk
  ID is separate context.
- Switching operator is explicit. Logout/lock clears operator context and pending
  privileged drafts. A configured short idle lock applies on unattended shared
  stations; no remembered high-risk authentication survives it.
- Loss of identity-provider access fails mutation closed. QR possession never
  promotes the kiosk to an operator.

The concrete badge/PIN/passkey mechanism and QR lifecycle belong to later
implementation/token stories.

## Recent-authentication / step-up policy

Routine reads, SalesActivity entry, FollowUp updates and ordinary authorized
shop transitions may use a valid normal session. Step-up capability is required
for:

- above-threshold purchase approval;
- cash deposit and tenant-defined sensitive financial mutation;
- quote approval/issuance where it creates a customer commitment;
- record cancellation or irreversible lifecycle action;
- production configuration, credential/provider activation;
- user, membership, role or permission administration;
- exceptional reconciliation that completes/cancels canonical work;
- emergency/admin override.

The gate evaluates `recentAuthenticationAt` against a configured tenant policy
and required assurance. Exact session and recent-auth windows require approval
after operator testing; routine shop activity must not trigger repeated step-up.
Provider calendar reauthorization is provider authorization, not Atlas step-up.

## Safe failure behavior

| Failure | Server behavior | Operator response |
| --- | --- | --- |
| Missing/unresolved/expired identity | Deny before repository access; never fall back to deployer as human | “Sign in again to continue.” |
| No/inactive membership | Deny without revealing tenant records | “Your Atlas access is not active. Contact an administrator.” |
| Tenant mismatch | Deny and security-audit the attempt; no existence disclosure | Generic access-denied message. |
| Capability/resource policy denied | Preserve state; audit denial where safe | “You do not have permission for this action.” |
| Step-up missing/stale | Preserve input where safe; issue step-up challenge | “Confirm your identity to continue.” |
| AuditContext cannot be constructed | Deny mutation | Generic safe-retry/support message. |
| Required audit persistence fails | Roll back atomic business mutation where feasible; otherwise retain durable uncertain/outbox reconciliation and do not claim clean success | Explain that the result is being verified; block blind retry. |
| Identity provider unavailable | Continue only already verified sessions within explicit policy; never authenticate a new caller or elevate | Clear availability/retry state; unrelated safe MOS work may continue if session remains valid. |

Errors do not reveal issuer subjects, memberships, role internals, tenant IDs,
tokens or policy configuration.

## Legacy compatibility

Historical Actor/Created By/Updated By/Approved By values are immutable. Records
created before authoritative identity activation are displayed as legacy
attribution and, where relevant, marked `LEGACY_UNVERIFIED`; the literal deployer
or `VMOS` is not relabeled as a human. New audit records store stable ActorUserID
and optional display snapshot. Compatibility views may show both without
rewriting history.

During endpoint migration, client actor fields are accepted only as deprecated
business-display/assignment inputs where explicitly needed, never as AuditContext.
Calls are instrumented, then fields are rejected/removed after consumers migrate.
No compatibility bridge may silently grant access or manufacture a membership.

## Security test contract

Future implementation must include endpoint-level tests for:

- unauthenticated, expired, replayed and malformed-session mutation denial;
- authenticated non-member and inactive-user/member denial;
- wrong-tenant read/mutation with no record-existence leakage;
- missing capability across every capability group;
- client Actor/CreatedBy/UpdatedBy ignored as audit authority;
- actor/approver spoofing and privilege escalation through role/tenant/owner;
- finance receipt/deposit enforcement and requester self-approval denial by
  stable UserID above threshold;
- quote approval/issue and cancellation step-up;
- named shop operator attribution, kiosk restrictions, explicit operator switch,
  unattended lock and QR-without-operator mutation denial;
- successful authoritative actor attribution distinct from owner/requester;
- Google identity mapping plus active VMOS membership;
- Google/Microsoft/Apple calendar authorization never authenticates Atlas;
- provider webhook restricted system principal;
- missing/failed audit context and atomic rollback/outbox uncertainty;
- identity-provider outage under valid and expired sessions;
- legacy records remain unchanged/labeled unverified;
- callable-endpoint inventory test proving no protected mutation bypasses the
  universal gate.

Tests exercise browser-callable endpoint -> identity adapter -> membership ->
authorization -> service -> audit -> repository, not only isolated permission
helpers.

## Remaining decisions requiring Brendan

1. Choose the first VMOS composition after non-production evidence: restricted
   execute-as-user or execute-as-deployer with a verified Atlas session.
2. Approve the named Google accounts/domain eligible for membership and initial
   user-to-role assignments.
3. Approve normal session lifetime, the recent-auth interval and accepted
   step-up method/assurance.
4. Choose the shared-station operator-confirmation mechanism and idle-lock
   policy; named identity remains mandatory for consequential actions.
5. Approve which current Sheets mutations can atomically append audit and which
   require a durable outbox/reconciliation design.
6. Approve the controlled cutover/rollback window after the independent security
   gate passes. No current production change is authorized by this document.
