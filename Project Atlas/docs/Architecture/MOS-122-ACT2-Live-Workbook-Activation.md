# MOS-122-ACT2 Live Workbook Activation — Follow-Ups and Purchasing

Release channel: MAIN
Inspected baseline: `15fb3d34a6856a6e77c9ef753ef3678a892d514b`

## Activation boundary and result

ACT2 adds two bounded `ADMIN_CONFIG` initializers but does not automatically run either one:

- `initializeFollowUpPersistence()` creates only absent `FollowUps` and `FollowUpEvents` sheets after preflighting both targets. Any incompatible existing header stops the entire operation before a missing sheet is created.
- `initializePurchaseApprovalPersistence()` first validates `VMOS_PURCHASE_APPROVAL_MAPPING`, `VMOS_PURCHASE_APPROVAL_THRESHOLD`, and the configured workbook. It creates only the absent mapped purchasing sheet and refuses any incompatible existing header.

Both initializers write one source-controlled header row only to a newly created empty sheet. They never rename, clear, reorder, append to, or repair an existing sheet and never seed business records. Repeated execution against compatible sheets is non-destructive and reports the current business-record count.

The configured Apps Script project was confirmed through authenticated CLI metadata, but its current deployment is not an API executable and no authenticated interactive Google session was available to this execution environment. Therefore the live workbook could not be inventoried safely and neither initializer was invoked. No production workbook or Script Property changed during this implementation.

## Authoritative schemas

Basic Follow-Ups require exactly:

- `FollowUps`: `FollowUpID`, `CustomerID`, `SalesActivityID`, `Title`, `Due At`, `Start At`, `End At`, `Time Zone`, `Owner User ID`, `Status`, `Version`, `Created At`, `Updated At`, `Completed At`, `Cancelled At`.
- `FollowUpEvents`: `FollowUpEventID`, `FollowUpID`, `Event Type`, `Occurred At`, `Actor`, `Correlation ID`, `Previous Version`, `New Version`, `Details`.

Core Follow-Up repositories now resolve only the `followUps` and `events` mappings. Calendar link/change-request stores remain required only by calendar-enabled paths. Calendar synchronization remains disabled and no provider store is created by either initializer.

Purchasing uses the worksheet name and first header alias for each validated logical field in `VMOS_PURCHASE_APPROVAL_MAPPING`, in this order:

`id`, `requestDate`, `requester`, `vendorId`, `vendor`, `jobId`, `category`, `classification`, `businessJustification`, `expectedRoiNeed`, `description`, `amount`, `actualPurchaseAmount`, `status`, `approvalRequired`, `approver`, `approvedAt`, `receiptReference`, `notes`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `securityOperationId`, `securityOperationFingerprint`, `securityTenantId`, `securityActorId`.

The proposed standard aliases remain:

`Purchase Request ID`, `Request Date`, `Requester`, `Vendor ID`, `Vendor`, `Job ID`, `Category`, `Classification`, `Business Justification`, `Expected ROI / Need`, `Description`, `Amount`, `Actual Purchase Amount`, `Status`, `Approval Required`, `Approver`, `Approved At`, `Receipt Reference`, `Notes`, `Created At`, `Updated At`, `Created By`, `Updated By`, `Security Operation ID`, `Security Operation Fingerprint`, `Security Tenant ID`, `Security Actor ID`.

The initializer does not select a mapping, threshold, or approval policy. Purchasing activation remains blocked until Brendan confirms the live mapping targets the approved worksheet, the non-negative threshold is intentional, and the approval policy represented by that threshold is approved.

## Live activation and verification runbook

1. Review and merge/deploy this exact MAIN revision through the normal Apps Script deployment procedure. Do not enable calendar synchronization.
2. In Script Properties, verify the configured workbook is the intended tenant/deployment without copying its identifier into documentation.
3. Inventory all worksheet names and record the before-state. Confirm whether `FollowUps`, `FollowUpEvents`, and the approved purchasing sheet are absent or empty/compatible.
4. If either Follow-Up sheet exists, compare its complete header row and order to the authoritative schema above. Stop on any mismatch.
5. As the authoritative Atlas ADMIN, run `initializeFollowUpPersistence()`. Reread both sheets; verify exact headers, zero unexpected business rows, and unchanged unrelated worksheets.
6. Reload Command Center and invoke the ADMIN-only activation-health diagnostic. Follow-Ups must report `EMPTY` or `READY`, never `SOURCE_UNAVAILABLE` solely because there are no records.
7. Open Follow-Ups and verify a healthy empty state. Do not create a sample record as part of activation.
8. Confirm `VMOS_CALENDAR_FOLLOWUP_ENABLED` remains false. Calendar Review must report `DISABLED` (or the repository-defined equivalent) and must not probe or create calendar stores.
9. Before purchasing activation, Brendan must approve the exact worksheet mapping, threshold, and approval policy. Stop if any value is absent or ambiguous.
10. After approval, verify the mapped sheet is absent or exactly compatible, then run `initializePurchaseApprovalPersistence()` as the authoritative Atlas ADMIN. Reread the sheet and verify exact header order, zero unexpected rows, and unchanged unrelated worksheets.
11. Reload Command Center and rerun activation health. Purchasing must report `EMPTY` or `READY`. Perform no purchase submission or approval merely to validate schema activation.

Rollback is disable-only: leave additive empty sheets intact, remove/disable purchasing configuration only through a separately authorized configuration change, and keep calendar disabled. No database repair or business-data rewrite is required.

## Status

- CODE / FUNCTIONAL STATUS: PASS — bounded activation contracts and regression coverage are implemented.
- SCHEMA ACTIVATION STATUS: NOT PERFORMED — live workbook inventory and writes were unavailable from this environment.
- FOLLOW-UP LIVE READINESS: PARTIAL — exact initializer and validation contract are ready; live execution remains.
- PURCHASING LIVE READINESS: PARTIAL — safe initializer is ready; Brendan must approve mapping, threshold, and approval policy before execution.
- CALENDAR-DISABLED VALIDATION: PASS at code/test level; live deployed verification remains required.
- SECURITY QA: PASS at code/test level — ADMIN_CONFIG boundary, fail-closed configuration, non-destructive preflight, and endpoint coverage are tested.
- PERFORMANCE / RESPONSIVENESS QA: PARTIAL — activation performs bounded worksheet/header operations; real Apps Script/Sheets timing was not measured.

No production resources were changed.
