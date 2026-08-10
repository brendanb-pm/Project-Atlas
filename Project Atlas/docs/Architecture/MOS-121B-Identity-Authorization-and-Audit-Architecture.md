# MOS-121B Authentication, Identity, Authorization, and Audit Architecture

## Control-story boundary

Release channel: **MAIN**. Baseline:
`77145f1e195e7b6ceb81363a95ed948dd1da5f15`.

The Git remote was verified as `brendanb-pm/Project-Atlas` and the branch as
`main`. This assessment is grounded in the current Apps Script manifest,
endpoints, services, repositories, tests and deployment documentation. It does
not implement an authentication provider, OAuth, users/roles, schema, sharing,
Script Properties, deployment mode, or historical audit changes.

## Executive finding

Current MAIN does not have a trustworthy, general Atlas authentication and
authorization boundary. `appsscript.json` declares `executeAs:
USER_DEPLOYING` and `access: ANYONE`. `getVmosAuditUser_()` in
`Services/MvpServices.gs` returns `Session.getActiveUser().getEmail()`, then
`Session.getEffectiveUser().getEmail()`, then the literal `VMOS`. Under an
execute-as-deployer deployment, the effective identity can be the deployer and
the active user's email may be unavailable. Consequently, server-derived does
not necessarily mean operator-attributable.

Most endpoints do not authenticate a principal or authorize a capability.
They rely on deployment reachability and the script's storage authority.
Several actor/approver fields are client asserted. Existing attribution may be
useful operational history, but it is not uniformly verifiable evidence of the
human who acted.

## Current identity sources

| Source | Classification | Current use and trust statement |
| --- | --- | --- |
| `Session.getActiveUser().getEmail()` | **AUTHORITATIVE_SERVER_IDENTITY only when the deployment/access policy guarantees a non-empty, verified caller identity** | First choice in `getVmosAuditUser_`. Current `ANYONE`/execute-as-deployer manifest does not establish that guarantee for every caller. |
| `Session.getEffectiveUser().getEmail()` | **TRUSTED_SYSTEM_IDENTITY** | In execute-as-deployer mode it identifies the executing/deploying account, not necessarily the operator. Suitable for a service identity field, not a human actor field. |
| Literal `VMOS` fallback | **TRUSTED_SYSTEM_IDENTITY / LEGACY UNKNOWN** | Identifies the deployment/system only. It must never be represented as an authenticated human. |
| Browser `approver` and `actor` parameters | **CLIENT_ASSERTED_IDENTITY** | `approvePurchaseRequest(id, approver, notes)` and `recordPurchaseReceipt(..., actor)` persist caller-supplied attribution. Not authoritative. |
| Service `actor` parameters without a trusted context type | **LEGACY / UNKNOWN** | FollowUp/calendar, QuoteRevision and RFQ staging services accept strings. Some endpoints supply `getVmosAuditUser_`; other/future callers can supply arbitrary strings. |
| `ownerUserId`, `followUpOwnerUserId`, Job `operator`, purchase `requester`, `responsibleParty` | **BUSINESS_ASSIGNMENT** | Describes responsibility/assignment. It may legitimately be chosen or reassigned by an authorized actor and must not be used as proof of who performed the mutation. |
| Calendar `UserCalendarConnection.userId` and external event actor | **BUSINESS ASSIGNMENT / EXTERNAL OBSERVATION** | Routes a FollowUp to a connection or reports provider data. A calendar account is not an Atlas login and provider-reported actor data is not Atlas audit identity. |
| QR token | **CAPABILITY/RESOURCE LOCATOR, not identity** | Resolves a Job/workflow. Possession currently permits shop actions through public endpoints but does not identify a human operator. |

### Actor versus owner

`actorUserId` means the authenticated Atlas user who performed the command.
`ownerUserId`, `operatorUserId`, `requesterUserId`, `approverUserId`, and
`responsibleUserId` are business relationships selected under permission rules.
They may be equal but are never inferred from each other. An audit event records
both actor and changed assignment when relevant.

