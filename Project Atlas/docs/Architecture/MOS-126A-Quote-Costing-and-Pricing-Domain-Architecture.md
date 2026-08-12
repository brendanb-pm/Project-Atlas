# MOS-126A — Quote Costing and Pricing Domain Architecture

**Release channel:** MAIN

**Inspected baseline:** `02f00302cf93fc99ec8ea4ecf136032185b637e2`

**Status:** Architecture only; no executable behavior or production schema changed.

## 1. Current-state audit

Atlas currently has five partially overlapping quote representations:

- `Quote` in `VMOS_DEFAULT_MAPPING` is the canonical commercial record linked to RFQ and Customer. It stores aggregate `subtotal`, `nre`, `tooling`, `material`, `outsideServices`, `shipping`, `tax`, and `total`, but has no durable customer-line versus internal-cost boundary.
- `QuotePreparationService_` constructs a single customer line with quantity, unit price, and NRE using JavaScript `Number`; it calculates totals in binary floating point and creates a Quote only on issue.
- `QuoteRevisionService_` defines additive revision and customer line headers and protects issued revisions from ordinary editing. Approval and issuance are distinct lifecycle steps, but line calculations also use `Number` and revisions do not persist internal cost estimates.
- `CommercialWorkflowService_` supplies the bounded, tenant-scoped Customer → RFQ → Quote → Job → Invoice context. It projects only safe Quote totals and lifecycle fields, not costing detail.
- `QuotePreparation.html` and `QuoteTemplate.html` are legacy/static prototypes. The template contains deployment-specific branding and multiplication in presentation code; neither is the future production architecture.

Related state:

- Jobs reference Quote, Customer, Part ID, quantity, legacy material cost, hours, NRE/tooling recovery, and gross margin fields. These are not a complete quote-cost model and must not become the Quote estimate source of truth.
- RFQ intake can stage part, supplier classification, documents, and document-part associations, but does not establish canonical costing or Vendor records.
- Purchase Requests store a free-text Vendor, requested amount, optional actual purchase amount, approval state, and receipt reference. An estimate is not a Purchase Request and receipt data is not quote actual cost.
- Invoices derive from accepted Quote/Job context and contain customer billing totals. They must not receive internal supplier cost or margin metadata.
- MOS-120 defines bounded Document queries by Job/Part/RFQ/Quote where the configured mapping supports the relationship. Current MAIN does not provide a universal production document-link store for all of those associations.
- No canonical Vendor/Supplier master exists. No quote-cost, supplier-summary, pricing-decision, or estimate-to-purchase link store exists.

Compatibility constraints are issued-revision immutability, Quote approval/issue capabilities, customer acceptance before Job conversion, tenant-scoped commercial reads, authoritative audit identity, MOS-121 recovery classifications, and existing Quote/RFQ/Job/Invoice IDs.

## 2. Domain problem and boundary

A Quote answers two different questions:

1. **What is offered to the customer?** Customer-facing scope, quantity, recurring unit/extended price, one-time price, terms, validity, and total.
2. **What does Atlas estimate it will cost and why?** Internal material, labor, supplier, freight, tax, outside-process, tooling, and other estimates with their source and cost basis.

Those questions share a Quote Revision but not a projection. The architecture is:

```text
RFQ → Quote → Quote Revision
                 ├─ Customer Quote Lines → customer document / acceptance
                 ├─ Quote Cost Estimate → Internal Cost Lines
                 │                         └─ Vendor + source documents
                 └─ Pricing Decisions → customer line prices

Internal estimate ──explicit future command──> Purchase Request
Purchase/receipt ──explicit later reconciliation──> Actual Job Cost
```

Screens and documents consume purpose-built read models. They never become a source of truth and never join arbitrary browser-supplied records.

## 3. Canonical record model

### Quote and Quote Revision

The existing Quote remains the lifecycle/root record. An immutable issued `QuoteRevision` is the customer offer snapshot. A draft revision may be replaced through normal optimistic versioning; an issued revision is superseded by a new revision, never rewritten.

### Customer Quote Line

A customer-visible line belongs to exactly one Quote Revision and contains:

- stable `QuoteLineID`, `TenantID`, `QuoteRevisionID`, optional `PartID`;
- line sequence, type (`RECURRING`, `ONE_TIME_NRE`, or `INFORMATIONAL`);
- customer description, quantity, unit-of-measure;
- recurring unit price, recurring extended price, or one-time price;
- visibility `CUSTOMER` and lifecycle/audit metadata.

