# MOS-123A SaaS Commercial Control Story and Domain Architecture

## Boundary

Atlas commercial control inserts one provider-neutral decision between active membership and capability evaluation:

`AuthenticatedPrincipal → AtlasUser → active TenantMembership → CommercialEntitlementDecision → capability authorization → AuditContext → operation`

Authentication proves a principal, membership establishes tenant access, capabilities authorize work, entitlements describe commercially available product/module/seat scope, and a billing provider reports payment facts. None substitutes for another. Provider customer/subscription identities never become Atlas users, tenants, memberships, or capabilities.

## Minimum domain

- `AtlasTenant`: stable organization/deployment identity independent of email domain, workbook, provider customer, or billing organization. One billing organization may reference multiple tenants.
- `AtlasPlanVersion`: immutable versioned commercial definition containing plan key, effective dates, included Core/module keys, and seat quantity/policy. Published versions are not rewritten; negotiated/grandfathered terms reference their version.
- `AtlasSubscription`: tenant-scoped commercial lifecycle and billing-period state, referencing one plan version plus safe provider references.
- `AtlasEntitlement`: explicit tenant/subscription grant for `PRODUCT`, `MODULE`, or `SEAT`, with quantity/state/effective period and optional audited override. Stable keys are not UI labels.
- `AtlasSeatAssignment`: auditable tenant/user occupation under the selected seat policy. It is not identity or membership.
- `AtlasCommercialAuditEvent`: append-only actor/system attribution for every commercial change and reconciliation.
- `AtlasTenantInvitation`: pending tenant-scoped invitation and approved role intent; it does not authenticate a user or consume a seat before acceptance.
- `AtlasInvoiceSnapshot`: immutable normalized provider-owned invoice/payment facts and safe references used for tenant history without storing payment credentials.

Invoice/payment facts are immutable normalized snapshots of provider-authoritative data plus safe references; Atlas does not calculate authoritative tax, total, or payment state. Usage metering is deferred until a measured product component requires it.

## Tenant and seat policy

A tenant is not an email/Workspace domain, user, membership, workbook, deployment URL, billing organization, or provider customer. Membership remains explicit, supporting multiple domains, facilities, external consultants, invited users, and multiple tenants per billing organization.

Initial seat policy is `PURCHASED_ACTIVE_HUMAN_ASSIGNMENTS`: purchased/contracted seats are the commercial quantity; count active human TenantMemberships with an active seat assignment as assigned/in use. Exclude invited/unaccepted, inactive/disabled, trusted system/service/provider identities, calendar identities, and restricted non-human kiosk principals. Platform-support access is separately authorized and not silently billable. Record assignment changes so plan cap, purchased, assigned/billable, available/overage, and occupants are explainable. Over-entitlement produces an attention state; it never deletes or silently deactivates users. Pending invitations consume no seat; acceptance requires confirmed available capacity and never purchases a seat silently.

## Commercial lifecycle

| State | Access policy |
|---|---|
| `TRIAL` | Entitled operations within trial scope; tenant admin sees end date/remediation. |
| `ACTIVE` | Normal entitled access. |
| `PAYMENT_PENDING` | Preserve last reconciled access and show pending state. |
| `PAYMENT_FAILED` | Show remediation and attention; do not infer destructive lockout. |
| `PAST_DUE` | Do not infer immediate lockout; show billing attention while policy/reconciliation decides grace. |
| `GRACE` | Normal or risk-adjusted writes per approved policy; admin/export/remediation remain available. |
| `SUSPENDED` | Default business writes denied; safe reads, export, tenant admin, and billing remediation preserved unless a legal/security hold requires stricter policy. |
| `CANCELLED` | No new entitled writes after effective end; safe read/export/admin retention policy remains explicit. |

Provider outage, delayed webhook, pending payment, dispute, or uncertain outcome cannot by itself trigger destructive lockout. Atlas uses last authoritative reconciled state plus explicit attention/review.

## Plans, modules, and overrides

Plan versions may include Atlas Core, seat quantity, and module entitlements such as `FIREARMS_ATF`, `COATINGS`, `ADVANCED_CALENDAR`, and `AI_AUTOMATION`; these are stable keys only and do not implement modules. Add-ons and account-specific overrides are additive, effective-dated, reasoned, and audited. No prices are defined here.

## Administration planes

Tenant Admin manages its own users, memberships, seats within approved limits, entitled-module configuration, billing information/history, integrations, and workflows through tenant-scoped capabilities. Atlas Platform Admin uses distinct `PLATFORM_TENANT_*`, `PLATFORM_SUBSCRIPTION_*`, `PLATFORM_BILLING_*`, and `PLATFORM_ENTITLEMENT_MANAGE` capabilities. A tenant cannot grant itself platform capabilities, and platform billing access does not grant tenant-user impersonation.

## Mutation, audit, and recovery

Commercial mutations require explicit platform or tenant commercial context, tenant scope, stable operation identity, immutable intent, idempotency, durable recovery classification, authoritative actor, reason, prior/proposed values, and append-only commercial audit. Provider reconciliation uses a least-privileged system context and records provider event identity without impersonating a human.

## Portability and storage

Business services depend on explicit commercial repositories, never Sheet row numbers. A Sheets adapter may use additive stores; a future SQL adapter preserves the same IDs, states, ordering, bounds, idempotency, and error behavior. Tenant lists, details, seat summaries, entitlements, and recent audit are bounded.

## Decisions safely deferred

Actual plans/prices, payment provider, taxes, invoice/refund/cancellation rules, trial duration, grace duration, suspension write policy details, support-access commercial treatment, and whether future usage components are metered require Brendan/legal/accounting evidence. The domain stores configurable policy/state without inventing those answers, so none blocks MOS-123B code-level foundation.

No production resource changed and no provider was selected or activated.
