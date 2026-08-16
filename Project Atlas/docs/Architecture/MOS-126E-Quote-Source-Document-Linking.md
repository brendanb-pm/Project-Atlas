# MOS-126E — Quote source-document and contextual relationship linking

**Release:** MAIN. **Baseline:** `c84e92b831a28b9c3307e4dac22f95efd190c78c`. **Activation:** additive code/schema contract only; no production workbook or provider was changed.

## Model and boundary

`SourceDocument` is a provider-neutral metadata reference, not binary storage. It records a stable Atlas `DocumentID`, Tenant, operator-readable title/type, opaque provider reference, customer-eligibility classification, active state, fingerprint/version, and audit metadata. `QuoteSourceDocumentLink` associates that reference to one Quote context with explicit relationship type, purpose, visibility, source snapshot, soft-removal/version state, authoritative actor, and MOS-121 operation proof.

Supported relationship types are `QUOTE`, `RFQ`, `CUSTOMER`, `PART`, `VENDOR`, `QUOTE_COST_LINE`, `SOURCE_DOCUMENT`, and `JOB`. Supported purposes are `CUSTOMER_RFQ`, `DRAWING`, `SCOPE`, `SUPPLIER_ESTIMATE`, `SUPPLIER_CART`, `WORKBOOK`, `CUSTOMER_QUOTE_OUTPUT`, and `OTHER`. All links default to `INTERNAL`. `CUSTOMER_APPROVED` requires both an explicitly customer-eligible source and Quote write authority; classification alone does not add the document to customer output. Customer Quote projection remains an independent allow list and currently emits no source documents.

The service resolves the Quote and every populated relationship from authoritative tenant-scoped repositories. RFQ and Customer must belong to the Quote; Work Order must reference the Quote; cost line must resolve through an estimate belonging to the Quote; Part must be derived through a selected cost line or Work Order; Vendor must share Tenant. Missing/deleted source references render as “Source document unavailable” while retaining the historical link. Cross-tenant existence is not disclosed.

## Mutation, failure, and recovery

Add uses a server-preallocated `QSDL` identity and `PREALLOCATED_RESOURCE_ID` recovery. Universal recovery resolves the exact link and requires matching Tenant, Security Operation ID, request fingerprint, and authoritative actor before adopting it as completed. The active uniqueness contract is Tenant + Quote + Document + relationship type + target + purpose; a duplicate returns the established link without rewriting attribution. Remove is a version-checked soft unlink and is classified `EXPLICIT_REVIEW`, so an uncertain transport result is refreshed/reconciled rather than blindly replayed. Both paths run through authorized execution, immutable AuditContext, abuse controls, client-safe errors, and the MOS-121 ledger. A short document lock covers only validation/record mutation and no provider/network work.

The Quote Builder preserves the selected source and relationship inputs on validation, authorization, conflict, or transport failure. Controls are disabled only during the active mutation. Uncertain outcomes instruct the operator to refresh the bounded link list before retrying. Missing references and absent additive workbook configuration degrade to safe internal states rather than contaminating customer output.

## Bounded reads and operator-memory audit

Document and related-record searches return no more than 50 human-readable results. Link lists are Quote-scoped and capped at 50. Vendor, Work Order, cost-line, and Part choices derive from tenant/Quote context; Customer and RFQ derive from the loaded Quote. No selector uses `getMvpBootstrap`, no global directory is sent to the browser, and no relationship requires manual ID entry.

- Source Document: **FIXED** — title/type search.
- Quote, Customer, RFQ: **FIXED** — carried from current Quote context.
- Vendor: **FIXED** — bounded name/category search.
- Quote Cost Line: **FIXED** — bounded description/category search within Quote estimates.
- Part: **FIXED WITH CURRENT MODEL LIMITATION** — derived from Quote cost-line/Work Order context; Atlas has no standalone Part master today.
- Job/Work Order: **FIXED** — bounded Quote-related Work Order search.
- Quote Revision / customer Quote line: **DEFERRED WITH REASON** — current MAIN has no tenant-aware canonical repositories for these prototype stores; accepting raw IDs would weaken the boundary.

The current Sheets adapter may scan each backing sheet to satisfy these bounded projections. Browser payloads and result counts are bounded, but indexed persistence/read-model work remains performance debt.

## Storage capability and activation

Additive stores/headers are:

- `SourceDocuments`: `DocumentID`, `TenantID`, `Title`, `Document Type`, `Reference Type`, `Reference Value`, `Customer Eligible`, `Status`, `Source Fingerprint`, `Source Version`, `Created At`, `Created By`, `Updated At`, `Updated By`.
- `QuoteSourceDocumentLinks`: the MOS-126A headers plus `CustomerID`, `Status`, `Version`, update/removal attribution, and Security Operation fields.

Atlas does not yet upload, version, virus-scan, retain, or authorize binary files. A future provider adapter must populate approved metadata references without exposing Drive IDs, URLs, or provider credentials to normal UI. VMC-0128 can link an existing metadata reference for the rebuilt H2 costing workbook as `WORKBOOK + INTERNAL`; neither the workbook nor supplier costing enters customer projection. No VMC-0128 production data was created.
