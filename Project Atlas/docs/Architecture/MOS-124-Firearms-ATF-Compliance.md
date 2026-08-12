# MOS-124 — Firearms / ATF Compliance Domain

Status: code-complete foundation; legal and live-operational acceptance pending. This design is additive and tenant/module scoped. It does not claim that Atlas replaces an ATF-required form, eForms, Form 4473 product, or legally required recordkeeping system.

## Functional boundary

The `FIREARMS` specialty module adds a serialized-item master, append-only regulatory event history, external-FFL directory, reconciliation queue, bounded inspection export, and practical intake, Job assignment, custody movement, disposition, correction, and recovery workflows. Firearms remain distinct from ordinary Parts. Jobs remain the canonical work-order entity.

Supported intake sources are Customer, existing inventory, and external FFL. Supported dispositions are to a linked Customer or external FFL. Every relationship is tenant checked. Exact manufacturer/importer/normalized-serial duplicates are rejected deterministically; same-serial candidates outside that exact key remain visible for reconciliation rather than being silently merged.

## Domain and persistence

`SerializedFirearms` is the current-state master. Required additive headers are:

`FirearmID, TenantID, Manufacturer, Importer, Model, Serial Number, Serial Normalized, Caliber/Gauge, Firearm Classification, Acquisition Date, Acquisition Source Type, Acquisition Source ID, Acquisition Source Name, Disposition Date, Recipient Type, Recipient ID, Recipient Name, CustomerID, ExternalFFLID, JobID, Custody Location, Custody Status, Lifecycle Status, Version, Reconciliation Status, Pending Event ID, Pending Event Type, Pending Event JSON, Created At, Created By, Updated At, Updated By, Security Operation ID, Security Operation Fingerprint`

`FirearmRegulatoryEvents` is append-only. Required headers are:

`FirearmEventID, TenantID, FirearmID, Event Type, Occurred At, Actor UserID, Correlation ID, Previous JSON, Details JSON, Correction Of Event ID, Reason, Recovery Actor UserID, Recovered At`

`ExternalFFLs` supports tenant-scoped partner lookup. Required headers are:

`ExternalFFLID, TenantID, Display Name, License Reference, Premises Address, Status, Notes, Created At, Created By, Updated At, Updated By`

Initialization is an explicit ADMIN_CONFIG action and never runs on ordinary application startup. It creates only missing sheets and refuses incompatible existing headers. Production activation must provision and validate these sheets separately; this story did not mutate a workbook.

Stable firearm IDs are server allocated. The exact duplicate key is tenant + normalized manufacturer + normalized importer + normalized serial. Normalization is used for matching only; the operator-entered serial remains visible unchanged.

## Lifecycle, audit, and corrections

The lifecycle begins at `ACQUIRED`, may gain Job assignment and custody changes, and reaches `DISPOSED`. Current custody status/location are visible. History events include `ACQUIRED`, `JOB_ASSIGNED`, `CUSTODY_MOVED`, `DISPOSED`, and `CORRECTED`.

Normal correction does not rewrite event history. Only an allowlisted current-state field can be corrected, a reason is mandatory, and the event stores previous values, new values, authoritative actor, correlation, and an optional corrected-event reference. Lifecycle, disposition state, version, tenant, and audit fields cannot be rewritten through correction.

Every canonical change writes a deterministic pending-event checkpoint into the serialized master before attempting its required event append. On event failure the record is blocked in `EVENT_PENDING`; reconciliation validates tenant/resource/event identity and reconstructs only the missing event. Repeated recovery is idempotent. Original actor and recovery actor remain distinct. No raw QR or provider secret is stored.

## Authorization and services

Capabilities are `FIREARMS_READ`, `FIREARMS_WRITE`, `FIREARMS_CUSTODY`, `FIREARMS_DISPOSE`, `FIREARMS_CORRECT`, and `FIREARMS_RECONCILE`. Manager and Admin defaults receive the complete set; Shop Operator receives read and custody movement. UI visibility is module and capability aware, while the server remains authoritative.

Callable operations are `getFirearmsWorkspace`, `intakeSerializedFirearm`, `assignFirearmToJob`, `moveFirearmCustody`, `disposeSerializedFirearm`, `correctSerializedFirearm`, `reconcileSerializedFirearm`, `exportSerializedFirearms`, and ADMIN-only `initializeFirearmsPersistence`. All writes pass through Atlas authorized execution, authoritative AuditContext, safe errors, abuse screening, tenant checks, version checks, and an explicit mutation-recovery classification. Reads and directories are bounded to 100 records; history is bounded to the latest 100.

## Operator workspace

The routed Firearms workspace provides search, bounded results, selected-record custody/lifecycle context, acquisition and disposition history, customer/FFL/Job relationship selectors, intake, Job assignment, custody movement, disposition, corrections, reconciliation attention, and CSV inspection export. It uses neutral Atlas terminology and is hidden when the module is disabled. It does not depend on Asana.

## Compliance assumptions and required review

The software intentionally records more context than an ordinary Job, preserves history, and fails safely. These controls are not a legal determination.

LEGAL/COMPLIANCE REVIEW REQUIRED:

- Which acquisition/disposition fields, entry deadlines, approved abbreviations, and record ordering apply to each Vitality FFL type and activity.
- Whether the proposed electronic history, correction method, inspection export, backups, retention, access, and any required variance satisfy applicable ATF rules.
- Manufacturer/importer identification and serial-number uniqueness rules for received, manufactured, remanufactured, imported, privately made, or otherwise specially classified firearms.
- When gunsmithing receipt/return is an acquisition/disposition and what customer identity or license evidence must be retained.
- Verification and retention policy for customer identity, external FFL status, license references, premises addresses, and recipient eligibility.
- Applicability and integration of Form 4473, NFA/eForms, multiple-sale reporting, state/local rules, and other mandated systems. MOS-124 does not implement those forms or submissions.
- Physical custody/location terminology, lost/stolen/escalation processes, access roles, and inspection procedures.
- Review and controlled migration/reconciliation of any legacy paper, spreadsheet, or third-party records.

## Acceptance and activation

Automated coverage verifies stable identity, exact duplicate rejection, cross-tenant denial, lifecycle/version enforcement, non-destructive correction, authoritative actor history, deterministic event recovery, idempotent replay, bounded export, module isolation, capability classification, and existing Atlas regression behavior.

Live activation requires legal/compliance sign-off, approved field/configuration policy, additive workbook provisioning and backup validation, representative legacy reconciliation, named authorized operators, ENFORCED identity, controlled Apps Script/Sheets timing, rendered device QA, inspection-export review, and a rehearsed rollback that disables the module without deleting regulatory records.
