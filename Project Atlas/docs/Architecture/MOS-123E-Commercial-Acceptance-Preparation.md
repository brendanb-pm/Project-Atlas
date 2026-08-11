# MOS-123E — Commercial management acceptance preparation

Status: acceptance framework complete; live billing and production commercial activation are **NOT READY**.

## Evidence matrix

| Dimension | Status | Current evidence | Evidence still required |
|---|---|---|---|
| Tenant isolation | PARTIAL | Tenant-scoped domain services and cross-tenant platform capability tests | ENFORCED non-production identity/workbook validation with multiple real test tenants |
| Platform-admin separation | PASS (code-level) | Tenant `ADMIN_CONFIG` denied; `PLATFORM_TENANT_READ` controls route and endpoint | Provision and validate real platform identities without tenant impersonation |
| Subscription lifecycle | PARTIAL | Explicit provider-neutral states and fake event transitions | Approved dunning, suspension, cancellation, retention, and reactivation policies |
| Plan versioning | PASS (contract) | Immutable PlanVersionID reference and effective/retired fields | Operational publishing/retirement workflow and migration rehearsal |
| Module entitlements | PASS (contract) | Stable product/module/seat keys and entitlement decisions | Tenant-admin self-service activation policy and real module acceptance |
| Seat metering | PASS (local) | Purchased/assigned/available/overage and excluded-identity tests | Real Sheets measurements and tenant-admin user/seat rendered workflows |
| Invitations/offboarding | PARTIAL | Additive invitation model and non-billable pending policy documented | Identity-adapter invite/resend/cancel, activation capacity gate, reassignment workflow |
| Commercial audit/recovery | PARTIAL | Authoritative actor, command replay, provider system audit, MOS-121 contract | Failure injection for every future commercial mutation endpoint on Apps Script/Sheets |
| Provider abstraction/replay | PASS (fake adapter) | Signature boundary, event replay, ordering, wrong-correlation, outage/review tests | Selected provider sandbox and verified webhook/reconciliation exercises |
| Billing information/history | PARTIAL | Safe payment summaries and immutable invoice snapshot schema | Provider sandbox invoice/payment-method retrieval and tenant-admin rendered UX |
| Billing failure UX | PARTIAL | Platform attention labels and non-destructive state policy | Tenant remediation screens, recovery copy, support runbook, rendered tests |
| Platform console UX | PARTIAL | Bounded synthetic workspace and 1280×720 rendered inspection | Required 1440×900, 1024×768, 768×1024 rendered/accessibility acceptance |
| Tenant Admin UX | NOT PERFORMED | Information architecture only | Account, Users, Seats, Modules, Billing Information, Billing History implementation and rendered QA |
| Performance | PARTIAL | Bounded result models; no browser all-history payload | Apps Script/Sheets timings, row/read counts, provider latency, long-history payload measurements |
| Security | PARTIAL | Capability separation, safe errors, no-secret tests, trusted provider system context | Independent adversarial review after all commercial mutation/UI endpoints exist |
| Data portability | NOT PERFORMED | Tenant IDs and provider-neutral repositories | Export format, retention/closure policy, tested tenant-scoped export |

## Acceptance workflows

Independent acceptance must exercise both planes without sharing authority:

1. Platform owner searches a bounded tenant list; inspects plan, purchased/in-use/available seats, modules, billing cycle, payment attention, trial, and recent changes; then drills into one tenant without becoming its user.
2. Tenant Admin sees only its TenantID and understands Account/Subscription, Users, Seats, Modules, Billing Information, and Billing History in business language.
3. Invitation does not consume a seat; acceptance consumes an available purchased seat; no capacity produces attention instead of an automatic purchase.
4. Deactivation revokes future access, releases the seat, preserves actor/history, and surfaces active work requiring reassignment.
5. Seat/module/subscription change presents current and proposed values, effective date, provider-authoritative proration/next-bill effect, confirmation, and audit. Missing price data is labeled unavailable rather than guessed.
6. Duplicate, delayed, out-of-order, wrong-tenant, and unavailable-provider events remain idempotent and recoverable without destructive lockout.
7. Payment failure progresses only under approved `PAYMENT_PENDING` / `PAYMENT_FAILED` / `PAST_DUE` / `GRACE` / `SUSPENDED` policy, preserving data and explicit billing-admin/export/support behavior.
8. Invoice history displays immutable period, seats, modules, authoritative amounts/status, safe payment category, and provider reference without exposing credentials.

## Required device and evidence separation

Platform console acceptance: 1440×900, 1024×768, and 768×1024. Tenant Admin acceptance also includes 390×844 where billing/user triage is supported. Evidence must distinguish code-level contracts, actual rendered screenshots/keyboard/accessibility inspection, local synthetic timings, Apps Script/Sheets timings, fake-provider behavior, and real provider sandbox behavior. Unit tests alone cannot produce rendered or runtime-performance PASS.

## Live billing blockers and Brendan decisions

The following remain required before accepting real customer money:

- final plans, prices, currencies, trial/grace terms, self-service seat limits, and negotiated-account rules;
- legal commercial terms, privacy notice, data-processing requirements, tax treatment, invoices, refunds, cancellation, disputes, retention/export, and account-closure policy;
- payment provider selection and supported countries/currencies/methods (including whether PayPal or provider-mediated crypto/stablecoin is offered);
- provider account, production domain, secret management/rotation, webhook signature verification, reconciliation schedule, and incident/support runbook;
- approved suspension matrix for writes, essential reads, billing administration, export, and support access;
- invitation identity adapter, allowed tenant role-assignment policy, seat-change authorization, and offboarding reassignment behavior;
- support-access authorization, time bounds, audit, and prohibition on silent impersonation;
- actual Apps Script/Sheets performance evidence and complete independent security/rendered acceptance.

These are genuine unresolved product, legal, accounting, operational, or activation decisions; no additional decisions are manufactured.

## Production gate

Current code must not be represented as billing production-ready. Production requires all matrix blockers resolved, additive schema reviewed and activated in a non-production workbook first, approved provider sandbox PASS, independent security PASS, rendered/accessibility PASS, performance evidence, rollback/reconciliation runbooks, and explicit Brendan approval. Architecture work does not establish PCI, SOC 2, ISO/IEC 27001, ISO 9001, tax, privacy, or legal compliance.

No pricing, live subscription, customer charge, real payment information, provider credential, webhook, PayPal/crypto integration, tax calculation, production schema, deployment, or production resource was created or changed by MOS-123A–E.
