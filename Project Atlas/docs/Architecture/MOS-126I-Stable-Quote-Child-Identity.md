# MOS-126I — Stable Quote Child Identity

Status: implemented on MAIN at code level; production activation is separate.

## Identity contract

`QuoteLineItem`, `QuoteCostLine`, and `QuotePricingDecision` identities are immutable child identities, not row positions. Atlas allocates a new provider-neutral ID only when the request omits an ID for a genuinely new child. Existing draft children retain their IDs across edits and sequence changes. The server accepts a submitted child ID only when that active record is already present in the trusted Tenant and parent aggregate collection. Unknown, duplicate, removed, foreign-Tenant, and foreign-parent IDs fail safely.

Soft removal preserves the original row and ID as `REPLACED` or `REMOVED`. Those IDs are never reassigned to later children. Legacy ordinal IDs remain valid for their original logical records; MOS-126I does not rewrite them. New IDs use the `QLI-`, `QCL-`, and `QPD-` prefixes with the server-created security-operation identity plus the new-child position within that immutable request. The position is used only for first allocation; it never determines identity on later saves.

## Persistence and recovery

The Quote aggregate intent checkpoint stores the stable child ID and complete intended payload before child persistence. A safely retried, proven-not-completed operation regenerates the same operation-bound IDs and adopts its original checkpoint payload rather than creating new child identities or timestamps. Recovery continues to validate Tenant, operation, aggregate, actor, and child type, then repairs the exact stable child. Reorder or removal changes sequence/status only. A recovery operation cannot recreate a removed identity as another logical child, and an older operation cannot adopt a newer parent because aggregate recovery remains bound to the parent's security operation proof.

Source-document and provenance links therefore continue to identify the original logical customer or cost line. New source links reject soft-removed customer/cost-line targets; existing historical links retain their original immutable reference.

## Quote Builder and Vendor selection

The Quote Builder submits persisted customer-line, cost-line, and pricing-decision IDs. After a successful save it refreshes the local costing model with the authoritative returned IDs. A successor revision intentionally omits prior revision child IDs so that its new commercial snapshot receives new child identities.

Vendor relationships require an explicit bounded picker selection. Typed but unselected text fails validation instead of silently dropping the relationship. Reload hydrates Vendor names from one Tenant-scoped Vendor directory read. Missing/inactive historical references display `Vendor unavailable` while preserving the opaque canonical reference until the operator explicitly clears or replaces it.

## Performance and activation

Normal aggregate edits reuse the already-bounded parent child collections rather than issuing an existence lookup for every existing child. New-ID collision checks and durable checkpoint operations remain per new child because correctness and recovery proof take precedence. The current Sheets adapter still implements bounded repository projections over full-sheet reads; real Apps Script/Sheets timing remains an activation measurement.

No production Sheet, schema, credential, deployment, provider, or customer record is changed by this implementation. Existing additive MOS-126 stores and headers are unchanged.
