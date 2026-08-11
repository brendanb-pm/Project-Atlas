# MOS-121 recovery proof ownership remediation

Release channel: MAIN

## Invariant

Automatic recovery may adopt a canonical mutation only when canonical, immutable evidence matches the security-operation ledger on all applicable dimensions: Security Operation ID, request fingerprint, Tenant ID, authoritative Actor ID, resource identity, and mutation strategy. Resource existence or desired-state equality alone is not proof. Missing or mismatched ownership proof produces `UNCERTAIN` / `REVIEW_REQUIRED`; Atlas neither reports completion nor blindly replays the mutation.

The specialized `FOLLOW_UP_DOMAIN_EVENT`, `IDEA_DOMAIN_EVENT`, and `SHOP_FLOOR_DOMAIN_EVENT` recovery contracts remain authoritative for their domains.

## Create proof

MVP entities, SalesActivities, ProcessTrials, PurchaseRequests, and CashReceipts persist these additive fields with the canonical create:

- `Security Operation ID`
- `Security Operation Fingerprint`
- `Security Tenant ID`
- `Security Actor ID`

The values originate in the server-created authorized execution context. Generic preallocated-resource and command recovery requires an exact match. Existing records without the fields cannot be automatically adopted and require review.

Sequential MVP and SalesActivity insertion uses a short adapter critical section that checks and inserts the allocated ID under the same lock. A competing operation receives a conflict; it cannot share the candidate identity. The lock covers local storage work only and is not held across provider calls.

## State transitions

Current quote, purchase, and cash-deposit lifecycle records do not yet persist an immutable operation marker for each transition. Their recovery classification is therefore `EXPLICIT_REVIEW`. Desired status/value equality cannot prove which operation performed the transition. This preserves safe uncertainty without changing the separate quote concurrency finding.

## Financial command ownership

Receipt command replay is accepted only when the canonical receipt's server-persisted operation fingerprint, tenant, and actor match and its immutable financial intent matches: command, invoice, customer, amount, payment method, received date, and reference number. Reusing a command for another actor or changed intent fails with a conflict and never rewrites or returns the earlier receipt as the new caller's result.

## Activation and compatibility

No production worksheet is changed by this commit. Before enabling ENFORCED writes, add the four headers above to the MVP, SalesActivities, ProcessTrials, CashReceipts, and PurchaseRequests mappings/stores. Configured mappings are augmented with these logical aliases so a missing header fails safely at the repository boundary.

`ATLAS_SECURITY_OPERATION_LEASE_SECONDS` remains unchanged: default 120 seconds, valid range 30 through 1,800 seconds. Historical attribution is not rewritten. Production deployment, identities, credentials, providers, and data are unchanged.

## Deferred findings

The calendar provider call under a global Script Lock, anonymously consumable pre-authentication abuse bucket, quote lifecycle concurrency/version race, in-flight membership/capability revocation window, and private QR revoke/use locking asymmetry remain outside this remediation. Independent MOS-121H security validation remains required before MOS-121 can be declared complete.
