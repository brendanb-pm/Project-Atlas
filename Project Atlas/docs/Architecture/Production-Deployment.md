# Production mapping and deployment

## Confirmed exact mappings

| VMOS entity | Production worksheet | Required for creation | Optional production fields mapped |
|---|---|---|---|
| Customer | `Customers` | `CustomerID`, `Company Name`, `Created At`, `Updated At`, `Created By`, `Updated By` | `CompanyID`, `Primary Contact`, `Email`, `Phone`, `Billing Terms`, `Credit Limit`, `Early Pay Discount`, `Sales Rep`, `Notes` |
| RFQ | `RFQ's` | `RFQID`, `CustomerID`, `Description`, `Status`, `Created At`, `Updated At`, `Created By`, `Updated By` | `CompanyID`, `ContactID`, `Customer RFQ Number`, `Received Date`, `Due Date`, `Priority`, `Source`, `Notes` |
| Quote | `Quotes` | `QuoteID`, `RFQID`, `CustomerID`, `Quote Date`, `Status`, `Created At`, `Updated At`, `Created By`, `Updated By` | `Expiration Date`, `Subtotal`, `NRE`, `Tooling`, `Material`, `Outside Services`, `Shipping`, `Tax`, `Total`, `Lead Time`, `Payment Terms`, `Confidence Score`, `Notes` |
| Job | `Jobs` | `JobID`, `CustomerID`, `QuoteID`, `Status`, `Updated At`, `Created By`, `Updated By` | `PartID`, `Revision`, `PO Number`, `Quantity`, `Due Date`, `Program`, `Fixture`, `Machine`, `Operator`, `NRE`, `Tooling Recovery`, `Material Cost`, `Estimated Hours`, `Actual Hours`, `Gross Margin`, `Confidence Score` |
| Invoice | `Invoices` | `InvoiceID`, `JobID`, `CustomerID`, `Invoice Date`, `Status`, `Created At`, `Updated At`, `Created By`, `Updated By` | `Due Date`, `PO Number`, `Subtotal`, `Tax`, `Shipping`, `Total`, `Amount Paid`, `Balance Due`, `Payment Date`, `Payment Terms`, `Notes` |

The configured mapping accepts the exact header strings above: no column positions, aliases, worksheet creation, or schema changes.

## Known production-schema conflicts

1. `Jobs` was supplied without `Created At`. VMOS does **not** write that value for Jobs; it still writes `Updated At`, `Created By`, and `Updated By`.
2. `Customers` was supplied without `Status`. VMOS does **not** write a customer-status default.
3. `Quotes` has no `Description`; VMOS no longer copies RFQ description into a Quote.
4. With the web app configured to execute as the deployer, Google may record the deployer's email in audit fields. Individual-user attribution requires a deployment/access policy that makes `Session.getActiveUser().getEmail()` available.

## Deploy with clasp

`appscript/src` is the only clasp deployment root. The Apps Script manifest is at `appscript/src/appsscript.json`; all `.gs` and `.html` source remains beneath that root. This prevents repository-relative paths such as `src/UI/Code.gs` from being deployed as Apps Script filenames.

From the repository's `Project Atlas/appscript` directory:

1. Copy `.clasp.json.example` to `.clasp.json` and replace only `REPLACE_WITH_YOUR_EXISTING_APPS_SCRIPT_ID` with the ID of the existing production Apps Script project. `.clasp.json` is ignored by Git and must never be committed.
2. Run `clasp push`. Confirm the Apps Script editor shows ordinary source files, including `Code.gs`, rather than repository paths. The project must expose `doGet`, `getMvpBootstrap`, and `createMvpRecord`.
3. In Project Settings -> Script properties, add `VMOS_SPREADSHEET_ID` with value `1pWL1_FZmrCTJI6yCHqtNUIPBjQ0zG_2GqiYUOZTCAco`.
4. Do **not** set `VMOS_SHEET_MAPPING`; the checked-in mapping already matches the supplied headers. If a live header differs, stop rather than changing the workbook.
5. Authorize using an account with edit access to the workbook, then run `getMvpBootstrap` from the editor. It must return `{ ok: true }` before any write.
6. Deploy a new version of the Web app and use the new deployment URL. Create one record through each stage and verify generated IDs, default statuses, and audit values.

## Pass 1 shop-floor activation

The live `Customers`, `RFQ's`, `Quotes`, `Jobs`, and `Invoices` sheets remain unchanged. Shop-floor control uses two new, dedicated append-only stores only:

| New worksheet | Exact headers | Purpose |
|---|---|---|
| `JobEvents` | `EventID`, `Command ID`, `JobID`, `Event Type`, `Occurred At`, `Actor`, `Previous Status`, `New Status`, `Notes`, `Problem Type`, `Responsible Party`, `Next Action`, `Expected Resolution`, `Machine`, `Tool`, `Program`, `Workflow ID`, `Workflow Version` | Immutable job-history and exception audit trail |
| `JobQrTokens` | `QR Token`, `JobID`, `Workflow ID`, `Created At`, `Created By`, `Revoked At`, `Revoked By` | Opaque QR-to-job routing tokens; it contains no customer or job details in the QR value |

