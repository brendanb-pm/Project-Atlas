# ADR-001: Google Sheets behind repositories

## Status
Accepted for the MVP.

## Decision
Presentation functions call services; services call entity repositories; only `SheetsRepository` accesses `SpreadsheetApp`. Sheet names and headers are configuration, not code constants. The repository will never create or alter worksheet structure.

IDs retain the agreed convention: `CUST-YY-####`, `RFQ-YY-####`, `VQT-YY-####`, `JOB-YY-####`, and `INV-YY-####`. IDs are allocated under a document lock after looking at existing records for the current year.

## Consequences
The live workbook must be mapped before deployment. Replacing Google Sheets later means implementing the same repository contract, leaving services and UI intact.
