# MOS-140A — Direct Manual Entry and Contextual Attachments

Status: code complete; production activation is not authorized.

## Human-first contract

Manual structured entry is authoritative. A user with `TOOLING_WRITE` can create or edit the MOS-138 physical tool instance without an LLM, inference service, extraction step, or AI entitlement. AI may later propose values, but it may not block, silently replace, or outrank a saved user value. The existing optimistic `version` remains the concurrency boundary and `atlas_tool_manual_entry_events` records create/update provenance.

The first integrated workflow is **Tooling & CAM preflight → Manual tool record**. The form is intentionally compact: tool type, tool identity, serial/lot, condition, location, and notes. It preserves entered values through validation, stale-write, service, and attachment failures.

## Current-state manual workflow inventory

| Workflow | Current manual capability | MOS-140A disposition |
|---|---|---|
| Customers / Contacts | Existing manual CRUD and canonical Customer→Contact ownership | Retained; no duplicate identity path |
| RFQ / Quotes | Existing structured commercial forms and revisions | Retained; source-document links are not treated as binary storage |
| Jobs / work orders | Existing manual job canvas and production updates | Attachment parent type reserved with a tenant-safe FK |
| Purchasing / receiving | Existing purchase request and supporting workflows | Purchase-request attachment parent supported; receiving-specific screen remains a later integration |
| Invoices / cash receipts | Existing manual financial workflow | No financial mutation added in this story |
| Firearms | Existing serialized-firearm manual workflow and regulatory audit | No regulatory document behavior changed |
| Physical tooling (MOS-138) | Canonical service supported creation but the workspace lacked direct create/edit controls | Direct responsive create/edit added as the pilot |
| WIP bins (MOS-137) | Existing scan, assign, move, and locate flow | No competing attachment or manual-entry subsystem added |
| Lead intake / CRM (MOS-134/139) | Manual lead and shared activity/follow-up primitives exist | Retained; no second CRM activity system |

The principal gap was not absence of all manual CRUD. It was the lack of a reusable binary-attachment boundary and a visible human-first tooling entry route. MOS-140A closes that foundation gap without reworking accepted domain screens.

## Attachment domain

`atlas_contextual_attachments` stores tenant-scoped metadata only:

- canonical attachment identity;
- an explicit parent type and parent ID;
- exactly one typed parent FK for tool instance, tool assembly, purchase request, job, or job operation;
- original filename, MIME type, byte count, SHA-256 checksum, category, description, uploader, and timestamps;
- opaque provider/reference values;
- upload and future processing states, provenance, version, archive state, failure code, and an idempotency-key hash.

`atlas_contextual_attachment_events` is the append-only audit history for upload started/completed/failed, metadata changes, archive, and future processing transitions. Indexes support bounded parent history, uploader history, and pending/failed operational queues. PostgreSQL stores no file body or large binary blob.

Database constraints prevent cross-tenant links for every currently supported parent. Extending the allowlist requires an ordered migration adding the authoritative parent FK; callers cannot invent a free-form parent type.

## Object-storage boundary

`ObjectStorageRouter` selects a server-configured provider. `S3ObjectStorageAdapter`, `AzureBlobObjectStorageAdapter`, and `InMemoryObjectStorageAdapter` implement the same small `put/remove` contract. Provider SDK clients, buckets/containers, encryption, retention, malware scanning, and secrets are injected server-side. Browser requests never select the tenant, provider, bucket/container, storage key, credentials, or a public URL.

Storage references are opaque, server-generated keys derived from a tenant hash plus the canonical attachment ID. Upload is stateful:

1. validate authoritative audit context, capability, parent, media type, and size;
2. create `PENDING` metadata and `UPLOAD_STARTED` audit event;
3. write the binary through the configured adapter;
4. transition to `AVAILABLE`, or to explicit `FAILED` with a safe failure code;
5. retry using the same idempotency key and attachment identity.

The current allowlist is intentionally conservative: JPEG, PNG, WebP, HEIC, PDF, plain text, CSV, DOC/DOCX, and XLSX, up to 50 MB. Production object storage remains disabled until tenant configuration supplies private storage, encryption, retention, backup/recovery, scanning, and least-privilege access.

## UX and transport contract

The tooling workspace exposes **Add photo**, **Take photo**, and **Upload file** next to the saved tool record. Camera capture uses `accept="image/*" capture="environment"`. Loading, empty, unavailable, validation, saving, saved, stale-record, oversize-file, read, upload, and retry states are explicit and announced through live regions. Attachment reads are capped at 25 and stale asynchronous responses are discarded.

The browser transport submits a file envelope to `uploadContextualAttachment`; the server transport decodes it and calls `ContextualAttachmentService.upload`. Encoded browser transport is not persistence. Object bytes must be discarded after the server-side adapter call and must never be written to logs, PostgreSQL, audit details, or repository artifacts.

## Security and future processing

- `AuditContext` is authoritative; browser `TenantID` is neither accepted nor trusted.
- `ATTACHMENT_READ` and `ATTACHMENT_WRITE` are separate capabilities.
- Every repository query includes tenant scope and fixed, parameterized SQL.
- Parent consistency is both service-allowlisted and database-enforced.
- Idempotency keys are stored only as SHA-256 hashes.
- Metadata edits and archives use optimistic concurrency.
- Processing is `NOT_REQUESTED` by default. Future OCR/AI must be optional, tenant-configurable, provenance-recorded, failure-isolated, and unable to overwrite manual fields silently.

## Verification boundary

Focused tests cover manual create/edit, capability and authoritative-tenant rejection, cross-tenant FK rejection, binary exclusion, metadata/audit persistence, size/MIME validation, idempotency, storage failure/retry, stale updates, bounded listing, and S3/Azure/test adapter contracts. Responsive UI source checks cover mobile camera/file entry and all required user states. PostgreSQL 17 validation uses only the disposable MOS-133H database and non-superuser migration/application roles.

Production changes: **NONE**.
