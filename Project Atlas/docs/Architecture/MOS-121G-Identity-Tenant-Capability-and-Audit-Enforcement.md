# MOS-121G Identity, Tenant, Capability, and Audit Enforcement

Status: implemented on `MAIN` from baseline
`43d0b708e99f63ff5fe1db4190904d6f66e67150`. No deployment, production
worksheet, credential, sharing, provider, or historical audit resource was
changed.

## Implemented boundary

Every browser-callable data operation in `UI/Code.gs` now enters one classified
boundary:

`abuse screening -> authenticated principal -> Atlas user -> active tenant
membership -> entitlement extension -> capability -> immutable AuditContext ->
business operation`

`EndpointAuthorizationRegistry.gs` is the machine-verifiable inventory. It
classifies 42 endpoints as read, write, high-risk write, or administrative and
assigns one stable capability to each. A callable missing from the registry is
denied. `doGet` renders only the application shell; all data reads and mutations
are gated separately. Repositories do not authenticate callers. In the current
single-workbook deployment model, the trusted deployment tenant selects the
tenant-isolated store; a browser TenantID is never accepted.

The abuse check remains first so obvious excess can be rejected cheaply.
Passing it never grants authorization. One authorization service instance
per call resolves principal, user, membership, capabilities, and AuditContext
once, avoiding request-local N+1 identity reads.

## Identity and persistence

The Google Apps Script principal adapter accepts only a non-empty
`Session.getActiveUser().getEmail()`. It does not inspect request fields and
does not fall back to `Session.getEffectiveUser()`. The verified provider/type
and subject map through an active external identity reference to an active
Atlas user and then an active membership in the server-configured tenant.
Calendar accounts, QR tokens, business owners, emails submitted by the browser,
and provider identities are not login identities.
Multiple active mappings for one provider subject, or multiple active
memberships for one user/tenant pair, are treated as ambiguous and fail closed.

The following additive sheets are required before `ENFORCED` activation. They
are not created automatically:

| Sheet | Exact headers |
| --- | --- |
| `AtlasUsers` | `UserID`, `Display Name`, `Status`, `Created At`, `Updated At` |
| `TenantMemberships` | `MembershipID`, `TenantID`, `UserID`, `Status`, `Roles JSON`, `Capabilities JSON`, `Created At`, `Updated At` |
| `ExternalIdentityReferences` | `IdentityReferenceID`, `UserID`, `Provider`, `Subject`, `Status`, `Created At`, `Updated At` |

Only stable references and authorization metadata are stored. Passwords,
sessions, OAuth tokens, and provider credentials are prohibited. Identity
records are additive; existing business rows and historical attribution remain
unchanged.

## Capabilities and default roles

Capabilities are stable service-facing permissions: core record read/write,
sales read/write, FollowUp read/write/reassign, operations read/write,
shop-floor operate, RFQ read/write, quote write/approve/issue, purchase
request/approve, finance read/write, calendar use/reconcile, and configuration
or identity administration.

Initial role bundles are defaults, not business-service checks:

- `SHOP_OPERATOR`: core/operations read and shop-floor operate.
- `SALES`: core, sales, FollowUp, RFQ, quote preparation, and personal calendar
  capabilities.
- `MANAGER`: operational and sales management, reassignment, approvals,
  issuance, purchase approval, and calendar reconciliation; not finance write or
  identity administration.
- `FINANCE`: core read, finance read/write, and purchase request.
- `ADMIN`: all current capabilities.

Membership-specific capabilities may supplement role bundles. A future tenant
role repository may replace the defaults without changing services. The
entitlement evaluator is deliberately positioned after active membership and
before capability evaluation; it currently grants no capabilities and contains
no MOS-122 billing logic.

## Audit and attribution cutover

`AuditContext` is created server-side and frozen. It contains Atlas `UserID`,
trusted `TenantID`, principal type/reference, operation, correlation ID, server
time, actor type, and whether the context is authoritative. Endpoint code passes
its `UserID` into existing append-only/service audit fields. Client `Actor`,
`CreatedBy`, `UpdatedBy`, `ApprovedBy`, requester, and receipt-recorder claims
cannot choose authoritative attribution. Business owner/assignee fields remain
separate and may be assigned by an authorized actor.

Purchase submission records the authoritative Atlas requester. Approval uses
the authoritative approver and enforces requester/approver separation above the
configured threshold. Cash receipt/deposit attribution requires `FINANCE_WRITE`.
Shop-floor mutations require both authenticated capability and a valid scoped QR
where the workflow requires it. FollowUp/calendar lifecycle actions use the
authorized actor; a calendar connection never supplies Atlas authority.

Records before the `ENFORCED` activation timestamp remain
`LEGACY_UNVERIFIED`; they are not rewritten. New enforced mutations are the
authoritative cutover. Development/validation records must not be represented as
authoritative production audit.

## Activation modes and safe failure

- `DISABLED_FOR_DEVELOPMENT` (default) preserves local/test compatibility and
  emits a frozen but explicitly non-authoritative development context. It is
  forbidden for writable production.
- `VALIDATION` attempts the complete resolution path and logs a security-safe
  `IDENTITY_VALIDATION_WOULD_DENY` diagnostic, then runs with an explicitly
  non-authoritative validation context. It is forbidden for production.
- `ENFORCED` fails closed for missing/unverified principal, missing tenant,
  missing/inactive user or membership, entitlement failure, or absent
  capability. There is no client/deployer identity fallback.

Client errors use the existing `AUTHORIZATION_ERROR` boundary and diagnostic
correlation without exposing membership, role, tenant, sheet, or identity
internals. Audit-context construction occurs before mutation; a context failure
cannot reach business persistence.

## Trusted system work

System execution is explicit and least-privileged. The private factory permits
only reviewed operation/capability pairs (`CALENDAR_RECONCILIATION` with
`CALENDAR_RECONCILE`, and `RFQ_INTAKE` with `RFQ_WRITE`). It creates a system
actor and cannot impersonate a human or request arbitrary admin capability.
Production triggers/callbacks must call a reviewed private system wrapper; this
story did not activate any trigger, provider, watch, subscription, or poller.

## Activation and rollback

1. Create the three reviewed additive sheets in an isolated non-production
   workbook and verify exact headers.
2. Seed stable Atlas users, active test-tenant memberships, reviewed roles, and
   Google external identity references. Set `ATLAS_TENANT_ID` only in the
   isolated deployment.
3. Validate restricted access + execute-as-accessing-user and prove that
   `getActiveUser` is reliably the named test operator. Separately evaluate an
   execute-as-deployer deployment only behind a cryptographically verified
   Atlas session; that session provider is not implemented here.
4. Set `ATLAS_IDENTITY_ENFORCEMENT_MODE=VALIDATION`, inspect would-deny evidence,
   then use `ENFORCED` only after every expected operator resolves correctly.
5. Re-run endpoint, spoofing, tenant, capability, QR, finance, calendar, abuse,
   input, and full regression tests against the isolated deployment.
6. Roll back application access by disabling writable deployment exposure. If
   code compatibility rollback is required, use the prior version in the same
   isolated environment; do not label `DISABLED_FOR_DEVELOPMENT` a secure
   production rollback. Canonical business and append-only audit data remain.

Production remains blocked until the approved deployment composition is tested,
the additive stores are reviewed/seeded, `ENFORCED` is validated with real
server-side principals, endpoint behavior is exercised in Apps Script, and the
separate MOS-121H independent security gate passes. High-risk recent-auth/step-up
activation remains a deployment/session-provider concern and is not fabricated
by this implementation.
