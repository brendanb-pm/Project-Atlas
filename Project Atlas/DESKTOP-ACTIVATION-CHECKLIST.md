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
| PurchaseApprovals | `Purchase Request ID` | `Purchase Request ID, Request Date, Requester, Vendor, Category, Classification, Business Justification, Expected ROI / Need, Description, Amount, Actual Purchase Amount, Status, Approval Required, Approver, Approved At, Receipt Reference, Notes, Created At, Updated At, Created By, Updated By` | Spend control; may be empty; set mapping + threshold; Job/CapEx/Overhead, no same-person approval above threshold |
| RFQIntake | `IntakeID`; unique `MessageID, ThreadID` | `IntakeID, MessageID, ThreadID, Received At, Sender Name, Sender Email, Subject, Attachment Count, AI Confidence, Warning Count, Status, Source, Proposal JSON, Match JSON, Error, Retry Count, Reviewed By, Reviewed At, Approved By, Approved At, Rejection Reason, Created At, Updated At` | RFQ Intake; may be empty; staging only, approval creates a plan—not production entities |
| RFQIntakeAttachments | `AttachmentID`; `IntakeID` | `AttachmentID, IntakeID, MessageID, Filename, MIME Type, Size Bytes, SHA-256 Checksum, Staging Reference, Detected Part Number, Detected Revision, Document Type, AI Confidence, DocumentID, Created At` | RFQ Intake; may be empty; retain originals; document metadata/association only |

New non-core IDs are UUID-based: `EVT-`, opaque QR UUID, `PTR-`, `RCPT-`, `PUR-`, `INTAKE-`; existing canonical business IDs remain unchanged.

## Script Properties and configuration

1. `VMOS_SPREADSHEET_ID` (existing workbook).
2. Optional mappings: `VMOS_SHEET_MAPPING`, `VMOS_OPERATIONAL_SHEET_MAPPING`, `VMOS_IDEAS_SHEET_MAPPING`, `VMOS_CASH_RECEIPT_MAPPING`, `VMOS_PURCHASE_APPROVAL_MAPPING`.
3. Required for purchase activation: `VMOS_PURCHASE_APPROVAL_THRESHOLD`.
4. Dashboard: `VMOS_DASHBOARD_STATUS_CATEGORIES`; set project timezone to shop timezone.
5. QR: optional `VMOS_QR_IMAGE_ENDPOINT`; prefer internal renderer.
6. RFQ Intake: `VMOS_RFQ_INTAKE_ENABLED=false` first; mapping/provider/label/folder properties must be reviewed before setting true.
7. AI/voice later: `VMOS_OPENAI_API_KEY`, model/provider policy, and explicit access policy.

## External configuration, still inactive

- Gmail: create a reviewed intake label (recommended `VMOS/RFQ Intake`) only when enabling polling; poll every 10 minutes and retain MessageID/ThreadID dedupe.
- Drive: retain original attachments under a reviewed staging hierarchy, e.g. `VMOS Staging/RFQ Intake/<IntakeID>`; store SHA-256 checksum; no hard deletion and no auto-created production job folders.
- Trigger: create one 10-minute time-driven poll trigger only after a manual dry run and disabled-feature test.
- Deploy: `clasp push`, authorize, create a new web-app version, then test with a single controlled record.

## Rollback / disable

Set `VMOS_RFQ_INTAKE_ENABLED=false`, disable the polling trigger, and remove UI bookmarks. Extraction retries are capped at 3; then mark `NEEDS_ATTENTION`. Do not delete staged records or original attachments; preserve them for audit. Human confirmation is required for every entity identity, and AI never creates production records. For any module, disable its route/configuration before changing data. Existing production sheets are never reordered, renamed, or edited by this plan.
