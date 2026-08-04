# Google Sheets integration

VMOS is read/write compatible only with a workbook that has been explicitly mapped. It never creates sheets, headers, or columns. This is intentional: the production workbook and data dictionary were not present in this repository when the MVP was implemented.

Configure `VMOS_SPREADSHEET_ID` and, when its headers differ from the documented defaults, `VMOS_SHEET_MAPPING` in Apps Script Script Properties. The mapping describes the sheet name, ID header, ID prefix, required logical fields, and candidate headers. The repository discovers actual headers from row 1; there are no hard-coded column positions.

Required relationships are Customer → RFQ → Quote → Job → Invoice. Quote, Job, and Invoice can infer their customer from the preceding record, and the service verifies that references belong to the same customer. Missing headers or sheets produce a configuration error before a write.

## Workspace items still required

1. Share the production workbook with the Apps Script deployment account.
2. Confirm the real worksheet names and row-1 headers, then set the mapping before the first write.
3. Authorize Spreadsheet, Properties, Lock, and HTML services on first execution.
4. Create a Google Drive parent-folder configuration only when automated job folders are approved. Drive folder creation is deliberately deferred in this MVP; it must not create production folders without a configured parent and naming decision.
