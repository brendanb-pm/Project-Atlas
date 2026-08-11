# MOS-122F-R — Contextual Sales-to-Work-Order Workflow

## Baseline and boundary

Implementation began on `main` at `254615b39d95409effeec1203b2db343a806dd88`, after confirming the MOS-122 status and reconciliation audit. This story changes Atlas application code and tests only. It does not deploy, mutate a production workbook, activate providers, or change credentials.

## Before remediation

The shared `Index.html` entity forms exposed CustomerID, RFQID, QuoteID, and JobID as editable fields. RFQ, Quote, Job, and Invoice routes therefore required operators to copy identifiers between disconnected screens. Quote preparation and intake pages were useful reference/prototype surfaces but did not provide the canonical routed Customer-to-Invoice workflow. There was no distinct Customer-accepted Quote state or canonical accepted-Quote-to-Job action.

## Production workflow

The routed `customers`, `rfqs`, `quotes`, `jobs`, and `invoices` destinations now share a contextual commercial workspace:

1. A Customer presents authorized actions to log Sales Activity, create a Follow-Up, or create an RFQ. Related RFQs, Quotes, Jobs, and Invoices are bounded to ten records per group.
2. RFQ creation derives CustomerID from the selected server-validated Customer. An RFQ presents its Customer and opens or creates its Quote.
3. Quote creation derives RFQ and Customer relationships on the server. Duplicate conversion returns the established Quote.
4. Quote lifecycle keeps `Approved` (internal), `Issued` (sent), and `Accepted` (customer acceptance) distinct. Only an `Accepted` Quote can create a Job.
5. Quote-to-Job preserves Quote and Customer directly and RFQ provenance through the canonical Quote. This release intentionally supports one Job per Quote; a repeat opens/returns the established Job.
6. Job-to-Invoice creates one draft Invoice per Job. Customer and Job are canonical relationships; Quote and RFQ provenance are resolved through the Job. The Quote total is used only when present; otherwise the draft remains without an invented amount.

Internal IDs remain visible as read-only references and route keys, but no normal create form asks an operator to type them. Browser/back navigation uses ordinary route links and contextual breadcrumbs.

## Integrity, authorization, and recovery

Every relationship is looked up and checked against the server-derived tenant before mutation. Browser-supplied relationship IDs are locators only and cannot establish tenant or actor identity. Callable boundaries enforce `RFQ_WRITE`, `QUOTE_WRITE`, `QUOTE_APPROVE`, `QUOTE_ISSUE`, `OPERATIONS_WRITE`, or `FINANCE_WRITE`; capability-aware buttons are presentation only.

RFQ, Quote, Job, and Invoice creation preallocate canonical resource identities and use the MOS-121 security-operation proof contract. The service preserves tenant, authoritative actor, operation, and request fingerprint fields at persistence. Existing one-to-one conversions are returned rather than duplicated. Quote acceptance is an explicit review-only transition if its outcome becomes uncertain. The client disables conversion controls while a request is active and refreshes authoritative state after an unconfirmed transport result.

## Read model and responsiveness

Navigation does not use `getMvpBootstrap`. The browser receives one entity directory capped at 50 records, selected context, and related groups capped at ten; persistence proof fields and unrelated storage columns are projected out. Current Sheets adapters may still scan a sheet to implement these bounded contracts, so controlled Apps Script/Sheets measurement remains required. The UI does not receive all Customers, RFQs, Quotes, Jobs, and Invoices in a single payload. Each conversion is one callable request followed by navigation to one bounded read.

## Presentation and artifact disposition

The workspace uses the shared Atlas design system and navigation frame, touch-sized actions, live status/error regions, labeled inputs, keyboard-native links/buttons, and layouts that collapse at 900 and 520 pixels. Sales Activity and Follow-Up routes honor a contextual Customer locator, so the operator does not locate the Customer twice.

`RfqIntakeReview.html`, `QuotePreparation.html`, and `QuoteTemplate.html` remain design/integration artifacts for intake, preparation, and document output. They are not registered as competing core RFQ/Quote navigation destinations. Valuable domain behavior remains available for later integration; operators enter the production commercial flow through the contextual routes.

## Remaining validation and debt

- Live Apps Script identity, workbook, latency, and uncertain-outcome behavior require controlled non-production activation; no live claim is made here.
- Rendered inspection is required at 1440×900, 1024×768, 768×1024, and 390×844 before rendered QA can pass.
- The adapter still needs MOS-120 bounded physical queries to avoid full-sheet scans at scale.
- Multi-Job-per-Quote, multi-Invoice-per-Job, line-item CPQ, tax/accounting rules, and payment allocation are deliberately not invented.
- Older `Index.html` generic entity rendering remains a compatibility implementation, but the registered commercial routes no longer expose its raw-ID forms.

No normal Customer → RFQ → Quote → Job → Invoice step requires direct Sheets editing. Workbook headers and one-time activation remain administrative concerns, not operator workflow.
