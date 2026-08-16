# MOS-129C Job Record Canvas

The Job Record Canvas is the canonical contextual route for one Work Order: `?route=job&jobId=<Job ID>`. It renders inside the unified Atlas shell and keeps the Job header available while the operator moves among Overview, Commercial, Production, Purchasing, Documents, Billing, Firearms (when enabled), and bounded History sections.

## Authority and read model

`getJobCanvas(jobId)` resolves the Job inside the trusted Atlas session tenant and requires `OPERATIONS_READ`. Optional sections are projected only when their required capability and module are available. Related results have fixed server-side bounds, stable presentation ordering where the underlying domain defines it, and safe unavailable-reference labels. A section read failure is isolated from the root Job context.

Purchasing uses the MOS-129C-R1 canonical relationship exclusively. `PurchaseApprovalService_.listForJob(jobId, limit)` resolves the Job server-side and calls the tenant-filtered `PurchaseApprovalRepository_.listByJobId`. The Canvas does not infer Purchase Requests from descriptions, Customer text, Vendor text, or other fields. Blank legacy `Job ID` values remain unlinked.

The Create Purchase Request action carries `jobId` into the existing Purchasing workspace. `submitPurchaseRequest` revalidates that Job against the trusted tenant and includes `jobId` in its recovery fingerprint. The client uses one `PRCMD-*` identity for a submission attempt and does not select tenant or actor authority.

## Navigation and resilience

Mission Control, Work Order lists, Daily Production, Floor Board, Quote-to-Job conversion, and bounded command search link to the Canvas. Related records open their authoritative workspaces; the Canvas does not duplicate Quote lifecycle, production, purchasing approval/receipt, payment, or Firearms mutations.

The Canvas rejects stale async responses using a request generation, exposes accessible root and section failure states, and remains usable when optional related data is absent. Mobile presentation prioritizes identity, readiness, blocker, and the primary production action.

## Activation dependency

No workbook or production configuration was changed by MOS-129C. Before activating canonical Purchase Request-to-Job behavior in a production deployment:

- add `jobId: ["Job ID"]` to `VMOS_PURCHASE_APPROVAL_MAPPING`;
- add the `Job ID` sheet header after `Vendor` and before `Category`.

No legacy rows should be backfilled or inferred automatically.

## Known adapter debt

The Canvas returns bounded browser payloads and avoids per-document hydration. Some current repositories still implement bounded domain queries over a sheet scan. That is existing MOS-120 adapter debt and is not a second browser-side dataset or relationship model.
