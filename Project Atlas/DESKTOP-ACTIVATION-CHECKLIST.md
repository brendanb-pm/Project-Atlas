# VMOS Desktop Activation Checklist

Run this only at the desktop, after a workbook backup and header-by-header review. Nothing in this checklist is performed by the remote-development sprint.

## Stores

| Store | PK / FKs | Exact header row | Dependency / activation |
|---|---|---|---|
| JobEvents | `EventID`; `JobID` | `EventID, Command ID, JobID, Event Type, Occurred At, Actor, Previous Status, New Status, Notes, Problem Type, Responsible Party, Next Action, Expected Resolution, Machine, Tool, Program, Workflow ID, Workflow Version` | Shop Floor; create empty with `initializeShopOperationalPersistence()` |
| JobQrTokens | `QR Token`; `JobID` | `QR Token, JobID, Workflow ID, Created At, Created By, Revoked At, Revoked By` | Shop Floor; same initializer |
| IdeasBacklog | `IdeaID` | `IdeaID, Title, Description, Category, Created At, Created By` | Ideas; create empty with `initializeIdeasPersistence()` |
| IdeaEvents | `IdeaEventID`; `IdeaID` | `IdeaEventID, IdeaID, Event Type, Occurred At, Actor, Note` | Ideas; same initializer |
| ProcessTrials | `TrialID`; optional `JobID` | `TrialID, JobID, Machine, Material, Operation, Tool, Tool Number, Diameter, Holder, Stickout, RPM, Feed, DOC/Peck, Coolant, Outcome, Tool Life, Failure Mode, Parameter Classification, Notes, Observed At, Recorded By, Created At` | Process learning; may be empty; classifications required: CALCULATED/TEST/PROVEN/FAILED; outcome required |
| CashReceipts | `ReceiptID`; `InvoiceID, CustomerID` | `ReceiptID, Receipt Command ID, InvoiceID, CustomerID, Received Date, Amount, Payment Method, Reference Number, Deposit Status, Deposit Date, Deposit Reference, Deposit Command ID, Notes, Created At, Created By, Updated At, Updated By` | Cash control; may be empty; positive amount, idempotent command IDs, UNDEPOSITED -> DEPOSITED only |
| SalesActivities | `SalesActivityID`; `CustomerID` | `SalesActivityID, CustomerID, ContactID, OpportunityID, Activity Type, Activity Datetime, Owner User ID, Created By User ID, Summary, Notes, Outcome, Materials Left, Material Type, Quantity Left, Location, Next Action, Next Action Due At, Follow-up Owner User ID, Status, Created At, Updated At` | MOS-115 CRM activity capture; create empty only after approval; open activities require next action/due date, due/overdue is derived |
| FollowUps | `FollowUpID`; `CustomerID, SalesActivityID` | `FollowUpID, CustomerID, SalesActivityID, Title, Due At, Start At, End At, Time Zone, Owner User ID, Status, Version, Created At, Updated At, Completed At, Cancelled At` | MOS-116/117A canonical follow-up lifecycle; Due At remains CRM deadline, scheduled blocks require Start/End/Time Zone |
| FollowUpEvents | `FollowUpEventID`; `FollowUpID` | `FollowUpEventID, FollowUpID, Event Type, Occurred At, Actor, Correlation ID, Previous Version, New Version, Details` | MOS-116 append-only lifecycle audit |
| CalendarFollowUpLinks | `CalendarFollowUpLinkID`; `FollowUpID, ConnectionID` | `CalendarFollowUpLinkID, FollowUpID, ConnectionID, Provider, Calendar ID, External Event ID, External Version, Last Sync Origin, Last Correlation ID, Last Synced FollowUp Version, Created At, Updated At` | Optional calendar adapter link; connection association is additive |
| ExternalChangeRequests | `ExternalChangeRequestID`; `FollowUpID` | `ExternalChangeRequestID, Provider, FollowUpID, Previous ConnectionID, External Event ID, Change Type, Cleanup Operation, Requested Due At, Requested Start At, Requested End At, Requested Time Zone, External Version, Status, Details, Attempt Count, Last Attempt At, Last Error, Detected At, Resolved At, Resolved By, Resolution` | External deletion/conflict/cleanup review; never auto-deletes MOS follow-up |
| CalendarSyncEvents | `CalendarSyncEventID`; `FollowUpID, ConnectionID` | `CalendarSyncEventID, Provider, FollowUpID, ConnectionID, External Event ID, Operation, Change Type, Correlation ID, MOS Version, External Version, Result, Details, Provider Duration Ms, Repository Duration Ms, Total Duration Ms, Recovery Required, Occurred At` | Durable provider-neutral idempotency, reconciliation outcome, and activation measurement evidence |
| UserCalendarConnections | `ConnectionID`; `UserID` | `ConnectionID, UserID, Provider, ExternalAccountID, ExternalAccountDisplayName, ExternalCalendarID, ExternalCalendarDisplayName, ConnectionStatus, CapabilitiesJSON, CredentialReference, TokenExpiresAt, SyncCursor, SubscriptionID, SubscriptionExpiresAt, LastSyncAt, LastSuccessfulSyncAt, LastError, CreatedAt, UpdatedAt` | MOS-117A per-user optional connection metadata; CredentialReference only, never raw credentials |
| PurchaseApprovals | `Purchase Request ID` | `Purchase Request ID, Request Date, Requester, Vendor, Category, Classification, Business Justification, Expected ROI / Need, Description, Amount, Actual Purchase Amount, Status, Approval Required, Approver, Approved At, Receipt Reference, Notes, Created At, Updated At, Created By, Updated By` | Spend control; may be empty; set mapping + threshold; Job/CapEx/Overhead, no same-person approval above threshold |
| QuoteRevisions | `QuoteRevisionID`; `QuoteID, RFQID` | `QuoteRevisionID, QuoteID, RFQID, Revision, Status, Customer Snapshot, Subtotal, Tax, Shipping, Total, Payment Terms, Validity, Delivery Commitment, Assumptions, Exclusions, Created At, Created By, Issued At, Issued By` | Quote persistence; may be empty; issued revisions immutable |
| QuoteLineItems | `QuoteLineItemID`; `QuoteRevisionID` | `QuoteLineItemID, QuoteRevisionID, Line Type, Description, Quantity, Unit Price, Extended Price, Drawing Revision, Customer Supplied Components, Created At` | Quote persistence; may be empty; supports NRE/setup/programming lines |
| RFQIntake | `IntakeID`; unique `MessageID, ThreadID` | `IntakeID, MessageID, ThreadID, Received At, Sender Name, Sender Email, Subject, Attachment Count, AI Confidence, Warning Count, Status, Source, Proposal JSON, Match JSON, Approval Plan JSON, Error, Retry Count, Reviewed By, Reviewed At, Approved By, Approved At, Rejection Reason, Created At, Updated At` | RFQ Intake; may be empty; staging only, approval creates a plan—not production entities |
| RFQIntakeAttachments | `AttachmentID`; `IntakeID` | `AttachmentID, IntakeID, MessageID, Filename, MIME Type, Size Bytes, SHA-256 Checksum, Staging Reference, Detected Part Number, Detected Revision, Document Type, AI Confidence, DocumentID, Created At` | RFQ Intake; may be empty; retain originals; document metadata/association only |

