# Production mapping and deployment

## Confirmed exact mappings

| VMOS entity | Production worksheet | Required for creation | Optional production fields mapped |
|---|---|---|---|
| Customer | `Customers` | `CustomerID`, `Company Name`, `Created At`, `Updated At`, `Created By`, `Updated By` | `CompanyID`, `Primary Contact`, `Email`, `Phone`, `Billing Terms`, `Credit Limit`, `Early Pay Discount`, `Sales Rep`, `Notes` |
| RFQ | `RFQ's` | `RFQID`, `CustomerID`, `Description`, `Status`, `Created At`, `Updated At`, `Created By`, `Updated By` | `CompanyID`, `ContactID`, `Customer RFQ Number`, `Received Date`, `Due Date`, `Priority`, `Source`, `Notes` |
| Quote | `Quotes` | `QuoteID`, `RFQID`, `CustomerID`, `Quote Date`, `Status`, `Created At`, `Updated At`, `Created By`, `Updated By` | `Expiration Date`, `Subtotal`, `NRE`, `Tooling`, `Material`, `Outside Services`, `Shipping`, `Tax`, `Total`, `Lead Time`, `Payment Terms`, `Confidence Score`, `Notes` |
| Job | `Jobs` | `JobID`, `CustomerID`, `QuoteID`, `Status`, `Updated At`, `Created By`, `Updated By` | `PartID`, `Revision`, `PO Number`, `Quantity`, `Due Date`, `Program`, `Fixture`, `Machine`, `Operator`, `NRE`, `Tooling Recovery`, `Material Cost`, `Estimated Hours`, `Actual Hours`, `Gross Margin`, `Confidence Score` |
| Invoice | `Invoices` | `InvoiceID`, `JobID`, `CustomerID`, `Invoice Date`, `Status`, `Created At`, `Updated At`, `Created By`, `Updated By` | `Due Date`, `PO Number`, `Subtotal`, `Tax`, `Shipping`, `Total`, `Amount Paid`, `Balance Due`, `Payment Date`, `Payment Terms`, `Notes` |

The configured mapping accepts the exact header strings above—no column positions, aliases, worksheet creation, or schema changes.

## Known production-schema conflicts

1. `Jobs` was supplied without `Created At`. VMOS does **not** write that value for Jobs; it still writes `Updated At`, `Created By`, and `Updated By`. Adding `Created At` later is a business decision outside this deployment.
2. `Customers` was supplied without `Status`. VMOS does **not** write a customer-status default.
3. `Quotes` has no `Description`; VMOS no longer copies RFQ description into a Quote.
4. With the web app configured to execute as the deployer, Google may record the deployer's email in audit fields. Individual-user attribution requires a deployment/access policy that makes `Session.getActiveUser().getEmail()` available.

## Deploy today

1. In a standalone Apps Script project, replace the source with this repository's `appscript/` files. Do not edit the spreadsheet.
2. In **Project Settings → Script properties**, add `VMOS_SPREADSHEET_ID` with value `1pWL1_FZmrCTJI6yCHqtNUIPBjQ0zG_2GqiYUOZTCAco`.
3. Do **not** set `VMOS_SHEET_MAPPING`; the checked-in mapping already exactly matches the supplied production headers. Set it only if a header or sheet name differs from the supplied list.
4. Authorize the script using an account that already has edit access to the workbook. It needs Spreadsheet, Properties, Lock, and HTML services.
5. Run `getMvpBootstrap` in the Apps Script editor. It must return `{ ok: true }` and list all five entities before any write.
6. Deploy → **New deployment** → **Web app**. Set execute-as/access according to the audit attribution policy above. Copy the deployed URL.
7. Create one Customer, then one RFQ, Quote, Job, and Invoice. Confirm each new row has the generated ID, default status, timestamps, and audit values. Stop if any configuration error is shown; it means the live header row does not match this supplied schema.
