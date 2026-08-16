# MOS-126F — Customer Quote output and lifecycle

## Decision

Atlas separates mutable internal Quote preparation from the customer commitment:

`Quote root → DRAFT QuoteRevision + QuoteLineItems → immutable ISSUED revision → exact revision ACCEPTED → Job`

The Quote root remains the commercial workflow root used by MOS-122F-R. `issuedRevisionId` and `acceptedRevisionId` bind that root, and a created Job stores `acceptedQuoteRevisionId`. Existing Quotes require additive activation before the revision-aware issue/accept path is writable.

## Canonical stores

`QuoteRevisions` stores tenant, Quote/RFQ/Customer references, revision number, lifecycle state, customer snapshot, exact minor-unit totals, terms, issue/accept timestamps and authoritative actors, version, and MOS-121 operation proof. `QuoteLineItems` stores tenant, revision, sequence, type, description, exact decimal quantity, exact minor-unit unit/extended prices, lifecycle status, version, and operation proof.

The existing Quotes mapping adds Current/Issued/Accepted Quote Revision ID. Jobs adds Accepted Quote Revision ID. These are additive headers only; this story does not initialize or mutate a live workbook.

## Lifecycle

- DRAFT is editable with optimistic versioning. Saving after issue is rejected.
- ISSUE validates a current draft and customer lines, marks the selected snapshot ISSUED, supersedes a prior issued revision, and updates the Quote root. Repeating an established issue is idempotent; uncertain responses require authoritative refresh.
- ACCEPT requires the exact current ISSUED revision and version. Draft or superseded revisions are rejected. The accepted revision is recorded on the Quote root.
- Quote-to-Job conversion requires an accepted root with `acceptedRevisionId`, writes that ID to the Job, and preserves the existing replay-safe one-Job-per-Quote behavior.
- EXPIRED and VOIDED are recognized output states but no new expiry/void policy was invented. Automated expiration and cancellation policy remain deferred.

Issue and acceptance use the MOS-121 EXPLICIT_REVIEW recovery strategy: conflicts and uncertain transport outcomes refresh canonical revision state before retry; the browser does not blindly replay. Draft creation uses a preallocated revision identity.

## Customer privacy boundary

`QuoteRevisionService_.output` is the allow-list. It returns only Quote number, revision, status, customer snapshot, description, currency, dates, customer terms/notes, customer totals, and customer line description/quantity/unit/extended price/type. It never reads or returns QuoteCostEstimate, QuoteCostLine, Vendor, margin/contribution, purchasing, internal notes, source documents, or security/recovery fields. Browser-requested field names are ignored because the server owns the projection.

MOS-126E source links remain internal provenance. `CUSTOMER_APPROVED` remains metadata classification; this story does not automatically embed a source document in customer output.

## Output strategy

Quote Builder provides an explicit Customer Preview and an issued-revision printable HTML document with print CSS. This is PDF-compatible through the browser print path, but Atlas does not yet have canonical PDF binary generation, immutable file storage, document delivery, or email delivery. Those remain delivery capabilities, not reasons to weaken the snapshot boundary.

## VMC-0128 fixture

The regression fixture represents 18 H2 plate assemblies at 69,474 minor units each with zero NRE. The authoritative recurring and total values are both 1,250,532 minor units ($12,505.32). The customer projection contains none of OnlineMetals, supplier totals, allocated material, estimated recurring cost, contribution, internal operation/welding/coating costs, or private workbook provenance. No VMC-0128 production record is created.

## Human factors and performance

FIXED: Quote, RFQ, Customer, source, and related-record selection is contextual; lifecycle actions operate on the loaded revision; operators do not enter internal revision IDs. FIXED: the Builder visibly separates Customer pricing, Internal costing, Sources, Customer preview, and Lifecycle. JUSTIFIED POWER-USER INPUT: customer-facing description, quantity, price, NRE, terms, and validity are commercial inputs. DEFERRED: document upload/storage because no safe canonical binary store exists.

Reads are bounded to 100 revisions/lines and use tenant-scoped repositories. Quote Builder does not call `getMvpBootstrap`, does not request a global browser directory, and does not join cost/source data into customer output. The Sheets adapters may still scan backing tabs internally; real Apps Script/Sheets latency remains an activation measurement.

## Activation and rollback

Activation requires additive sheets/headers, ENFORCED MOS-121 identity/capability mode, and controlled migration of existing issued Quotes to a reviewed revision—not fabricated history. Rollback disables the new UI/endpoints while retaining revision rows. Never delete issued snapshots. Live PDF/storage/email, live rendering, and controlled Apps Script timing remain acceptance debt.