It does not contain Vendor ID, supplier cost, internal rate, markup, margin, cost source, or internal notes.

### Quote Cost Estimate

An internal versioned estimate belongs to one Quote Revision. It defines currency, estimate status (`DRAFT`, `READY_FOR_REVIEW`, `APPROVED`, `SUPERSEDED`), rollup version, totals, and audit context. Approval freezes the estimate version used for a pricing decision; editing creates a new version.

### Internal Cost Line

Each cost line records one explicit cost fact or calculation. It belongs to a Quote Cost Estimate and may reference a customer Quote Line, Part, Vendor, and source document. It records category, basis, quantity/rate inputs, authoritative extended cost, inclusion behavior, purpose, and audit/version metadata.

`Purpose` is one of:

- `INTERNAL_COST_DETAIL` — eligible for internal rollup;
- `SUPPLIER_SUMMARY` — display/reconciliation only and never a customer projection;
- `INTERNAL_NOTE` — non-financial context and never rolled up.

### Pricing Decision

A pricing decision links an internal estimate or selected cost lines to a Customer Quote Line. It records the authoritative sell price and optional rationale/method:

- `MANUAL_PRICE`
- `MARKUP_PERCENT`
- `MARKUP_AMOUNT`
- `TARGET_CONTRIBUTION`
- `CUSTOMER_AGREEMENT`

The sell price is authoritative even when a markup method helped calculate it. Atlas must not reverse-engineer or require a markup percentage where pricing was entered directly.

### Supplier Summary

A supplier summary is an Internal Cost Line with:

- `Purpose = SUPPLIER_SUMMARY`
- `SummaryOnly = true`
- `IncludeInCostRollup = false`
- optional `SummaryGroupKey` shared by the detail lines it reconciles.

The summary total may be checked against its detail group but never added to it.

## 4. Customer versus internal boundary

Customer output is an allow-listed projection of Quote, issued Quote Revision, Customer Quote Lines, customer terms, approved customer-visible documents, and customer-safe identity/branding. It excludes all fields from Quote Cost Estimate, Internal Cost Line, Pricing Decision rationale, Vendor estimate details, and internal source documents unless a future explicit sharing workflow creates a separate customer-safe document association.

The following are always internal by default: supplier cost, internal labor/rates, markup, margin/contribution, supplier estimate, internal notes, purchase planning, cost confidence, and reconciliation differences. A generic serializer must not decide visibility from whether a field happens to be populated; projection purpose is explicit.

## 5. Cost-basis model

The smallest model supporting the required cases is an explicit `CostBasis` plus typed operands:

| Cost basis | Required operands | Authoritative extended-cost rule |
|---|---|---|
| `PER_PART` | quote quantity, cost per part | quantity × per-part cost |
| `BATCH_TOTAL` | source batch total; allocation quantity for display | source batch total; allocation is derived only |
| `ONE_TIME` | one-time amount | one-time amount |
| `HOURLY_PER_PART` | quote quantity, hours per part, hourly rate | quantity × hours per part × rate |
| `QUANTITY_BASED` | priced quantity, unit cost, unit-of-measure | priced quantity × unit cost |

Basis is mandatory for a financial cost line. Populated fields never imply basis. Irrelevant operands remain empty and validation rejects contradictory input. `QUANTITY_BASED` covers material sold by foot, pound, each, lot fraction, or another explicit unit without inventing a full unit-conversion engine in MOS-126A.

Cost category is independent of basis: `MATERIAL`, `FREIGHT`, `SUPPLIER_TAX`, `INTERNAL_LABOR`, `OUTSIDE_PROCESS`, `TOOLING`, `ENGINEERING`, `PROGRAMMING`, `SETUP`, `LOGISTICS`, or `OTHER`.

## 6. Decimal and currency precision