New non-core IDs are UUID-based: `EVT-`, opaque QR UUID, `PTR-`, `RCPT-`, `PUR-`, `INTAKE-`; existing canonical business IDs remain unchanged.

## Quote revision states

`DRAFT` may be edited. `READY_FOR_REVIEW` awaits commercial review. `APPROVED_FOR_SEND` requires explicit human approval. Only `APPROVED_FOR_SEND` may become `ISSUED`. Issued revisions are immutable. Issuing a newer revision marks the prior issued revision `SUPERSEDED`; it is retained. State changes never send email; sending is a separate explicit action.

## Script Properties and configuration

1. `VMOS_SPREADSHEET_ID` (existing workbook).
2. Optional mappings: `VMOS_SHEET_MAPPING`, `VMOS_OPERATIONAL_SHEET_MAPPING`, `VMOS_IDEAS_SHEET_MAPPING`, `VMOS_CASH_RECEIPT_MAPPING`, `VMOS_PURCHASE_APPROVAL_MAPPING`.
3. Required for purchase activation: `VMOS_PURCHASE_APPROVAL_THRESHOLD`.
4. Dashboard: `VMOS_DASHBOARD_STATUS_CATEGORIES`; set project timezone to shop timezone.
5. QR: optional `VMOS_QR_IMAGE_ENDPOINT`; prefer internal renderer.
6. RFQ Intake: `VMOS_RFQ_INTAKE_ENABLED=false` first; mapping/provider/label/folder properties must be reviewed before setting true.
   Required provider properties: `VMOS_RFQ_GMAIL_LABEL`, `VMOS_RFQ_DRIVE_ROOT_ID`, `VMOS_OPENAI_API_KEY`, optional `VMOS_RFQ_OPENAI_MODEL`.
7. AI/voice later: `VMOS_OPENAI_API_KEY`, model/provider policy, and explicit access policy.

## External configuration, still inactive

- Gmail: create a reviewed intake label (recommended `VMOS/RFQ Intake`) only when enabling polling; poll every 10 minutes and retain MessageID/ThreadID dedupe.
- Drive: retain original attachments under a reviewed staging hierarchy, e.g. `VMOS Staging/RFQ Intake/<IntakeID>`; store SHA-256 checksum; no hard deletion and no auto-created production job folders.
- Trigger: create one 10-minute time-driven poll trigger only after a manual dry run and disabled-feature test.
- Provider enablement order: validate disabled behavior; set Gmail label, Drive root, and AI key; run fake/dry-run extraction; review staging only; enable feature flag; then create the 10-minute trigger. Quote PDFs later use a reviewed RFQ/Quote Drive location and fake document/email preparation until approved.
- Deploy: `clasp push`, authorize, create a new web-app version, then test with a single controlled record.

## Rollback / disable

Set `VMOS_RFQ_INTAKE_ENABLED=false`, disable the polling trigger, and remove UI bookmarks. Extraction retries are capped at 3; then mark `NEEDS_ATTENTION`. Do not delete staged records or original attachments; preserve them for audit. Human confirmation is required for every entity identity, and AI never creates production records. For any module, disable its route/configuration before changing data. Existing production sheets are never reordered, renamed, or edited by this plan.
