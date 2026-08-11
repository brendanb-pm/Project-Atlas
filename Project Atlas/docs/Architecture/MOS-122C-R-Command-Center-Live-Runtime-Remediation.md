# MOS-122C-R — Command Center Live Runtime Remediation

Release channel: **MAIN**
Inspected baseline: `cd07e55c6c67f26ff7354e09d35255012e5b0753`

## Reproduced failure and root cause

The end-to-end path was traced from `getCommandCenterWorkspace` through the endpoint registry, abuse control, principal resolution, Atlas User and membership lookup, capability expansion, `CommandCenterWorkspaceService_`, callable response, and `Index.html` success/failure handlers.

`CommandCenterWorkspaceService_` returned `generatedAt` as a JavaScript `Date`. A `Date` is usable during server execution but is not a supported `google.script.run` transport value. The server invocation can therefore complete without an Atlas exception while the HTML-service bridge rejects the response and invokes the browser failure handler. That exactly matches the observed Version 13 behavior: a completed Apps Script execution, no demonstrated Atlas exception, and the generic unavailable screen.

The endpoint now serializes the complete workspace model through the existing `serializeVmosValue_` boundary before returning it. This converts the timestamp and any future nested date values to ISO strings without changing canonical data.

## Identity and navigation relationship

Navigation and Command Center both receive the same immutable authorization context from `authorizedExecute_`. The observed one-item navigation is independently explained by a context with zero recognized capabilities:

- a successfully resolved active member with no applicable roles/capabilities produces `NO_APPLICABLE_CAPABILITIES`;
- a failed identity/membership resolution allowed to continue only in `VALIDATION` produces `IDENTITY_VALIDATION_REQUIRED`;
- `ENFORCED` mode fails closed with the existing client-safe `AUTHORIZATION_ERROR`.

Zero capabilities do **not** reproduce the transport failure. They produce a valid, explicit, empty workspace contract and limited navigation. Atlas does not grant fallback permissions, infer ADMIN, trust browser identity, or use EffectiveUser as operator identity.

`DISABLED_FOR_DEVELOPMENT` and `VALIDATION` remain non-production modes. In those modes the legacy context has no fabricated capabilities. An authorized test/owner experience requires actual non-production Atlas User, External Identity Reference, active Tenant Membership, and reviewed roles/capabilities. `ENFORCED` never falls back to client or legacy identity.

## Workspace sources and degradation

The implementation and current additive mappings were inspected for:

- FollowUps (`FollowUps`);
- Jobs / operational state (`Jobs`);
- purchase approvals (`PurchaseApprovalService_` and its configured repository);
- calendar reconciliation (`ExternalChangeRequests`);
- Customer, RFQ, Quote, Job, and Invoice metrics/recent references.

Each authorized source is read inside its own guarded section. A missing header, optional worksheet, or repository failure returns an operator-safe section warning and an empty section while other sources continue. Even when every optional source fails, the overall workspace remains a valid payload. No provider network call occurs.

Safe server diagnostics now record only the workspace correlation ID, source label, and safe error category under `COMMAND_CENTER_SOURCE_UNAVAILABLE`. Raw row data, worksheet details, properties, credentials, tokens, and provider internals are not logged by this diagnostic.

## Client response contract

The browser now distinguishes:

| Condition | Operator behavior |
|---|---|
| Authorization or active membership unavailable | Accurate identity/membership guidance with the safe error reference |
| Valid member with zero applicable capabilities | Roles/capabilities review guidance; not presented as a data outage |
| Validation-mode unresolved identity | Explicit validation/provisioning guidance |
| One or more source failures | Section-level warnings; remaining workspace stays usable |
| Malformed server payload | Unexpected-response guidance; malformed data is not treated as a healthy empty workspace |
| Transport/internal failure | Retry guidance and safe reference when supplied by the server |
| Valid empty workspace | Normal healthy empty states render |

The contract requires an ISO `generatedAt`, explicit `accessState`, bounded array sections, a recent-record object, and an unavailable-source array.

## Performance and security

The remediation adds no repository, provider, or browser round trip. It preserves one bounded `getCommandCenterWorkspace` request, existing source bounds, section isolation, and no `getMvpBootstrap` dependency. Serialization is one bounded in-memory traversal of the already-built response. Source diagnostics execute only on failure.

Authorization remains server-derived. No membership, capability, deployment, Script Property, worksheet, schema, production data, provider, or credential was modified.

## Post-deployment validation for Brendan

1. Create a new immutable Apps Script version containing this commit and update only the controlled validation deployment. Do not overwrite production access/configuration implicitly.
2. Confirm the validation deployment uses its approved profile. `DISABLED_FOR_DEVELOPMENT` and `VALIDATION` are not approved writable-production security. Writable production requires trusted principal resolution plus `ENFORCED`.
3. Confirm `ATLAS_TENANT_ID` identifies the validation tenant.
4. For the signed-in test account, verify:
   - `ExternalIdentityReferences` has an ACTIVE Google Workspace subject mapping;
   - the referenced `AtlasUsers` record is ACTIVE;
   - `TenantMemberships` contains an ACTIVE membership for the configured tenant;
   - Roles JSON uses a recognized role such as `ADMIN` or `MANAGER`, or Capabilities JSON contains reviewed stable capabilities.
5. An ADMIN test member should receive the currently supported broad navigation and a populated or healthy-empty Command Center. A zero-capability member should receive only Command Center plus explicit access guidance.
6. Confirm `getCommandCenterWorkspace` returns once per refresh and that no `getMvpBootstrap` call occurs on Command Center entry.
7. If a section is unavailable, inspect Apps Script Executions for `COMMAND_CENTER_SOURCE_UNAVAILABLE`, its correlation ID, source, and category. Inspect the corresponding configured worksheet/header separately; do not expose those details to the operator.
8. If the complete endpoint fails, use the operator's safe `ERR-...` reference to locate the existing server diagnostic. Confirm identity stage, tenant, membership, and enforcement mode before changing data access.
9. Validate with representative non-production data and the intended desktop/tablet browser. Live runtime QA remains incomplete until this controlled deployment check succeeds.

No production resource was changed by MOS-122C-R.
