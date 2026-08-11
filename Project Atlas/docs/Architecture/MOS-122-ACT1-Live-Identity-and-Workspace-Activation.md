# MOS-122-ACT1 — Live Identity and Workspace Activation Validation

Release channel: **MAIN**

Baseline inspected: `fa7650f278dc1599df6e6fec73ab50dd8639b3e1`

## Activation conclusion

The repository is ready for a controlled live validation after deployment, but the live tenant is not automatically provisioned by this story. No production identity, membership, worksheet, Script Property, deployment, provider, or business record was changed.

The live one-route condition and source warnings have two separate causes:

1. Identity or membership that cannot complete the ENFORCED path yields no authorized workspaces. A contained defect also caused non-authoritative development/validation fallback contexts to inherit every capability when the capabilities field was omitted. That fabricated access is removed; these contexts now carry an explicit empty capability set.
2. Source warnings mean an eligible source was actually attempted and its repository/configuration failed. Follow-Ups and purchasing remain real store/configuration activation issues. Calendar review was incorrectly probed even when calendar integration was disabled; it now returns a healthy `DISABLED` or `NOT_CONFIGURED` state without reading calendar-reconciliation storage.

## Current identity enforcement model

`ATLAS_IDENTITY_ENFORCEMENT_MODE` supports only:

- `DISABLED_FOR_DEVELOPMENT`: non-authoritative, zero capabilities; never production-approved;
- `VALIDATION`: attempts the trusted path, safely logs a would-deny category, then uses a non-authoritative zero-capability context; never production-approved for writable use;
- `ENFORCED`: unresolved identity, mapping, user, membership, tenant, entitlement, or capability fails closed.

The trusted principal is `Session.getActiveUser().getEmail()` normalized to lowercase and represented as provider `GOOGLE_WORKSPACE`. `Session.getEffectiveUser()` is never accepted as the operator. The configured `ATLAS_TENANT_ID`, not a browser value, establishes the tenant.

The matching chain is:

`verified Google principal -> ACTIVE ExternalIdentityReference -> ACTIVE AtlasUser -> ACTIVE TenantMembership for ATLAS_TENANT_ID -> recognized roles plus explicit capabilities`

## Exact identity stores and matching

| Store | Required headers | Required record semantics |
|---|---|---|
| `AtlasUsers` | `UserID`, `Display Name`, `Status`, `Created At`, `Updated At` | Stable UserID; `Status=ACTIVE`. |
| `ExternalIdentityReferences` | `IdentityReferenceID`, `UserID`, `Provider`, `Subject`, `Status`, `Created At`, `Updated At` | `Provider=GOOGLE_WORKSPACE`; Subject equals the normalized signed-in email, case-insensitively; links to the Atlas UserID; `Status=ACTIVE`; exactly one active match. |
| `TenantMemberships` | `MembershipID`, `TenantID`, `UserID`, `Status`, `Roles JSON`, `Capabilities JSON`, `Created At`, `Updated At` | TenantID exactly equals configured `ATLAS_TENANT_ID`; UserID matches; `Status=ACTIVE`; exactly one active match. Roles/capabilities are JSON arrays or supported comma lists. |
| `SecurityAuditEvents` | Headers defined by `ATLAS_IDENTITY_MAPPINGS.SecurityAuditEvent`, beginning with `SecurityAuditEventID`, `TenantID`, `UserID`, principal, operation, capability, correlation, recovery, timing, outcome, and status fields | Required for authoritative durable mutation/audit enforcement. It is not a login or role store. |

No initializer exists for these identity stores. They must be created and populated only through a separately reviewed activation procedure.

## Zero-capability root-cause tree

| Condition | ENFORCED result | Safe activation diagnosis |
|---|---|---|
| Principal absent/malformed | Denied | Confirm restricted deployment exposes ActiveUser email. |
| External identity missing/inactive/ambiguous | Denied | Create or correct one reviewed ACTIVE mapping. |
| Atlas User missing/inactive | Denied | Create or activate the reviewed Atlas User. |
| Membership missing/inactive | Denied | Create or activate membership for the configured tenant. |
| Wrong TenantID | Denied | Align membership TenantID with `ATLAS_TENANT_ID`; never accept a browser override. |
| Unknown role only | Authorized membership with zero derived capabilities | Correct the role key or assign reviewed explicit capabilities. |
| Empty roles/capabilities | Authorized membership with zero workspaces | Assign the intended reviewed role bundle. |
| Stale deployment/config | Behavior differs from this contract | Verify deployed version and Script Properties without changing them implicitly. |

Ordinary UI says identity/membership needs administrative review or that no workspaces are assigned. It does not disclose which user, tenant, or record exists. The ADMIN diagnostic supplies safe stage confirmation only after authoritative ADMIN_CONFIG authorization succeeds.

## Owner/Admin capability and navigation model

