# Domain Model Catalog — Proposed Integrations

These are proposed durable stores only. This sprint does not create worksheets or configure their repositories.

| Store | Exact headers | PK / key relationships | Purpose |
|---|---|---|---|
| ExternalBoardMappings | `MappingID, Provider, ExternalProjectID, ExternalProjectName, WorkflowID, Enabled, Created At, Updated At` | PK MappingID; WorkflowID → configured workflow | One external board/project to VMOS workflow binding. |
| WorkflowStatusMappings | `StatusMappingID, MappingID, ExternalSectionID, ExternalSectionName, VMOSStatus, CustomerFacingStatus, NotificationRuleID, Sequence, Enabled` | PK StatusMappingID; MappingID FK; NotificationRuleID FK | Configurable board-section to canonical-status map. |
| ExternalSyncEvents | `SyncEventID, Provider, ExternalTaskID, JobID, Event Type, Requested External State, Requested VMOS State, Result, Error, Occurred At, Actor, Correlation ID` | PK SyncEventID; JobID FK; unique Provider + Correlation ID | Append-only inbound/outbound reconciliation audit. |
| CustomerNotificationRules | `NotificationRuleID, WorkflowID, VMOSStatus, Channel, TemplateID, Delay Minutes, Dedupe Window Minutes, RequiresApproval, Enabled` | PK NotificationRuleID; WorkflowID FK | Status notification policy. |
| CustomerCommunicationEvents | `CommunicationEventID, JobID, CustomerID, NotificationRuleID, Status, Channel, Recipient, Subject, Body Snapshot, Triggered At, Scheduled At, Sent At, Provider Reference, Error, Created By` | PK CommunicationEventID; JobID, CustomerID, NotificationRuleID FKs | Durable notification queue/audit; no hard deletion. |
| FirearmsWorkOrders | `FirearmsWorkOrderID, JobID, CustomerID, Intake Method, Return Method, Preferred Contact, Item Type, Manufacturer, Model, Caliber, Serial Or Identifying Marks, Status, Estimated Completion, Created At, Created By` | PK FirearmsWorkOrderID; JobID and CustomerID FKs | Firearms module projection; Job remains canonical work-order identity. |
| FirearmsItems | `FirearmsItemID, FirearmsWorkOrderID, OEM Or Aftermarket, Existing Finish, Previously Modified, Prior Modification Notes, Customer Reference, Created At` | PK FirearmsItemID; FirearmsWorkOrderID FK | Item-specific intake detail. |
| FirearmsIntakeDocuments | `FirearmsIntakeDocumentID, FirearmsWorkOrderID, DocumentID, Association Type, Capture View, Notes, Created At` | PK FirearmsIntakeDocumentID; FirearmsWorkOrderID and DocumentID FKs | References retained originals through the VMOS storage abstraction. |

## Interface contracts

`ExternalBoardProvider`: `requestCreate(payload)`, `requestMove(payload)`, `requestReconcile(payload)`. `WorkflowTransitionRequest`: provider, externalTaskId, externalSectionId, correlationId, actor, occurredAt. `CustomerNotificationProvider`: later sends an already-approved/scheduled communication event and returns only a provider reference/result.

No interface may update a VMOS job directly. Board moves are passed to `ExternalBoardSyncService`, which validates through the Atlas Workflow Engine before it writes a Job status and appends an event. The Firearms Module supplies a Firearms workflow configuration; it is not a dependency of the board adapter.