## Request traces and code-grounded risks

### Generic Customer/RFQ/Quote/Job/Invoice mutations — CRITICAL

`Index.html -> createMvpRecord/updateMvpRecord (UI/Code.gs) -> MvpService ->
SheetsRepository`. The endpoint accepts any supported entity and input/changes.
There is no authenticated principal, membership or permission check.
`MvpService` overwrites Created/Updated By with `getVmosAuditUser_`, but under
the current manifest that can be the deployer/system rather than the operator.
Anyone able to invoke the deployed endpoint can attempt canonical mutations
using the deployer's spreadsheet authority.

### Purchase approval — CRITICAL

`approvePurchaseRequest(id, approver, notes) -> PurchaseApprovalService.approve
-> PurchaseApprovalRepository`. `approver` is supplied by the browser/caller,
used to enforce requester/approver separation, then persisted as both approver
and Updated By. A caller can claim another approver and bypass the intended
separation-of-duties identity check. No `purchase:approve` authorization exists.

`recordPurchaseReceipt(id, reference, actor)` also accepts a client actor and
persists it as Updated By: **HIGH** attribution spoofing. Purchase submission's
requester is a legitimate business assignment, but it is also client supplied;
the audit creator is the deployer/system fallback under current deployment.

### Cash receipts — CRITICAL

`recordCashReceipt/depositCashReceipt -> CashReceiptService -> repository` uses
the server helper for Created/Updated By and correctly ignores a client audit
field, but has no authenticated membership or finance permission check. These
are financial mutations executable with deployment authority. Idempotency and
relationship validation do not substitute for authorization.

### Shop floor and QR — HIGH

`?shop=1&qr=... -> resolveShopJobByQr`, then transition/problem/block endpoints
call `ShopFloorService`. A QR token safely avoids embedding Job/customer data,
and command IDs provide idempotency, but the bearer token only identifies the
Job/workflow. The mutation endpoints accept a Job ID and do not require the QR
token again, an authenticated operator, membership or `job:transition`
permission. JobEvent Actor comes from `getVmosAuditUser_`; responsible party can
come from `payload.responsibleParty`. Possession/reachability must not be treated
as operator identity or broad authorization.

`configureShopFloorJob` is an administrative mutation with no admin capability
gate: **HIGH**.

### Calendar and FollowUps — HIGH

FollowUp endpoints obtain an actor string server-side, but no centralized role
authorization protects create, schedule, reassign, complete, cancel, external
change resolution, retry or acknowledgement. Calendar disconnect/retry compares
connection `userId` to the helper string; when that string is the deployer rather
than the operator, legitimate access can fail or ownership can be misapplied.
`getCalendarWorkspace` returns all FollowUps, Customers, links and pending
requests without membership/record authorization. Calendar audit events persist
the helper string. Provider correlation/version safeguards are strong sync
controls but are not user authorization.

### SalesActivity — HIGH

The endpoint passes `getVmosAuditUser_` and the service distinguishes owner from
actor. It has the repository's only recognizable permission abstraction:
`sales:write` and `sales:manage`, with managers configured by Script Property.
However, `sales:write` merely compares the candidate with the same helper value,
and manager identity is an email string. With deployer attribution, every
operator may appear identical. Ownership fields remain business assignments;
Created By User ID is not trustworthy individual attribution until principal
resolution is fixed.

### Quote revision/issuance — HIGH (service boundary)

`QuoteRevisionService.approveForSend/issue` accepts a free-form actor and writes
Approved By/Issued By without authorization. No active UI endpoint was found in
current `UI/Code.gs`, reducing immediate exposure, but the service contract is
unsafe to expose. Quote approval/issuance requires explicit capabilities and a
trusted audit context before endpoint activation.

### RFQ review/approval — MEDIUM

The staging service's `reject` accepts a reviewer string. `approve` records
approval timestamps/events but does not persist an authoritative reviewer or
approver. No active review endpoint was found in `UI/Code.gs`; the current UI is
a concept surface. Before activation, both actions need identity/permission and
audit context. Gmail/AI provider identity remains a system/provider source, not
the approving human.

