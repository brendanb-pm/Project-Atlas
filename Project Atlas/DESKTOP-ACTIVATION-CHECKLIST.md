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
| RFQIntake | `IntakeID`; unique `MessageID, ThreadID` | `IntakeID, MessageID, ThreadID, Received At, Status, Source, Proposal JSON, Match JSON, Error, Approved RFQID, Created At, Updated At` | RFQ Intake; may be empty; staging only, never auto-creates production records |
| RFQIntakeAttachments | `AttachmentID`; `IntakeID` | `AttachmentID, IntakeID, MessageID, Filename, MIME Type, Size Bytes, Staging Reference, Checksum, Created At` | RFQ Intake; may be empty; document metadata only until approved storage policy |

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

- Gmail: create a reviewed intake label (recommended `VMOS/RFQ Intake`) only when enabling polling; retain MessageID/ThreadID dedupe.
- Drive: create a reviewed staging hierarchy only when attachments are enabled, e.g. `VMOS Staging/RFQ Intake/<IntakeID>`; do not auto-create production job folders.
- Trigger: create one time-driven poll trigger only after a manual dry run and disabled-feature test.
- Deploy: `clasp push`, authorize, create a new web-app version, then test with a single controlled record.

## Rollback / disable

Set `VMOS_RFQ_INTAKE_ENABLED=false`, disable the polling trigger, and remove UI bookmarks. Do not delete staged records; preserve them for audit. For any module, disable its route/configuration before changing data. Existing production sheets are never reordered, renamed, or edited by this plan.
