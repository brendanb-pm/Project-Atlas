# MOS-129C-R1 Purchase Request → Job Relationship

Release channel: MAIN

Purchase Requests now have one optional, explicit `jobId` relationship persisted under the configured `Job ID` header. A blank value means the request is unlinked. Atlas never infers this relationship from descriptions, Customer, Quote, Vendor, names, or other free text, and existing blank records require no data rewrite.

Creation resolves the supplied Job through the canonical Job service and requires its authoritative tenant to match the immutable request context before persistence. The bounded `getPurchaseRequestsForJob(jobId, limit)` read revalidates that Job, requires an authoritative `PURCHASE_REQUEST` or `PURCHASE_APPROVE` capability, returns only exact same-tenant Job relationships, caps results at 50, and exposes purchasing summary fields rather than a global browser dataset.

The existing preallocated Purchase Request identity and universal resource-proof recovery remain authoritative. `jobId` is part of the complete request fingerprint. Callers may supply an internal `PRCMD-…` attempt identity; reuse with identical details replays safely, while reuse with a changed Job or other payload conflicts through the security-operation fingerprint check. Operators never need to see or enter this command identity.

## Activation requirement

No production resource was changed by this story. Before deploying the code path, update the approved `VMOS_PURCHASE_APPROVAL_MAPPING` with `jobId: ["Job ID"]`, then add the `Job ID` header in the exact configured position after `Vendor` and before `Category`. The existing initializer intentionally refuses an incompatible existing sheet and does not alter it automatically. Inventory and back up the target first; apply the additive header through the separately authorized production migration process. Existing rows receive a blank cell and remain unlinked.

Rollback is code/config disablement only. Do not delete the header or rewrite historical rows while any new Purchase Request contains a Job relationship.