`ADMIN` currently expands to every stable key in `ATLAS_CAPABILITIES`; this is an explicit current registry, not permission for unnamed future capabilities. An Owner-style deployment must use a reviewed role/capability assignment—Atlas does not define or infer an `OWNER` superuser.

Current route presentation requires:

| Surface | Capability |
|---|---|
| Command Center | Always visible after shell load; content is capability-derived |
| Customers, Ideas | `CORE_RECORD_READ` |
| Sales Activity | `SALES_READ` |
| Follow-Ups | `FOLLOWUP_READ` |
| RFQs, Quotes route | `RFQ_READ` |
| Jobs / Work Orders, Shop Floor, Operations Dashboard | `OPERATIONS_READ` |
| Invoices | `FINANCE_READ` |
| Purchasing | No route is currently registered; Command Center attention requires `PURCHASE_REQUEST` or `PURCHASE_APPROVE` |
| Administration/settings | No production route is currently registered; the health endpoint requires `ADMIN_CONFIG` |

Validated role presentation:

- `ADMIN`: all currently registered routes and capabilities;
- `MANAGER`: current CRM, commercial, operations, Follow-Up, approval, finance-read, and reconciliation capabilities;
- `SALES`: Customers, Sales Activity, Follow-Ups, RFQs/Quotes; no operations/finance route;
- `SHOP_OPERATOR`: Customers plus Jobs/Shop Floor/Operations Dashboard; shop-floor operation capability remains server-enforced;
- `FINANCE`: Customers and Invoices; no sales or shop-floor route;
- zero capability: Command Center only, with limited-access guidance.

UI visibility is never authorization.

## Source findings

### Follow-Ups

Basic Follow-Up operation requires:

- `FollowUps` with the MOS-117 mapping headers (`FollowUpID`, `CustomerID`, `SalesActivityID`, `Title`, `Due At`, `Start At`, `End At`, `Time Zone`, `Owner User ID`, `Status`, `Version`, `Created At`, `Updated At`, `Completed At`, `Cancelled At`);
- `FollowUpEvents` for authoritative lifecycle history/mutations.

`CalendarFollowUpLinks`, `ExternalChangeRequests`, `CalendarSyncEvents`, and `UserCalendarConnections` are not required merely to list basic Follow-Ups when calendar integration is disabled. The calendar workspace now lazily opens those stores only when calendar integration is enabled. A missing `FollowUps` sheet or missing primary mapping/header remains a genuine Follow-Ups source failure.

### Purchasing

Purchasing is intentionally opt-in. It requires:

- an existing worksheet named by `VMOS_PURCHASE_APPROVAL_MAPPING`;
- a mapping containing `sheetName`, `idField`, and all logical fields documented in `PurchaseApprovalConfig.gs`;
- `VMOS_PURCHASE_APPROVAL_THRESHOLD` as a non-negative number.

The proposed header set is: `Purchase Request ID`, `Request Date`, `Requester`, `Vendor`, `Category`, `Classification`, `Business Justification`, `Expected ROI / Need`, `Description`, `Amount`, `Actual Purchase Amount`, `Status`, `Approval Required`, `Approver`, `Approved At`, `Receipt Reference`, `Notes`, `Created At`, `Updated At`, `Created By`, `Updated By`, `Security Operation ID`, `Security Operation Fingerprint`, `Security Tenant ID`, `Security Actor ID`.

An existing, correctly mapped worksheet with zero rows returns `EMPTY`, not unavailable. No purchasing initializer exists.

### Calendar review

Command Center calendar review requires `CALENDAR_RECONCILE` and enabled/configured calendar synchronization. States are now:

- `NOT_AUTHORIZED`: capability absent;
- `DISABLED`: calendar sync intentionally off; no reconciliation-store read;
- `NOT_CONFIGURED`: enabled but provider/calendar configuration incomplete; no provider call;
- `EMPTY`: configured store available with no pending reviews;
- `READY`: review records exist;
- `SOURCE_UNAVAILABLE`: configured reconciliation store cannot be read.

No provider is contacted by the Command Center or activation diagnostic.

## Live workbook activation matrix

| Area/store | Classification | Reason |
|---|---|---|
| `AtlasUsers`, `ExternalIdentityReferences`, `TenantMemberships` | REQUIRED NOW for ENFORCED named-user access | Trusted identity and tenant membership. |
| `SecurityAuditEvents` | REQUIRED NOW for authoritative mutations | Durable audit/recovery ledger. |
| `Customers`, `RFQ's`, `Quotes`, `Jobs`, `Invoices` | REQUIRED NOW only for enabled current Core routes/capabilities | Existing CRM/commercial/operations/finance repositories. |
| SalesActivity configured store | REQUIRED NOW for Sales Activity | CRM activity service. |
| `FollowUps`, `FollowUpEvents` | REQUIRED NOW when Follow-Ups are enabled | Basic Follow-Up state and lifecycle history. |
| Purchase Approval mapped store | OPTIONAL; required when purchasing is enabled | Explicit opt-in configuration. |
| `JobEvents`, `JobQrTokens` | REQUIRED NOW for Shop Floor | Operational event and QR state. |
| `CalendarFollowUpLinks`, `ExternalChangeRequests`, `UserCalendarConnections` | REQUIRED ONLY FOR CALENDAR | Projection, reconciliation, and connection state. |
| `CalendarSyncEvents` | REQUIRED ONLY FOR writable calendar validation/activation | Correlation, replay, and recovery evidence. |
| Idea stores | OPTIONAL | Ideas module only. |
| Firearms/Coatings/Billing stores | FUTURE/OPTIONAL MODULE | Not part of ACT1. |