- Every monetary record carries an ISO currency code. Cross-currency rollup is prohibited until an explicit conversion record/policy exists.
- Authoritative currency amounts are persisted as decimal strings and, where the currency has a fixed minor-unit scale, an exact integer minor-unit string. JavaScript binary floating point is not authoritative.
- Quantities, hours, and rates are canonical normalized decimal strings with documented scale; arithmetic uses a decimal/rational implementation in the future service layer.
- Source batch total is authoritative. Allocation retains the exact relationship `source amount ÷ allocation quantity`; the displayed per-unit amount may be currency-rounded but is not multiplied back to reconstruct the rollup.
- Each line persists or can deterministically reproduce its authoritative extended amount. Rollups add authoritative extended minor units and round only at a documented boundary.
- Customer unit price and extended price must reconcile under an explicit currency rounding rule. Tax policy remains out of scope.
- Display formatting never mutates stored values. Exports state currency and displayed rounding.

## 7. Rollup and reconciliation rules

For one approved estimate version:

1. Select only `INTERNAL_COST_DETAIL` lines with `IncludeInCostRollup = true`.
2. Exclude `SUPPLIER_SUMMARY`, `INTERNAL_NOTE`, cancelled, superseded, and other-estimate-version lines.
3. Classify `ONE_TIME` lines into one-time estimated cost; all other included bases into recurring estimated cost unless the line explicitly carries `CostTiming = ONE_TIME`.
4. Add authoritative extended amounts, never rounded display allocations.
5. Reconcile each supplier summary to detail lines sharing Tenant, estimate version, Vendor ID, currency, and summary group. A mismatch produces review attention; it does not silently alter details.
6. Calculate customer recurring extended price from authoritative customer price rules, add customer one-time/NRE price, then approved shipping/tax only where the future quote policy explicitly places them.
7. Estimated contribution is `Total Customer Price − Total Estimated Cost`. Contribution percentage and markup percentage are derived analytics, not interchangeable stored facts. Negative or missing results remain visible rather than coerced.

An estimate cannot roll up actual Purchase/Receipt values. Later estimate-versus-actual reporting joins immutable references and labels both sides.

## 8. NRE and tooling

One-time customer price and one-time internal cost are separate:

- Customer Quote Line type `ONE_TIME_NRE` represents what the customer is charged for fixture, programming, tooling, engineering, setup, or other one-time scope.
- Internal Cost Line with `CostTiming = ONE_TIME` represents Atlas's estimated one-time cost.

They may be linked by a Pricing Decision, but neither copies or overwrites the other. A zero customer NRE does not imply zero internal tooling cost. Recurring recovery of tooling is a pricing policy and must be represented as a customer recurring price decision, not by relabeling internal one-time cost.

## 9. Estimate versus purchasing and actuals

Quote costing is planning data. It never creates a Purchase Request, purchase approval, receipt, inventory, AP invoice, payment, or actual Job cost implicitly.

A future explicit command may propose a Purchase Request from selected approved estimate lines. It must:

- require `PURCHASE_REQUEST` plus access to the internal estimate;
- resolve Vendor and Job/Quote context server-side;
- show an operator confirmation preview;
- create a new Purchase Request with its own identity, approval lifecycle, operation proof, and audit context;
- persist a link from Purchase Request to estimate/line IDs without converting the estimate into an actual;
- be idempotent and never treat supplier-cart or estimate identity as a receipt.

Actual purchase/receipt cost remains authoritative in purchasing/receipt records and later Job-cost records. Variance is a read-model calculation between immutable referenced facts.

## 10. Vendor relationship

`VendorID` is the only future master reference used by Quote cost detail, summaries, source-document links, Purchase Requests, and later purchasing. MOS-126A does not implement the Vendor master or create competing supplier tables.

The future Vendor record may support multiple categories: `MATERIAL_SUPPLIER`, `TOOLING_SUPPLIER`, `WELDING_FABRICATION`, `COATING_FINISHING`, `OUTSIDE_PROCESSING`, `LOGISTICS`, and `OTHER_SERVICE`. Categories describe capabilities; they are not separate masters. Cost lines may retain an immutable supplier display snapshot for issued-estimate audit while VendorID remains the relationship.

Free-text legacy purchase Vendor values require controlled matching/review before association. They are never automatically merged into a Vendor master.

## 11. Source-document relationship

A provider-neutral `QuoteSourceDocumentLink` associates an existing Document reference with one or more supported contexts without duplicating the document:

- Tenant, Document ID, relationship type;
- Quote, Quote Revision, Quote Line, Quote Cost Estimate, Quote Cost Line;
- optional RFQ, Part, Vendor, and later Job IDs;
- purpose (`CUSTOMER_RFQ`, `DRAWING`, `SCOPE`, `SUPPLIER_ESTIMATE`, `SUPPLIER_CART`, `WORKBOOK`, `CUSTOMER_QUOTE_OUTPUT`, `OTHER`);
- visibility (`INTERNAL`, `CUSTOMER_APPROVED`), immutable fingerprint/version reference where available, and audit metadata.

Every populated relationship is validated server-side within the same Tenant. A link does not change document ownership or make an internal supplier source customer-visible. Raw Drive/Sheet identifiers are not business-domain IDs or normal UI content.

## 12. Authorization and visibility

Existing `RFQ_READ/WRITE`, `QUOTE_WRITE`, `QUOTE_APPROVE`, and `QUOTE_ISSUE` remain lifecycle capabilities. Proposed coherent additions are:

- `QUOTE_COST_READ` — internal cost detail and supplier-source visibility;
- `QUOTE_COST_WRITE` — draft estimate/cost-line mutation;
- `QUOTE_PRICING_MANAGE` — pricing decision and markup rationale;
- `QUOTE_MARGIN_READ` — contribution/margin visibility.

Roles may bundle these later; services check capabilities, not role names. Customer quote reads do not imply internal-cost access. Supplier costing does not imply Purchase approval. Every query is tenant-scoped from trusted context, every mutation receives immutable AuditContext, and every customer projection uses a separate allow list. Client-supplied Tenant, actor, Vendor, price authority, visibility, or approval state is never authoritative.

## 13. Recovery, idempotency, and concurrency

- Create IDs are server-preallocated and operation-bound under the MOS-121 security-operation ledger.
- Draft line changes use Quote Revision/Estimate version and expected row version. Concurrent updates conflict rather than overwrite.
- Approval/issue commands use idempotency keys and immutable operation proof. Issuance freezes the referenced customer lines and approved estimate/pricing snapshot.
- Multi-record save (`estimate + lines + pricing`) uses deterministic child IDs and a durable checkpoint/outbox strategy; partial completion enters recovery/review and never issues a partially reconstructed customer quote.
- Recovery proves Tenant, operation, actor, resource IDs, version, and immutable intent. It never declares completion from matching totals alone.
- Supplier summary reconciliation is repeatable and side-effect free. Estimate-to-Purchase proposal commands create no duplicates on retry.

## 14. Bounded read-model expectations

Future Quote Builder reads are purpose-built:

- selected Quote/Revision and at most the requested page of customer lines;
- selected approved/draft estimate, at most 50 cost lines per page and a hard cap of 200 unless documented;
- precomputed/reconciled totals and supplier summaries, not all cost history;
- searchable Customer, eligible RFQ, Part, Vendor, Job, and Document selectors returning human-readable labels, stable IDs, and at most 50 results by default;
- Vendor data fetched by IDs in one batch, never one lookup per cost line;
- history paged newest-first; source documents requested for the selected context only.

The browser never receives all Quotes, Vendors, RFQs, or cost history to implement local filtering. Repository contracts remain provider-neutral. A Sheets adapter may initially scan internally, but MOS-119 instrumentation must report calls, rows examined, bytes, and duration so bounded/index strategies can be justified later.

## 15. Operator-memory UX implications

Future selectors show business context rather than raw-ID fields:

- Customer: name plus safe location/account context;
- RFQ: customer RFQ number, description, received/due date, and status; only eligible tenant RFQs;
- Part: part number, revision, description;
- Vendor: display name, category, active status;
- Job: Work Order number, customer, part, status;
- Document: filename/title, purpose, revision/date, related record.

Stable IDs may be visible as secondary references but are never required to be memorized or manually transcribed when Atlas already knows the relationship. Contextual creation carries Customer/RFQ/Quote identifiers server-side and validates them again on mutation.

## 16. Proposed additive persistence

No production schema is changed by MOS-126A. Proposed stores and exact initial headers are:

### `QuoteRevisions` additions

Existing revision headers plus: `TenantID`, `Currency`, `Version`, `Approved Cost Estimate ID`, `Pricing Snapshot Version`, `Security Operation ID`, `Security Operation Fingerprint`, `Security Actor ID`, `Updated At`, `Updated By`.

### `QuoteLineItems` additions

