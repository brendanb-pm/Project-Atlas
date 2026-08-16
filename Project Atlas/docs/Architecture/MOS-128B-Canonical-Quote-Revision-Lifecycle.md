# MOS-128B — Canonical Quote Revision Lifecycle

Status: implemented on MAIN at code level; production activation remains separate.

The normal Quotes journey has one lifecycle: editable draft `QuoteRevision` → immutable issued revision → exact-revision acceptance → Job / Work Order carrying `acceptedQuoteRevisionId`. The bounded `?route=quotes` directory opens selected records in `?route=quote-builder&quoteId=…`; Customer, RFQ, related-record, reload, and deep-link paths use the same destination. Quote Builder displays human-readable revision status and bounded revision history, owns issue, acceptance, successor-revision, customer-output, and accepted-revision-to-Job actions, and refreshes authoritative state after uncertain lifecycle results.

The historical callable names `approveQuote`, `issueQuote`, and `acceptQuote` remain classified only so older clients receive a safe, auditable error. They cannot mutate root Quote lifecycle state and are not rendered by routine navigation. Internal approval is not inferred from root Quote status; any future internal approval gate must bind to an exact revision under a separate approved story.

`issueQuoteRevision` and `acceptQuoteRevision` remain the only customer lifecycle mutations. `QuoteRevisionService_` validates Tenant and revision identity, enforces version and lifecycle eligibility, preserves immutable issued content, records operation-bound transition proof, and converges the Quote root summary on replay. Quote-to-Job conversion remains idempotent and requires the root's exact `acceptedRevisionId`, which is persisted as `acceptedQuoteRevisionId` on the Job.

No production schema, record, deployment, credential, or provider configuration is changed by MOS-128B.