## Protected initializer findings

Only the Ideas and Shop Operational initializers exist. Both require `ADMIN_CONFIG`, create only absent sheets, compare exact headers on existing sheets, and refuse to alter mismatched existing sheets. They still mutate the workbook and must not be invoked against production without explicit approval.

There is no safe generic initializer for identity, Follow-Up/calendar, purchasing, or Core MVP worksheets. Do not improvise one during activation. Review and create exact empty schemas separately, then validate with the read-only health diagnostic.

## ADMIN-only health diagnostic

`getAtlasActivationHealth()` is a read-only callable protected by authoritative `ADMIN_CONFIG`. It accepts no user, tenant, role, capability, property, or resource identifier from the client. It reports only:

- enforcement-mode name;
- principal/user/tenant/membership resolution booleans for the already-authorized caller;
- recognized role keys and count of unrecognized keys;
- safe capability names/count;
- navigation item count;
- `READY`, `EMPTY`, `DISABLED`, `NOT_CONFIGURED`, `NOT_AUTHORIZED`, or `SOURCE_UNAVAILABLE` for Follow-Ups, purchasing, and calendar review.

Source failures log safe correlation/source/category only. The endpoint is manual and performs no routine-navigation work, no writes, no provider calls, and no large bootstrap request.

## Brendan controlled activation runbook

1. Deploy the current MAIN commit as a new immutable version to the controlled validation deployment. Expected: code version changes; deployment access does not change.
2. Confirm the web app uses the approved restricted principal composition. Expected: `Session.getActiveUser()` returns the signed-in validation account; EffectiveUser is irrelevant.
3. Read `ATLAS_IDENTITY_ENFORCEMENT_MODE`. Expected for the final security test: `ENFORCED`. Use `VALIDATION` only while diagnosing and remember it grants zero capabilities.
4. Confirm `ATLAS_TENANT_ID` is present. Expected: it exactly matches the intended membership TenantID.
5. Review/create one `AtlasUsers` record for the intended user. Expected: stable UserID and `ACTIVE`.
6. Review/create one `ExternalIdentityReferences` record. Expected: `GOOGLE_WORKSPACE`, normalized signed-in email, same UserID, `ACTIVE`, no duplicates.
7. Review/create one `TenantMemberships` record. Expected: configured TenantID, same UserID, `ACTIVE`, and reviewed `ADMIN` or other intended roles. Do not grant ADMIN merely to make navigation appear.
8. Reload. Expected: navigation matches the role matrix; an ADMIN sees all currently registered routes. A zero-capability test member still sees only Command Center.
9. As the authoritative ADMIN, invoke `google.script.run.withSuccessHandler(console.log).getAtlasActivationHealth()` from the deployed application context. Expected: `ok:true`, authoritative identity booleans true, recognized role/capability counts, and safe source states. Do not expose this result to ordinary users.
10. For `Follow-Ups=SOURCE_UNAVAILABLE`, compare the live `FollowUps`/`FollowUpEvents` headers to the exact mapping. Expected after approved activation: `READY` or `EMPTY`.
11. For purchasing, decide whether the module is enabled. If no, omit its capabilities. If yes, create/review its worksheet and both required Script Properties through a separately approved change. Expected: `READY` or `EMPTY`.
12. If calendar integration is intentionally off, expect `DISABLED` and no warning. Do not create connections or calendar sheets merely to remove a warning. If activation is approved later, follow MOS-118 and expect `EMPTY` or `READY` only after its additive stores are validated.
13. Open Follow-Ups. Expected with calendar disabled: basic records load without connection/link/request/sync-event stores.
14. Open Shop Floor with an authorized test operator and non-production QR. Expected: route is visible only with operations read; mutations remain capability- and QR-gated.
15. Test SALES, SHOP_OPERATOR, FINANCE, and zero-capability accounts. Expected: navigation matches the matrix and direct endpoint calls remain server-authorized.
16. Inspect Apps Script Executions only if needed. Correlate `ERR-...`, `COMMAND_CENTER_SOURCE_UNAVAILABLE`, or `ATLAS_ACTIVATION_SOURCE_UNAVAILABLE`; confirm no raw debug, credentials, tokens, properties, or worksheet data appear in the browser.

Production mutations required for activation—but **not executed here**—are limited to the reviewed deployment/configuration and store/identity records identified above. Each requires explicit authorization and rollback planning.
