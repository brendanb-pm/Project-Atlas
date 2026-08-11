# MOS-123D — Billing-provider abstraction and reconciliation

Status: provider-neutral contract and fake-adapter tests complete; no provider selected or activated.

## Authority boundary

Atlas owns TenantID, Atlas User/membership/capabilities, module identity, entitlement policy, access state, and commercial audit. A billing adapter owns only verified payment facts, provider customer/subscription/invoice references, provider billing periods, authoritative amounts, and provider event identity. Provider accounts, calendar connections, payment-method identities, and webhook payloads never authenticate an Atlas user.

The narrow gateway verifies an inbound envelope, correlates it to an existing Atlas subscription, normalizes provider-owned facts, retrieves provider subscription state, and previews a requested subscription change. Raw provider payloads and credentials are not persisted. A public callback is not exposed by this story.

## Event and replay contract

Future callbacks must verify the provider signature before durable processing. `(Provider Key, Provider Event ID)` is the replay identity; duplicate delivery returns the prior result. Correlation requires matching tenant, Atlas SubscriptionID, provider key, and provider subscription reference. Out-of-order sequence values are recorded and ignored. Wrong-tenant or unknown correlation fails safely.

`AtlasBillingProviderEvents` stores safe identifiers, timestamps, signature/processing status, payload fingerprint, attempts, and bounded error context. `AtlasBillingReconciliation` records drift or uncertainty without embedding credentials. Both are additive proposed stores; no production worksheet is created.

## Safe failure and dunning

Normalized states include `PAYMENT_PENDING`, `PAYMENT_FAILED`, `PAST_DUE`, `GRACE`, `SUSPENDED`, `CANCELLED`, and `ACTIVE`. Provider outage, uncertain outcome, delayed webhook, or reconciliation drift enters `REVIEW_REQUIRED`; it does not blindly revoke access. Duplicate and out-of-order events do not repeat mutation. External cancellation, dispute, and refund handling remain policy inputs and are not invented here.

Suspension is non-destructive. A future approved policy must separately define normal writes, essential reads, billing administration, export, and time-bound audited support access. Provider recovery updates commercial state through least-privileged trusted system context and records a system-attributed commercial audit event.

## Payment methods and invoices

The domain supports safe categories (`CARD`, `BANK_ACH`, `PAYPAL`, `OTHER_WALLET`, optional provider-mediated `CRYPTO_STABLECOIN`) without selecting availability. Atlas never stores card numbers, CVV, bank credentials, PayPal credentials, wallet private keys, or API secrets. Invoice history is an immutable normalized snapshot/reference, including billing period, seats, modules, authoritative amounts/tax if supplied, payment state/date/category, and provider invoice reference.

Subscription-change previews must come from a future provider adapter and show current/proposed plan, seats/modules, effective date, proration behavior, and next-bill effect. Atlas must label monetary impact unavailable when the provider has not supplied authoritative numbers.

## Activation requirements

Production activation requires provider selection, approved pricing/terms/tax/refund policy, provider account and secret management, verified public callback endpoint, key rotation, event retention, reconciliation runbook, failure-support workflow, non-production replay/out-of-order/outage validation, and MOS-123E acceptance. PayPal and crypto remain future optional adapters; no account, webhook, credential, product, price, wallet, or charge was created.
