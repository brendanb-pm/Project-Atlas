# MOS-123B — Commercial domain foundation

Status: implemented in code and tests; additive production activation remains blocked.

## Authority planes

Atlas has two independent commercial administration planes. Platform operations require one of the dedicated `PLATFORM_*` capabilities declared in `ConfigCommercial.gs`; ordinary tenant `ADMIN_CONFIG` does not imply any platform capability. Tenant self-service operations derive `TenantID` from the authoritative Atlas request context and cannot select another tenant. Authentication, membership, capability authorization, subscription entitlement, and payment-provider authorization remain separate.

## Additive stores

The provider-neutral mappings define `AtlasTenants`, `AtlasPlanVersions`, `AtlasSubscriptions`, `AtlasEntitlements`, `AtlasSeatAssignments`, `AtlasTenantInvitations`, `AtlasInvoiceSnapshots`, and `AtlasCommercialAuditEvents`. They are proposed additive stores only; this story does not initialize or mutate a production workbook.

Plan versions preserve historical meaning. Subscriptions retain purchased-seat quantity, billing frequency/anchor/period, next-billing date, safe payment-method summary, payment state, and provider references. Invoice snapshots are immutable normalized billing facts and never contain raw credentials. Billing contacts and addresses are stored as bounded JSON values, not identity or authorization evidence.

## Seat and invitation policy

The initial billable metric is an active seat assignment for an active human Atlas user with active tenant membership. System, service, provider, kiosk, inactive-user, and inactive-membership identities do not consume a seat. The summary distinguishes plan cap, purchased seats, assigned/billable seats, availability, and overage.

A pending invitation does not consume a billable seat. Acceptance/activation requires an available purchased seat; absence of capacity becomes attention-required and never silently purchases a seat. Deactivation revokes future membership access and releases the assignment while preserving the Atlas User, ownership, and historical attribution. Active Follow-Ups, Jobs, approvals, and Customer ownership must be surfaced for reassignment before offboarding is completed by a future user-management workflow.

Seat changes require an explicit preview and confirmation. A tenant cannot reduce purchased seats below current assigned use or exceed the plan's self-service cap. Monetary impact and effective date remain `PROVIDER_*_REQUIRED` until an authoritative billing provider supplies them; Atlas does not guess price or proration.

## Commercial states and safe failure

The explicit states are `TRIAL`, `ACTIVE`, `PAYMENT_PENDING`, `PAYMENT_FAILED`, `PAST_DUE`, `GRACE`, `SUSPENDED`, and `CANCELLED`. A provider error or delayed event does not immediately destroy access. Suspension policy must separately govern writes, reads, billing administration, export, and support access, and preserve canonical data.

## Payment boundary

Only safe categories and display summaries may be stored: card, bank/ACH, PayPal, other wallet, and optionally provider-mediated crypto/stablecoin. Atlas stores no card numbers, CVV, bank credentials, PayPal credentials, wallets, private keys, or provider secrets. Availability is a future provider/country/currency/policy decision.

## Queries, audit, and recovery

Tenant search, tenant detail inputs, subscription, entitlement, seats, invitations, invoice history, and commercial audit are bounded to a default of 50 and hard cap of 200. Cross-tenant query capability exists only in the platform plane. Commercial changes use server-authoritative actor/correlation context, command identity, append-only commercial audit, and MOS-121 durable recovery/idempotency requirements. The minimal tenant-create path uses a preallocated TenantID and command-bound audit replay; remaining mutation endpoints are introduced only with an explicit recovery strategy.

## Activation boundary

Before production activation, create and review the additive headers, provision platform capabilities through trusted identity configuration, validate tenant isolation in ENFORCED mode, measure Apps Script/Sheets query performance, and complete MOS-123C–E. No pricing, processor, live subscription, payment method, webhook, or customer charge is activated here.