After `clasp push`, open the Apps Script editor and run `initializeShopOperationalPersistence()` once. It creates only a missing `JobEvents` or `JobQrTokens` sheet and writes the headers above. If either sheet already exists with different headers, it stops without changing anything. It never edits, renames, reorders, or adds columns to any existing production worksheet.

To make a current Job available at the shop floor, run the following from the Apps Script editor, replacing the three values with the Job ID, chosen workflow, and status:

```javascript
configureShopFloorJob('JOB-26-0127', 'MACHINING', 'SETUP')
```

The supported workflow IDs are `MACHINING` and `CERAKOTE`. This returns an opaque `qrToken`. Construct and print the QR destination as:

```text
https://YOUR_WEB_APP_EXEC_URL?shop=1&qr=THE_RETURNED_QR_TOKEN
```

The shop-floor screen resolves that token server-side, shows the current Job and permitted transitions, and records every command with an idempotency key. `STOP / PROBLEM` changes the existing `Jobs.Status` to `BLOCKED` and appends the reason and context to `JobEvents`; it does not delete or overwrite history. To set different workflows in the future without editing code, set the optional script property `VMOS_WORKFLOW_TEMPLATES` to a JSON object matching `VMOS_DEFAULT_WORKFLOW_TEMPLATES` in `Utilities/WorkflowConfig.gs`.

## Pass 2 visibility and paper fallback

Pass 2 adds no worksheets and makes no production writes. It provides these read-only routes after web-app deployment:

| Route | Purpose |
|---|---|
| `YOUR_WEB_APP_EXEC_URL?dashboard=1` | Operations visibility: active/ready/blocked/due job counts, workflow exceptions, linked quote/invoice/payment visibility, and operator actionable-workload summaries |
| `YOUR_WEB_APP_EXEC_URL?traveler=1&qr=OPAQUE_TOKEN` | Printable Letter job traveler and reprint view for an existing active QR token |

Set the Apps Script project timezone to the shop's business timezone before relying on Due Today or Due This Week. The dashboard deliberately treats unknown statuses as neither ready nor complete. To classify readiness without changing code, set `VMOS_DASHBOARD_STATUS_CATEGORIES` to a reviewed JSON value, for example:

```json
{
  "MACHINING": {
    "readyStatuses": ["QUEUED"],
    "blockedStatuses": ["BLOCKED"],
    "completedStatuses": ["COMPLETE"]
  },
  "CERAKOTE": {
    "readyStatuses": ["READY_TO_COAT"],
    "blockedStatuses": ["BLOCKED"],
    "completedStatuses": ["COMPLETE"]
  }
}
```

Review those ready-status values with operations before setting them; they are examples, not an assertion about every shop's workflow. Jobs without an active QR/workflow assignment are reported as needing classification rather than silently included in ready work.

The current production schema has no authoritative job order-value field. Therefore, the dashboard does **not** calculate or label `Open Order Value`, remaining order value, or recognized revenue. It shows only separately labelled linked Quote totals, Invoice totals, and recorded payment totals, with coverage counts. This prevents double-counting or treating a quote as booked work.

The traveler reuses an existing opaque QR token; reprints never create a new token. To render the QR image, configure the optional `VMOS_QR_IMAGE_ENDPOINT` script property as the URL prefix of an approved QR renderer whose final parameter is the encoded payload. VMOS sends that renderer only the opaque VMOS scan URL, never customer, job, or financial details. If the property is absent, the traveler prints a clear recovery notice instead of sending any token to a third party. A self-hosted/internal renderer is preferred.

## Pass 3 non-AI stores — review before creation

No Pass 3 store is initialized automatically. `IdeasBacklog` and `IdeaEvents` can be created only by manually running `initializeIdeasPersistence()` after header review. Cash receipts, process trials, and purchase approvals remain disabled until their mapping properties point to approved sheets. This protects the existing production schema.

- `ProcessTrials`: `TrialID`, `JobID`, `Machine`, `Material`, `Operation`, `Tool`, `Tool Number`, `Diameter`, `Holder`, `Stickout`, `RPM`, `Feed`, `DOC/Peck`, `Coolant`, `Outcome`, `Tool Life`, `Failure Mode`, `Parameter Classification`, `Notes`, `Observed At`, `Recorded By`, `Created At`.
- `CashReceipts`: `ReceiptID`, `Receipt Command ID`, `InvoiceID`, `CustomerID`, `Received Date`, `Amount`, `Payment Method`, `Reference Number`, `Deposit Status`, `Deposit Date`, `Deposit Reference`, `Deposit Command ID`, `Notes`, `Created At`, `Created By`, `Updated At`, `Updated By`.
- Purchase approvals require `VMOS_PURCHASE_APPROVAL_MAPPING` and `VMOS_PURCHASE_APPROVAL_THRESHOLD`; the proposed headers are `Purchase Request ID`, `Request Date`, `Requester`, `Vendor`, `Category`, `Classification`, `Business Justification`, `Expected ROI / Need`, `Description`, `Amount`, `Actual Purchase Amount`, `Status`, `Approval Required`, `Approver`, `Approved At`, `Receipt Reference`, `Notes`, `Created At`, `Updated At`, `Created By`, `Updated By`.

Cash receipt records never overwrite Invoice payment fields. Purchase requests above the threshold reject same-person approval (case-insensitive). Process trials and Ideas events are append-only. Voice transcription/AI extraction remains deferred until a safe API credential is configured.
