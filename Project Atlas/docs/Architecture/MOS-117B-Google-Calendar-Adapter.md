# MOS-117B Google Calendar Two-way Adapter

## Architecture

MOS-117B implements the Google provider behind the MOS-117A provider, connection, and routing boundaries. `GoogleCalendarProviderAdapter` has no direct `CalendarApp`, OAuth, or credential-storage dependency. It receives an injected gateway with `upsertEvent`, `fetchEvent`, `listChanges`, and `createOrRenewWatch`; production composition is deliberately deferred to an approved activation review.

Calendar authorization is independent of MOS login. A `UserCalendarConnection` must be `CONNECTED`, use provider `GOOGLE_CALENDAR`, identify the user-selected `ExternalCalendarID`, and hold only a `CredentialReference`. The selected calendar is used for every projection; no primary calendar is hard-coded.

## Scheduling projection

Only `SCHEDULED` FollowUps may project: `Start At`, `End At`, and `Time Zone` must all be present and valid. A Due At-only FollowUp returns `NOT_SCHEDULED`; an owner with no connected writable Google calendar returns `NOT_CONNECTED`. Neither outcome changes the MOS FollowUp or blocks CRM work.

The event projection contains MOS-generated title text and the scheduled start/end/timezone. It adds private correlation metadata for loop prevention. `Due At` is a CRM deadline/reminder and is never changed when a calendar block changes. Google title/description edits remain provider-local and never update Customer, SalesActivity, owner, lifecycle, Next Action, or other structured CRM data.

Each projection persists `CalendarFollowUpLinks.ConnectionID`, the selected calendar ID, external event ID, ETag/version, correlation ID, and synchronized MOS version.

## Google-to-MOS changes

Google notifications are signals, not authoritative business payloads. MOS fetches the event through the gateway, then compares it to the link's last synchronized FollowUp version. A compatible move/resize applies only Start At, End At, and Time Zone and appends `FOLLOW_UP_RESCHEDULED_EXTERNALLY`, retaining previous/new schedule, provider, external event ID, actor when supplied, correlation ID, and timestamp. It does not change Due At.

Conflicting ETag or MOS-version changes create an `ExternalChangeRequest` containing both requested scheduling values and provider version; no blind last-write-wins update is performed. Deleting a Google event creates a pending review request and never deletes, completes, or cancels the MOS FollowUp.

## Watch and recovery strategy

Watch metadata is stored on `UserCalendarConnection` using the existing `SubscriptionID` and `SubscriptionExpiresAt` fields. A watch notification fetches authoritative event state. `recover()` uses provider polling/change-listing plus the stored `SyncCursor` to recover missed notices, delayed delivery, expired channels, and temporary outages. `renewWatch()` records a renewed subscription or an actionable error; it creates no real watch in this codebase.

Correlation IDs, last-origin metadata, and idempotent sync-event lookup prevent replay and feedback loops. Gateway failures are recorded as failed synchronization results; MOS FollowUps remain intact.

## Reassignment behavior

MOS-117B routes a projection using the current FollowUp owner. A later ownership-change service may use `ConnectionID` to reconcile the prior projection and create a new one for the new owner. If the new owner has no writable Google connection, reassignment still succeeds in MOS and the calendar state is `NOT_CONNECTED`. No attendee-management behavior is used.

## Production activation prerequisites and rollback

1. Complete the MOS-117A additive worksheet headers and mappings; do not migrate Due At data.
2. Keep `VMOS_CALENDAR_FOLLOWUP_ENABLED` disabled until a security review approves the gateway composition.
3. Create a Google OAuth application and secure token storage outside business worksheets; store only approved credential references in `UserCalendarConnections`.
4. Let each user explicitly choose and authorize a Google calendar.
5. Test a non-production connection with scheduled FollowUps, watch recovery, conflict, and deletion-review fixtures.
6. Enable only the reviewed Google connection path. The prior deployment-wide provider/calendar properties are legacy compatibility inputs, not the primary per-user routing model.

Rollback: disable the calendar integration/connection and stop gateway/watch processing. MOS-115, FollowUps, deadlines, scheduling data, links, events, and review requests remain available; no FollowUp is deleted.
