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
