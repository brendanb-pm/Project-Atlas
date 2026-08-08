# MOS-116 Two-way Calendar Follow-up Synchronization

## Architecture

MOS owns FollowUp identity, lifecycle, version, and audit history. A generic FollowUp is required because MOS-115 has SalesActivity next-action fields but no independent follow-up/task identity that a calendar can safely link to. FollowUp links Customer and optional SalesActivity; it is not a replacement or duplicate of either.

Calendar adapters may request a due-date reschedule. They never own lifecycle. MOS calendar integration is disabled by default; SalesActivity and FollowUp continue to work without any provider.

## Proposed stores — no sheet is created by this change

- `FollowUps`: `FollowUpID, CustomerID, SalesActivityID, Title, Due At, Owner User ID, Status, Version, Created At, Updated At, Completed At, Cancelled At`
- `FollowUpEvents`: `FollowUpEventID, FollowUpID, Event Type, Occurred At, Actor, Correlation ID, Previous Version, New Version, Details`
- `CalendarFollowUpLinks`: `CalendarFollowUpLinkID, FollowUpID, Provider, Calendar ID, External Event ID, External Version, Last Sync Origin, Last Correlation ID, Last Synced FollowUp Version, Created At, Updated At`
- `ExternalChangeRequests`: `ExternalChangeRequestID, Provider, FollowUpID, External Event ID, Change Type, Requested Due At, External Version, Status, Details, Detected At, Resolved At, Resolved By, Resolution`

All are append/audit-oriented and retained; no hard deletion.

## Capability declarations

Google Calendar declares `twoWaySync`, deletion observation, and version support. The adapter only receives an injected gateway; development tests use a fake, and no CalendarApp call is made. iCal declares `readOnlyPublication=true` and `twoWaySync=false`; it may publish a feed but can never be labelled or enabled as two-way synchronization.

## Reconciliation and conflicts

Incoming reschedules require a provider/external event/correlation ID. Replayed correlation IDs return the first result. A matching MOS version reschedules the canonical FollowUp and appends audit events. A mismatching version becomes a pending ExternalChangeRequest, preserving both sides for human review. Last correlation/origin values prevent feedback loops.

Calendar deletion does not alter FollowUp status. It creates `PENDING_REVIEW` with exactly four MOS actions: `KEEP_FOLLOW_UP`, `RESCHEDULE`, `MARK_COMPLETE`, and `CANCEL_FOLLOW_UP`. Each resolved action is version-checked and audited.

## Configuration and activation

Default: `VMOS_CALENDAR_FOLLOWUP_ENABLED=false` or absent. Required only when enabling: `VMOS_CALENDAR_FOLLOWUP_PROVIDER=GOOGLE_CALENDAR` and `VMOS_CALENDAR_FOLLOWUP_CALENDAR_ID`. Calendar authorization, watch/poll scheduling, and gateway composition require a separate approved activation review. Do not configure a user/calendar identifier in source code.

## Manual acceptance procedure

Using fake or test calendar data, create a MOS FollowUp linked to the PDX Arsenal SalesActivity; push it to a fake calendar; change its due date externally and verify MOS updates/audits it; replay the change and verify no duplicate; delete externally and verify only a pending review request; choose Keep, Reschedule, Mark Complete, and Cancel in separate fixtures. Verify disabled configuration leaves FollowUps functional and throws a clear calendar-disabled error only when sync is requested.
