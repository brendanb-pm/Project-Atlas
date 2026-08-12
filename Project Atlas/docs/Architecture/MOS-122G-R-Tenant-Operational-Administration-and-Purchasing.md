# MOS-122G-R — Tenant Operational Administration and Purchasing

## Boundary

Implementation began on `main` at `70b4e35ebffb5e22fde465a856e7c2db2f5198d0`. The referenced `Codex-Standards.md` was not available in the workspace and its public repository/file could not be verified, so Project Atlas `AGENTS.md` remained authoritative.

This story adds tenant operational administration, purchasing, and contextual cash-receipt UI. It does not implement or expose MOS-123 platform-owner subscription, billing, entitlement, seat, or cross-tenant administration.

## Tenant administration

`Admin / Settings` now combines safe activation health with bounded tenant membership and invitation presentation. An `ADMIN_IDENTITY` user may:

- create a tenant-scoped pending invitation using an email and an approved tenant role;
- change an existing tenant membership's approved role bundle;
- activate or deactivate an existing tenant membership;
- inspect enabled modules, calendar state, and Follow-Up/purchasing/calendar-review health.

The role selector accepts only `SHOP_OPERATOR`, `SALES`, `MANAGER`, `FINANCE`, and `ADMIN`. It cannot assign `PLATFORM_*` authority or arbitrary capability names. The current administrator cannot deactivate their own membership. Server-derived TenantID scopes every invitation and membership change; browser TenantID is never accepted.

Invitation creation uses the existing provider-neutral `AtlasTenantInvitations` contract. Invitation delivery, expiry policy, and authenticated acceptance remain activation/onboarding work; Atlas does not pretend an invitation email was sent. If invitation persistence is not activated, membership visibility remains usable and invitation creation fails safely. Existing identity, membership, invitation, and audit stores must be activated through reviewed additive schema procedures; the UI does not create worksheets.

Module and integration state remains read-only because current canonical configuration is deployment/Script-Property based and no tenant-safe mutable module contract exists. This prevents tenant UI from bypassing MOS-123 entitlement or controlled deployment policy.

## Purchasing workspace

The routed `Purchasing` workspace is available to `PURCHASE_REQUEST` / `PURCHASE_APPROVE` personas and presents a bounded 50-record list with human-readable vendor, description, status, and detail. It supports:

- submitting a request with vendor, description, category, classification, justification, need, amount, and notes;
- approving an over-threshold request through the existing authoritative-actor and requester/approver separation contract;
- recording receipt reference and optional actual amount after approval.

No form asks for Purchase Request ID or requester/approver identity. The selected server record supplies context; audit identity comes from immutable `AuditContext`. Tenant proof fields filter reads and reject cross-tenant detail access. The existing threshold remains configured by `VMOS_PURCHASE_APPROVAL_THRESHOLD`; the UI does not invent a threshold.

Purchase rejection is deliberately not implemented. The canonical service defines submit, approve, and receipt only; introducing rejection statuses, reasons, re-open rules, and authority would invent policy. It remains a product decision.

## Invoice payment / cash receipt

An authorized Finance user can open an Invoice and choose **Record Payment / Cash Receipt**. InvoiceID and CustomerID are derived from the selected tenant-validated Invoice. The operator enters only received date, amount, payment method, and an optional reference. A server-generated command identifier plus MOS-121 operation fingerprint preserves cash-receipt idempotency and intent binding.

The existing cash-receipt domain explicitly does not update Invoice balance fields. The UI states this limitation and does not fabricate allocation, deposit, balance, or accounting behavior. Deposit workflow remains service-only because this story does not define deposit batching/accounting policy.

## Direct-Sheets and activation disposition

Normal membership role/status management, invitation creation, purchase request/approval/receipt, and contextual Invoice receipt entry no longer require direct Sheets edits once their existing stores are activated. Remaining direct configuration dependencies are one-time/reviewed activation concerns:

- identity, membership, external identity, audit, and invitation sheet schemas;
- purchase mapping and threshold;
- deployment profile, module, provider, and identity-enforcement Script Properties;
- cash-receipt store activation.

These are not mutated by this story. No production data, schema, property, identity, provider, or deployment was changed.

## Performance and validation

Tenant membership results are capped at 100, invitations and purchase requests at 50. Browser payloads exclude persistence proof fields. Current Sheets adapters may still perform full-sheet reads to implement those bounded presentation contracts, so real Apps Script/Sheets timing remains a controlled activation measurement. Rendered multi-viewport and live identity/workbook evidence remain MOS-122H/ACT3 gates.