### Ideas and ProcessTrials — MEDIUM

Mutations use `getVmosAuditUser_` and have no capability check. They are lower
impact than financial/lifecycle actions, but actor attribution is still
deployment identity and any reachable caller can mutate. Promotion requests
must not become production records without authorization (current behavior does
not create them).

### Read endpoints — HIGH aggregate exposure

Bootstrap, CRM, dashboard, job history and calendar reads do not evaluate
membership or record-level permissions. `access: ANYONE` plus deployer storage
authority means ordinary Sheets sharing is not an application authorization
boundary for web requests. Reads must follow explicit tenant/permission policy.

## Risk summary

| Severity | Confirmed findings |
| --- | --- |
| CRITICAL | Public/deployer execution with no general authentication gate; generic canonical mutation; client-spoofable purchase approver/separation check; unauthorised financial receipt/deposit mutation. |
| HIGH | QR/shop lifecycle changes without operator authentication; calendar/FollowUp lifecycle and broad workspace reads; SalesActivity identity collapse; client-spoofable purchase receipt actor; unguarded admin configuration; Quote approval/issue service actor. |
| MEDIUM | RFQ reviewer/approver attribution gaps; Ideas/ProcessTrial unguarded mutations; assignment fields may be mistaken for actors. |
| LOW | UI labels may display deployer or `VMOS` as if it were a person, obscuring uncertainty even where the underlying operation is low risk. |

## Apps Script deployment-mode assessment

### A. Execute as deploying user

- **Identity:** Active user may be blank or context-dependent; effective user is
  the deployer. This cannot alone prove the human caller.
- **Access:** Central spreadsheet/Drive/Gmail access is operationally simple;
  users need not receive direct resource access. Every request exercises the
  deployer's privileges, increasing authorization impact.
- **OAuth/providers:** Deployment-owned Google services are simple, but per-user
  provider authorization still requires separate connections/credentials.
- **Operations:** Lowest VMOS setup burden, compatible with external users, but
  requires an independent authenticated Atlas session/token boundary.
- **Portability:** Does not require Google identity if a provider-neutral
  authenticator is placed in front. Without that layer it is unsafe for
  attributable multi-user operation.

### B. Execute as user accessing the web app

- **Identity:** Can provide a Google server identity in supported account/domain
  contexts, subject to Apps Script access policy and email availability.
- **Access:** Each user needs appropriate Google authorization/resource access;
  least privilege becomes partly tied to Sheets/Drive sharing. Business
  authorization is still required.
- **OAuth/providers:** Each user may face Apps Script scopes/consent for Google
  services. This does not authorize Microsoft/Apple calendars and must not be
  conflated with calendar connections.
- **Operations:** More user onboarding, consent and sharing administration;
  external/non-domain availability must be validated. Provider outages or
  revoked user access may affect ordinary MOS operations.
- **Portability:** Strong VMOS/Google option but weak as the universal Atlas
  identity model. It couples login availability to Google Workspace constraints.

Changing deployment mode alone does not create Atlas users, memberships,
permissions or durable audit context. It is not the complete fix.

## Viable architectures

| Option | Security | Apps Script fit | Portability/SaaS | Complexity and risk |
| --- | --- | --- | --- | --- |
| Google Workspace principal, execute as accessing user | Verified Google identity where supported; still needs membership/RBAC | Native but requires per-user scopes/resource access and domain validation | Low–medium; Google becomes login dependency | Lower implementation, higher operational sharing/consent burden; external tenant/user constraints. |
| Provider-neutral Atlas session verified by server, execute as deployer | Signed/opaque session resolves trusted external identity -> Atlas user/membership; central resource authority remains behind RBAC | Good if every endpoint passes a single server-side resolver and tokens are securely verified | High; Google/Microsoft/other login adapters can coexist | Moderate complexity; session issuance/revocation, CSRF/replay and secure key storage require careful implementation. Migration can be staged. |
| External Atlas backend/identity gateway, Apps Script as adapter or retired UI backend | Strongest central authn/RBAC/tenant enforcement and SaaS controls | Apps Script becomes a trusted adapter/API client rather than identity boundary | Highest | Highest build/operations/migration burden; premature for current VMOS activation unless Apps Script constraints prove blocking. |