`QuoteLineItemID`, `TenantID`, `QuoteRevisionID`, `PartID`, `Sequence`, `Line Type`, `Description`, `Quantity Decimal`, `Unit Of Measure`, `Currency`, `Recurring Unit Price Minor`, `Recurring Extended Price Minor`, `One-Time Price Minor`, `Visibility`, `Version`, `Created At`, `Created By`, `Updated At`, `Updated By`, `Security Operation ID`, `Security Operation Fingerprint`, `Security Actor ID`.

### `QuoteCostEstimates`

`QuoteCostEstimateID`, `TenantID`, `QuoteID`, `QuoteRevisionID`, `Estimate Version`, `Status`, `Currency`, `Recurring Estimated Cost Minor`, `One-Time Estimated Cost Minor`, `Total Estimated Cost Minor`, `Rollup Version`, `Approved At`, `Approved By`, `Version`, `Created At`, `Created By`, `Updated At`, `Updated By`, `Security Operation ID`, `Security Operation Fingerprint`, `Security Actor ID`.

### `QuoteCostLines`

`QuoteCostLineID`, `TenantID`, `QuoteCostEstimateID`, `QuoteLineItemID`, `PartID`, `VendorID`, `Sequence`, `Purpose`, `Category`, `Description`, `Cost Basis`, `Cost Timing`, `Quantity Decimal`, `Unit Of Measure`, `Hours Per Part Decimal`, `Rate Minor`, `Source Amount Minor`, `Allocation Quantity Decimal`, `Authoritative Extended Cost Minor`, `Currency`, `Summary Only`, `Include In Cost Rollup`, `Summary Group Key`, `Internal Notes`, `Version`, `Created At`, `Created By`, `Updated At`, `Updated By`, `Security Operation ID`, `Security Operation Fingerprint`, `Security Actor ID`.

### `QuotePricingDecisions`

`QuotePricingDecisionID`, `TenantID`, `QuoteRevisionID`, `QuoteLineItemID`, `QuoteCostEstimateID`, `Pricing Method`, `Cost Basis Minor`, `Markup Percent Decimal`, `Markup Amount Minor`, `Sell Unit Price Minor`, `Sell Extended Price Minor`, `Currency`, `Rationale`, `Version`, `Created At`, `Created By`, `Updated At`, `Updated By`, `Security Operation ID`, `Security Operation Fingerprint`, `Security Actor ID`.

### `QuoteSourceDocumentLinks`

`QuoteSourceDocumentLinkID`, `TenantID`, `DocumentID`, `Relationship Type`, `QuoteID`, `QuoteRevisionID`, `QuoteLineItemID`, `QuoteCostEstimateID`, `QuoteCostLineID`, `RFQID`, `PartID`, `VendorID`, `JobID`, `Purpose`, `Visibility`, `Source Fingerprint`, `Source Version`, `Created At`, `Created By`, `Security Operation ID`, `Security Operation Fingerprint`, `Security Actor ID`.

### Future `EstimatePurchaseLinks`

`EstimatePurchaseLinkID`, `TenantID`, `QuoteCostEstimateID`, `QuoteCostLineID`, `PurchaseRequestID`, `Link Status`, `Created At`, `Created By`, `Security Operation ID`, `Security Operation Fingerprint`, `Security Actor ID`.

All IDs are stable opaque Atlas IDs. All stores are tenant-linked, additive, mapped behind repositories, versioned where mutable, and audited with authoritative Atlas User IDs. Provider/storage row numbers never enter contracts.

## 17. VMC-0128 worked representation

This is a design validation only; no VMC-0128 record is created.

### Customer projection

| Customer line | Qty | Unit price | Extended | One-time |
|---|---:|---:|---:|---:|
| H2 plate assembly | 18 | $694.74 | $12,505.32 | $0.00 |

Customer totals: recurring unit price `$694.74`, recurring extended `$12,505.32`, one-time/NRE `$0.00`, total customer price `$12,505.32`.

### Internal estimate details

