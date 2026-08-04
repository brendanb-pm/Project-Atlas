# Project Atlas / VMOS MVP

The runnable MVP supports the business path **Customer → RFQ → Quote → Job → Invoice**. It is intentionally small: it does not include tooling, inventory, AI, analytics, CRM, or Drive folder automation.

## Architecture

`HTML UI → MvpService → entity repository → SheetsRepository → Google Sheets`

Only `appscript/src/Repository/SheetsRepository.gs` calls `SpreadsheetApp`. Services own validation, workflow defaults, relationship checks, IDs, and errors. The repository uses worksheet headers at runtime; it never relies on a column number and never creates or changes a sheet.

## What the MVP does

- Creates and lists Customers, RFQs, Quotes, Jobs, and Invoices.
- Generates `CUST-YY-####`, `RFQ-YY-####`, `VQT-YY-####`, `JOB-YY-####`, and `INV-YY-####` under a document lock.
- Carries the customer from RFQ to Quote, Quote to Job, and Job to Invoice when possible, and rejects mismatched relationships.
- Returns understandable validation, missing-record, and configuration errors to the minimal Apps Script web UI.

## Google Workspace setup

The production workbook's schema/data dictionary was not included in this repository. Do not deploy against it until its sheets and header row are mapped.

1. Create a standalone Google Apps Script project and copy the contents of `appscript/` into it (or use `clasp` to push that directory).
2. In **Project Settings → Script properties**, set `VMOS_SPREADSHEET_ID` to the existing workbook ID.
3. Compare its real sheet names and row-1 headers with `appscript/src/Config.gs`. If they differ, set `VMOS_SHEET_MAPPING` to a JSON mapping using the same shape. This is required instead of changing the workbook.
4. Share the workbook with the account that deploys the script. Run `getMvpBootstrap` once from the editor to authorize access.
5. Deploy → New deployment → Web app. Execute as the deploying user; choose access appropriate for your shop. Open the deployment URL.

The default mapping expects existing sheets named `Customers`, `RFQs`, `Quotes`, `Jobs`, and `Invoices`, with the headers listed in `Config.gs`. It is a safe starting point, not an assertion about the production workbook. Missing sheet/header errors block a write and say what to map.

See [Sheets integration](docs/Architecture/Sheets-Integration.md) for mapping and outstanding manual Workspace configuration. Automated Drive job folders remain deferred until a parent folder and exact naming policy are configured.

## Local tests

With Node.js installed, run:

```text
node tests/mvp.test.js
```

The test suite runs the service/ID/validation workflow with an in-memory repository. Google Apps Script services themselves must be authorized and exercised in the Apps Script editor after the workbook mapping is supplied.