**Recommendation:** define the provider-neutral identity/application contracts
now and implement a verified server-side principal/session boundary in a later
story. VMOS may use a Google Workspace identity adapter only if controlled
non-production tests prove caller identity availability; Atlas Core consumes an
`AuthenticatedPrincipal`, never `Session` or a Google email directly. Continue
execute-as-deployer only after an independent authentication layer gates every
request and RBAC limits the deployer's resource authority. Keep the external
backend option as the commercial scaling path, not an immediate migration.

## Recommended Atlas identity boundary

```text
Request
  -> Authentication Adapter
  -> AuthenticatedPrincipal
  -> Atlas User + active TenantMembership
  -> AuthorizationService(capability, resource)
  -> Business Service(command, AuditContext)
  -> Repository(record + append-only audit)

Calendar/Provider CredentialReference
  -> separate ExternalProviderConnection owned by Atlas User
```

### Authentication

An adapter verifies a provider assertion/session and returns:

```text
AuthenticatedPrincipal {
  issuer, subject, authenticationMethod, authenticatedAt,
  sessionId, assurance, systemPrincipal
}
```

`issuer + subject` is the stable external identity key; email/display name are
claims, not canonical IDs. The adapter can be Google for VMOS without making
Google a core requirement. An unresolved principal is anonymous and cannot
perform protected reads or mutations.

### Minimum user and membership foundation

```text
AtlasUser { UserID, DisplayName, Status, CreatedAt, UpdatedAt }
ExternalIdentity { ExternalIdentityID, UserID, Issuer, Subject, Status, LastVerifiedAt }
TenantMembership { MembershipID, TenantID, UserID, Status, RoleKeys[], CreatedAt, UpdatedAt }
RoleDefinition { TenantID, RoleKey, DisplayName, PermissionKeys[], Status }
```

No passwords or provider credentials belong in these records. External identity
references contain no OAuth token. Calendar `UserCalendarConnection` continues
to hold only a secure `CredentialReference` and links to `UserID`; it is not an
`ExternalIdentity` login record.

### Tenant boundary

For today's single-tenant deployment, `TenantID` derives from trusted deployment
configuration, not a browser parameter. Principal resolution must find an
active membership for that configured tenant. A future shared Atlas host may
resolve tenant from a trusted host/deployment routing context and then validate
membership; a client-supplied tenant ID can narrow a request only after this
check and can never establish tenancy. Every repository/read model receives the
trusted tenant scope. VMOS and IPM have separate deployment/tenant membership
data without changing Atlas Core identity semantics.

### Authorization model

Roles are tenant-configurable bundles over stable capabilities. Initial role
templates may include SHOP_OPERATOR, SALES, MANAGER, APPROVER, FINANCE and ADMIN,
but business code checks capabilities such as:

- `customer:read/write`, `sales_activity:write/manage`, `followup:write/reassign`
- `job:read/transition/configure`, `process_trial:write`
- `rfq:review`, `quote:edit/approve/issue`
- `purchase:submit/approve/receipt`, `cash_receipt:record/deposit`
- `calendar_connection:self_manage`, `calendar_reconciliation:resolve`
- `record:cancel`, `configuration:admin`, `identity:admin`, `audit:read`

Authorization evaluates active tenant membership, capability, resource tenant,
ownership/assignment policy, lifecycle state and separation-of-duties rules.
Purchase approval compares authenticated actor UserID to requester UserID; it
never compares client-entered names. ADMIN does not implicitly bypass financial
separation unless a separately documented emergency policy authorizes it.

### Audit context

Endpoints construct one immutable server-side context after authentication and
authorization:

```text
AuditContext {
  tenantId, actorUserId, membershipId, principalIssuer, principalSubject,
  authenticationMethod, sessionId, correlationId, occurredAt,
  systemActorId?, delegationReason?
}
```

Business services accept `AuditContext`, not an actor string. Repositories
persist canonical records plus append-only audit events. Audit failures on
security-sensitive mutations fail the unit of work or retain a durable
reconciliation state; silently succeeding without required audit is forbidden.
Business assignment changes record previous/new assignee separately from the
actor. Provider webhooks use a trusted system principal and retain external
source/correlation, never impersonating a human.

Existing Actor/Created By/Updated By values remain unchanged and are marked
legacy/unverified unless independently supported. Do not rewrite history.
Future records use stable UserID plus optional display snapshot; compatibility
views may display legacy strings during migration.

## QR and shop-floor policy

A QR token identifies a Job/workflow entry point only. It is not a user identity
and should not alone authorize mutation. Recommended least privilege:

1. QR resolves only the minimal Job view after tenant scope validation.
2. A transition/problem command requires an authenticated active member with
   `job:transition` (or a narrowly scoped, explicitly issued kiosk principal).
3. Audit actor comes from `AuditContext`; responsible party/operator remains a
   business assignment.
4. The command remains idempotent and tied to Job/workflow/version.

Token generation/lifetime/revocation is deferred to MOS-121D.

## Calendar compatibility

MOS-117/118 separation remains correct:

- Atlas login external identity maps to Atlas User/Membership.
- `UserCalendarConnection` maps that UserID to a separately authorized Google,
  Microsoft or Apple calendar and secure CredentialReference.
- Logging in with Google does not grant Google Calendar; connecting Google
  Calendar does not create an Atlas login.
- Provider webhook/poll actions run as trusted system principals with restricted
  sync capabilities and never gain human CRM permissions.
- FollowUp ownership drives calendar routing as business assignment; it does not
  establish the actor performing reassignment.

## Safe failure behavior

| Condition | Required behavior |
| --- | --- |
| Principal unresolved/missing | Protected read and every mutation fail closed with a generic sign-in/identity error; no deployer fallback as human. |
| Inactive user/membership | Deny; retain canonical state; record security event where safe. |
| Tenant mismatch | Deny before repository access; do not reveal record existence. |
| Insufficient capability/separation failure | Deny with operator-readable message and security audit; never accept a client actor override. |
| Identity provider unavailable | Existing verified sessions follow explicit expiry/offline policy; no new authentication. MOS data is not mutated under anonymous/deployer identity. |
| Required audit persistence fails | Security-sensitive mutation fails atomically where possible or enters durable uncertain/reconciliation state; never claim clean success. |
| Legacy endpoint lacks context | Compatibility gate resolves context server-side; if it cannot, mutation fails. Reads require an explicit temporary policy and telemetry. |
| Calendar provider unavailable | Atlas identity/session and ordinary MOS work continue; provider state becomes pending/error as already designed. |

## Incremental migration strategy

1. Add provider-neutral Principal, User, ExternalIdentity, Membership, Role,
   Permission, AuthorizationService and AuditContext contracts with fake tests;
   no deployment change.
2. Add an endpoint guard/context factory in report-only mode in non-production
   to inventory resolved/unresolved identity without trusting it for production.
3. Add additive identity/membership/role persistence and seed reviewed VMOS
   memberships through a separately approved migration. Preserve all old actor
   fields and append-only history.
4. Enforce authentication and tenant membership on read endpoints, beginning
   with broad bootstrap/calendar/dashboard data. Remove `ANYONE` exposure or
   place a verified session gate before any protected data during controlled
   activation.
5. Migrate security-sensitive mutations first: purchase approval, cash receipts,
   generic entity mutation, shop-floor/admin, quote issue, calendar lifecycle;
   then SalesActivity, FollowUps, RFQ, Ideas/ProcessTrials.
6. Replace actor string parameters with server-created AuditContext. Keep owner,
   requester and responsible-party inputs only as authorized assignments.