| Cost line | Basis | Authoritative calculation | Extended cost | Rollup |
|---|---|---:|---:|---|
| OnlineMetals tubing | `BATCH_TOTAL` | source total | $1,084.52 | yes |
| OnlineMetals end-cap plate | `BATCH_TOTAL` | source total | $600.80 | yes |
| OnlineMetals freight | `BATCH_TOTAL` | source total | $472.86 | yes |
| OnlineMetals sales tax | `BATCH_TOTAL` | source total | $192.07 | yes |
| Material preparation | `PER_PART` | 18 × $10.00 | $180.00 | yes |
| Operation 1 machining | `PER_PART` | 18 × $95.00 | $1,710.00 | yes |
| Operation 2 machining | `PER_PART` | 18 × $95.00 | $1,710.00 | yes |
| Welding | `HOURLY_PER_PART` | 18 × 3 × $75.00 | $4,050.00 | yes |
| Powder coating | `PER_PART` | 18 × $100.00 | $1,800.00 | yes |
| OnlineMetals summary | `BATCH_TOTAL` / `SUPPLIER_SUMMARY` | reconciles four supplier details | $2,350.25 | **no** |

Exact recurring estimated cost is `$2,350.25 + $9,450.00 = $11,800.25`. One-time estimated cost is `$0.00`. Total estimated cost is `$11,800.25`. Estimated contribution is `$12,505.32 − $11,800.25 = $705.07`; any percentage is derived and labeled according to the selected denominator.

The exact OnlineMetals allocation is `$2,350.25 ÷ 18 = $130.569444…` per assembly. `$130.57` is display-only. The material Pricing Decision stores authoritative customer unit price `$169.74`, extended `$3,055.32`, and may record its method/rationale; it does not reconstruct supplier total from `$130.57 × 18` and does not require percentage markup.

The supplier summary uses `SummaryOnly = true`, `IncludeInCostRollup = false`, the same Vendor ID/currency/group key as its four details, and reconciles exactly to `$2,350.25`. No internal record appears in the customer projection. Vendor estimate/source links remain estimates and do not create purchasing or receipt facts. No H2, OnlineMetals, or Vitality rule is hard-coded.

## 18. Decisions requiring Brendan

1. Confirm the initial currency policy: tenant base currency only, or permit quoted/supplier foreign currencies with explicit conversion records from the first implementation.
2. Approve canonical money storage as exact minor-unit strings plus decimal operands, and choose maximum decimal scales for quantity, hours, and rates.
3. Confirm whether an approved internal estimate is mandatory before Quote approval/issuance or optional by tenant policy.
4. Approve the proposed cost/margin capability split and initial role mappings.
5. Decide whether customer shipping and tax are Quote Lines or revision-level totals in the first implementation; tax calculation policy remains separate.
6. Confirm Vendor uniqueness/matching rules and whether one Vendor may have multiple locations/accounts before MOS-126B.
7. Confirm how multiple quantity options bind to Quote Revisions and cost-estimate versions.
8. Confirm which actual-cost sources are authoritative for later variance reporting (Purchase receipt, AP invoice, Job labor/event, inventory issue) before implementing estimate-to-actual reconciliation.

## 19. MOS-126 implementation implications

- **MOS-126B Vendor/Supplier foundation:** one tenant-scoped Vendor master, categories, bounded search, status, audit, and controlled legacy matching. No costing UI yet.
- **MOS-126C costing persistence/service:** decimal library, repositories, explicit cost-basis validation, versioned estimates/lines, rollup and supplier reconciliation, MOS-121 operation proof.
- **MOS-126D pricing and Quote Builder read model/UI:** customer/internal split, contextual selectors, manual/derived pricing decisions, NRE, bounded payloads, safe async behavior.
- **MOS-126E source documents and estimate-to-purchase proposal:** provider-neutral links, customer visibility approval, explicit idempotent Purchase Request proposal—not PO/receipt automation.
- **MOS-126F customer output and lifecycle integration:** allow-listed issued revision projection, approval/issuance/acceptance and Quote → Job compatibility, rendered/accessibility QA.
- **MOS-126G acceptance:** VMC-0128 fixture tests, adversarial privacy/tenant tests, decimal reconciliation, performance harness and controlled live/runtime validation.

Implementation order must establish Vendor identity and exact decimal/cost persistence before exposing editable costing or pricing UI. Existing Quote behavior remains compatible until consumers are migrated and proven; no current methods or sheets are removed in MOS-126A.

## 20. Architectural acceptance

The model represents VMC-0128 exactly while preserving source batch totals, explicit batch/per-part/hourly/one-time bases, non-rollup supplier summaries, customer/internal separation, independent NRE price and cost, Vendor/source-document context, estimate-versus-actual boundaries, contextual selection, tenant security, and provider-neutral persistence. It introduces no H2/Vitality-specific rule and requires no production mutation.
