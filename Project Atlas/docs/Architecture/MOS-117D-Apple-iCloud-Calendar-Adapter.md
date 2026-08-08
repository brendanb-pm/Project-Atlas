# MOS-117D Apple / iCloud Calendar Adapter

## Selected integration architecture

MOS-117D uses a CalDAV-compatible injected gateway. This keeps Atlas Core independent of CalDAV details while matching the conservative capability model appropriate for iCloud-style calendar access: calendar discovery/selection, event create/update, ETag-aware reconciliation, and polling. It does not claim push notifications, Graph-style delta synchronization, or a native Apple authorization mechanism.

`APPLE_ICLOUD_CALENDAR` is writable only when its gateway supports the declared operations. Its provider capabilities are: create/update/change/deletion observation, two-way scheduled-block reconciliation, polling, and versioning; push notifications and delta synchronization are explicitly false. `ICAL_PUBLICATION` remains a separate read-only publication provider and is not an iCloud synchronization substitute.

## Connection, security, and calendar selection

MOS identity is independent of Apple/iCloud authorization. A FollowUp routes from owner to that owner's `UserCalendarConnection`, then to the explicitly selected Apple calendar. No default calendar is hard-coded. If no writable Apple connection exists, the result is `NOT_CONNECTED` and MOS CRM/FollowUp work continues normally.

Only `CredentialReference` is persisted. An Apple ID password, app-specific password, session credential, token, and provider secret must remain in approved secure credential storage behind the gateway. MOS-117D neither configures an Apple account nor stores credentials.

## Event and scheduling behavior

Only a complete Start At, End At, and Time Zone block can project. The projection contains generated title text, the schedule, timezone, and private MOS correlation metadata. `Due At` remains a CRM deadline/reminder; neither MOS schedule changes nor Apple schedule changes alter it.

An externally reconciled move/resize applies only Start At, End At, and Time Zone through the existing versioned FollowUp service, appending `FOLLOW_UP_RESCHEDULED_EXTERNALLY`. Free-text title/notes remain provider-local and cannot update Customer, account, SalesActivity, Next Action, owner, lifecycle, or opportunity state.

## Polling and reconciliation

No production polling trigger is created. A future scheduler calls `poll(connectionId)`, which requests only incremental provider changes since `SyncCursor` where the gateway can safely provide them, fetches each linked event authoritatively, then applies a safe change or creates review. It updates `SyncCursor`, Last Sync, and Last Successful Sync only after a successful poll.

Polling frequency must be configured at activation, considering provider limits, connected-user count, linked FollowUp count, acceptable stale-change tolerance, Apps Script execution limits, and future commercial Atlas scale. Start conservatively; avoid querying every calendar event when a gateway supports sync tokens or ETag filtering.

Correlation metadata and sync events prevent duplicate processing/feedback loops. ETag/version conflicts create `ExternalChangeRequest`; there is no blind last-write-wins. An externally deleted event likewise creates a review request and never deletes, completes, or cancels the MOS FollowUp. Gateway/poll failure records connection error state and leaves MOS data untouched.

## Multi-provider and reassignment behavior

Connections route independently: one deployment can have Google, Microsoft Graph, Apple/iCloud, and no-calendar users at once. Future reassignment can use the stored ConnectionID to reconcile an old projection and project to the new owner's selected provider. Reassignment remains valid even without a calendar and is never attendee management.

## Activation and rollback

1. Complete MOS-117A's approved additive headers/mappings; do not convert Due At values.
2. Implement and security-review the production CalDAV/iCloud gateway, including discovery, selected-calendar access, ETag handling, and safe incremental polling.
3. Store Apple credentials/app-specific passwords only in secure credential storage outside Sheets; save a CredentialReference only.
4. Let each user authorize/select a calendar and validate in non-production with creation, polling, conflict, deletion, outage, and rollback fixtures.
5. Choose a conservative polling interval and only then create an approved operational scheduler.

Rollback disables the Apple connection and polling gateway. MOS data, deadlines, schedules, links, audit events, and review requests remain available. Known limitation: live iCloud authorization, CalDAV endpoint behavior, rate limits, and incremental-change support require validation during the separate activation review.