7. Run dual-write compatibility where new `ActorUserID`/audit events coexist
   with legacy display fields. Never backfill unverifiable history.
8. Retire client actor/approver parameters: initially reject mismatches and log
   use, then remove them after all consumers migrate. A bridge may translate a
   legacy display value into assignment only; it cannot establish actor identity.
9. Independently validate the selected VMOS authentication adapter/deployment
   mode, then activate with rollback. Future IPM memberships/configuration use
   the same contracts.

Normal MOS functionality may remain available during staged code migration only
behind the existing controlled deployment. Production exposure must not expand;
security-sensitive endpoints cannot remain permissive merely for compatibility.

## Security test strategy

Implementation completion requires tests that would fail against current
behavior:

- spoof approver/actor/Created By/Updated By while authenticated as another user;
- anonymous, missing-principal and malformed/replayed/expired session mutation;
- inactive user and inactive membership;
- cross-tenant ID enumeration, reads and mutations with non-disclosure;
- every capability allow/deny path and role-to-permission resolution;
- privilege escalation via client role, tenant, owner or provider fields;
- owner/assignee differs from actor while audit remains the authenticated actor;
- purchase requester/approver separation by UserID;
- financial, quote issue, cancellation, admin and reconciliation authorization;
- QR resolves only allowed data; transition records authenticated/kiosk actor;
- Google/Microsoft/Apple calendar authorization never authenticates Atlas;
- provider webhook uses restricted system identity;
- identity-provider outage and session expiry/revocation;
- required audit failure blocks or reconciles mutation;
- legacy actor remains unchanged/unverified and compatibility use is measured;
- VMOS and IPM memberships cannot cross data boundaries;
- execute-as-deployer tests prove the client cannot inherit deployer business
  authority without an authenticated authorized context.

Tests must exercise endpoint -> context -> authorization -> service -> audit ->
repository, not only isolated role helpers.

## Decisions requiring Brendan

1. Select the first VMOS authentication adapter for controlled validation:
   Google Workspace identity (after proving caller email availability) or a
   provider-neutral signed Atlas session in front of execute-as-deployer.
2. Define who may access VMOS initially: named accounts only, Workspace domain,
   or approved external identities. `ANYONE` is not an acceptable implicit
   policy for protected data/mutations.
3. Approve initial users/memberships and role-to-permission matrix, including
   purchase/finance separation and emergency-admin policy.
4. Decide whether unattended shop stations require named operator sign-in or a
   restricted kiosk principal plus per-action operator confirmation.
5. Define session lifetime, reauthentication requirements for high-risk actions,
   and acceptable identity-provider outage behavior.
6. Decide whether required audit persistence must be atomic with each current
   Sheets mutation or may use a durable reconciliation/outbox pattern where
   Apps Script cannot provide atomic cross-sheet writes.

These decisions precede implementation/deployment changes; this story makes no
choice on Brendan's behalf.

## Acceptance answers

1. Atlas knows the user through a verified Authentication Adapter principal,
   never a browser actor string.
2. Issuer/subject maps to an active ExternalIdentity and Atlas User.
3. Trusted deployment/host tenant context plus active TenantMembership
   establishes tenancy.
4. AuthorizationService evaluates stable capabilities, resource/tenant scope,
   lifecycle, ownership policy and separation of duties.
5. A server-created immutable AuditContext reaches every business service and
   append-only audit write.
6. Assignments are explicit record relationships and audit records capture the
   independently authenticated actor.
7. Calendar/provider CredentialReferences and connections remain separate from
   login ExternalIdentity.
8. VMOS can start with a Google adapter or Atlas session while IPM/others use
   the same provider-neutral User/Membership contracts.
9. Current MAIN lacks general authentication/RBAC, may attribute the deployer,
   permits broad deployed-authority operations, and accepts some client actors.
10. Implement contracts/tests, observe identity in non-production, add records,
    secure reads, migrate high-risk mutations, retire client identity, then
    validate and activate separately.
