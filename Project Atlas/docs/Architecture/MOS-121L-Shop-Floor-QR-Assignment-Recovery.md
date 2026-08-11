# MOS-121L Shop-Floor QR Assignment Durable Recovery

Release channel: MAIN

Baseline: `bc644fbdb5528adb89a5f6e50d756b41b0ea0cbc`

## Remediation

`configureShopFloorJob` now uses the existing MOS-121J/K security operation ledger with `SHOP_FLOOR_DOMAIN_EVENT` recovery. The configuration service holds a narrow script lock while it checks existing assignment state, applies any initial workflow status, creates the opaque QR token, checkpoints the resulting canonical state, and appends the existing `WORKFLOW_ASSIGNED` and `QR_ASSIGNED` JobEvents. It performs no provider or network work while holding that lock.

The checkpoint is written only after all intended canonical configuration state exists. It dynamically records:

- Job resource ID;
- workflow ID and version;
- original and assigned Job status;
- required event types;
- SHA-256 fingerprint of the opaque token;
- canonical mutation time and bounded result through the shared ledger.

Tenant, operation, correlation, original authoritative user/principal, capability, attempt, failure, lease, and recovery metadata remain in the shared `SecurityAuditEvents` record. The raw token is not copied into the ledger, recovery details, JobEvents, client errors, or recovery output. The high-entropy token fingerprint permits an exact server-side comparison with the canonical `JobQrTokens` store without becoming a usable QR bearer value.

## Recovery and races

Recovery runs through the private, tenant-scoped `SECURITY_OPERATION_RECOVERY` system context and `SECURITY_RECOVER` capability. It does not accept client-selected system identity or resource context. The original human remains the JobEvent actor; recovery actor and correlation remain separate ledger attribution.

For configuration recovery, the service proves that the recorded Job exists, an exact token fingerprint belongs to that Job and workflow, and any recorded workflow assignment still matches current Job state. It then checks events by the original operation correlation plus event type and appends only missing events with deterministic recovery IDs. It never creates, rotates, revokes, or reactivates a token and never repeats the Job status mutation.

The shared lock makes original configuration and event recovery mutually exclusive. Two recovery attempts, a late original event append, and an event-already-present condition converge on the existing event. A revoked or rotated original token remains usable as historical proof when its canonical token record remains; no token is reactivated. A missing token, fingerprint mismatch, wrong Job/workflow, or changed workflow state becomes `RECOVERY_REQUIRED` review rather than guessed repair.

## Path audit

The browser-callable `configureShopFloorJob` path was the demonstrated durable QR-assignment gap and is now covered. Status transition/problem/block commands already use command IDs, canonical checkpoints, QR revalidation under lock, and `SHOP_FLOOR_DOMAIN_EVENT` recovery. Private QR rotation and revocation methods are not callable application endpoints; before either receives a future authorized endpoint, it must receive its own operation-ledger recovery contract. Their previously documented private revoke/use locking asymmetry remains deferred by the MOS-121L scope.

## Persistence and performance

No new worksheet or header is required. MOS-121L reuses the MOS-121K `SecurityAuditEvents`, `JobQrTokens`, and `JobEvents` schemas. `JobEvent.Command ID` stores the authoritative configuration correlation, which was already part of the schema.

The normal configuration path adds one checkpoint ledger update, one SHA-256 calculation, and a narrow configuration lock. Recovery adds one Job lookup, one bounded-by-Job token lookup, one JobEvent lookup, and only the missing append(s). The Sheets adapter currently implements the Job-scoped token lookup by filtering its existing list; real Apps Script/Sheets measurements remain required before performance QA can pass. No polling, provider call, or broad unrelated refactor was added.

No production schema, deployment, identity, QR token, traveler, or external provider is changed by MOS-121L. MOS-121H must be rerun independently; this remediation does not declare MOS-121 complete.
