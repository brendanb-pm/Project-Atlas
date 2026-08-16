# MOS-126H — Quote security, recovery, and V1 output remediation

## Scope and invariant

MOS-126H remediates the seven HIGH findings from MOS-126G without changing the Quote lifecycle root. Client identifiers remain references only. The server resolves every Quote, revision, Quote line, Vendor, source document, estimate, and cost-line relationship inside the trusted tenant before persistence.

Multi-record Quote mutations use an operation-bound aggregate contract:

1. preallocate the aggregate and deterministic child identities;
2. persist one `QuoteMutationCheckpoint` intent per child, bound to TenantID, Security Operation ID, aggregate identity, authoritative actor, and complete child payload;
3. persist the parent and checkpoint canonical completion in the MOS-121 ledger;
4. persist children idempotently and mark their intents completed;
5. on recovery, require the parent operation proof and tenant match, load only checkpoints belonging to that operation/aggregate, and repair only missing or matching children.

This avoids the 4,000-character ledger recovery-context limit and prevents a foreign child from being adopted. Conflicting child ownership, invalid context, or insufficient proof enters the existing uncertain/review path. Recovery does not recreate the parent.

## Lifecycle convergence

Issue and acceptance checkpoint the authoritative revision transition before updating the Quote root. A replay of an already-issued or accepted revision converges the root instead of repeating the revision transition. Recovery requires tenant match plus the original authoritative `issuedBy` or `acceptedBy` attribution. The recovery actor is recorded separately by the security ledger.

## Costing and UI

- Hourly cost preserves rate × hours × quantity precision and rounds once at the final minor-unit boundary. Display cost-each is non-authoritative.
- Quote Builder saves customer draft and internal costing through their canonical services, persists pricing decisions, supports bounded Vendor selection, reloads saved costing, and preserves entries when costing confirmation fails.
- Issued revisions remain immutable. `Create new revision` derives the visible prior commercial values but clears the immutable revision identity before save.
- Lifecycle actions disable during consequential requests. Zero-quantity customer lines are rejected.
- Customer print includes issue date, valid-through date, terms, notes, one-time lines, and totals. Popup failure returns a stable actionable state. PDF storage and email delivery remain outside MOS-126H.

## Additive persistence

New store: `QuoteMutationCheckpoints`.

Headers: `QuoteMutationCheckpointID`, `TenantID`, `Security Operation ID`, `Aggregate Type`, `Aggregate ID`, `Resource Type`, `Resource ID`, `Payload JSON`, `Status`, `Created At`, `Created By`, `Completed At`, `Completed By`.

Additive headers: `Status` and security-operation proof fields on Quote costing child records where absent. No production workbook is mutated automatically; deployment activation must add the store/headers through the approved schema process before enabling these mutations.

## Performance and activation

The contract adds one checkpoint create and one completion update per aggregate child. Recovery uses a tenant- and operation-scoped bounded lookup (maximum 200 records) and the existing narrow recovery lock. Vendor selection remains bounded to 25 results. No `getMvpBootstrap`, browser-global directory, provider call, or new broad lock is introduced.

Real Apps Script/Sheets latency and concurrent recovery still require controlled activation testing. Full-sheet behavior below repository adapters remains existing debt.
