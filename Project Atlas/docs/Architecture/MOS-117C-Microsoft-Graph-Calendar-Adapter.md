# MOS-117C Microsoft 365 / Outlook Calendar Two-way Adapter

## Architecture and authorization

MOS-117C implements `MICROSOFT_GRAPH_CALENDAR` behind the MOS-117A provider registry and the existing generic FollowUp synchronization service. `MicrosoftGraphCalendarProviderAdapter` receives an injected Graph gateway only; no Azure/Entra application, Microsoft credential, Graph client, or live tenant is configured in this repository.

MOS sign-in and Microsoft Calendar authorization are separate. Each `UserCalendarConnection` records a selected Microsoft `ExternalCalendarID` and a `CredentialReference`, never an access token, refresh token, client secret, or password. The FollowUp owner routes to their own connected Microsoft calendar. A user with no writable Microsoft connection gets `NOT_CONNECTED`; MOS work continues without an event.

## Projection and scheduling behavior

Only FollowUps with Start At, End At, and Time Zone project. The generated Graph projection contains subject, start/end/timezone, and MOS private extension metadata for identity/correlation. A deadline-only FollowUp is `NOT_SCHEDULED`. `Due At` remains a CRM deadline/reminder and does not change when either MOS or Outlook changes the scheduled block.

The corresponding `CalendarFollowUpLink` retains ConnectionID, chosen calendar ID, external event ID, Graph change key, correlation, and MOS synchronized version. Outlook subject/body edits remain provider-local; they never overwrite Customer, SalesActivity, Next Action, owner, lifecycle, or opportunity data.

## Notifications, delta recovery, and subscriptions

Graph change notifications are treated as signals. MOS fetches authoritative event state through the gateway, compares it with the last synchronized FollowUp version, then applies a safe scheduling-only change or creates an `ExternalChangeRequest`.

Delta synchronization uses `UserCalendarConnection.SyncCursor` to discover missed/delayed notifications and updates it only after a recovery pass. Subscriptions use `SubscriptionID` and `SubscriptionExpiresAt`. Renewal failure records a connection error; an authorization-revoked error sets the connection to `ATTENTION_REQUIRED`. Delta/provider failures return `FAILED` and do not change the FollowUp.

## Reconciliation safety

An Outlook move/resize updates only Start At, End At, and Time Zone, then appends `FOLLOW_UP_RESCHEDULED_EXTERNALLY` with previous/new scheduling, provider, external event identity, actor when supplied, correlation ID, and timestamp. Correlation and prior-event metadata prevent replay and MOS-originated feedback loops.

Graph change-key or MOS-version conflict creates a reviewable `ExternalChangeRequest` rather than using last-write-wins. An external deletion creates the same reviewable request; it never completes, cancels, or deletes the MOS FollowUp. Final reconciliation UX remains MOS-117E.

## Google coexistence and reassignment

The provider registry and owner routing select the adapter by each user's connection. Josh may use Google while Brendan uses Microsoft without shared adapter state. iCal remains read-only publication. Future FollowUp reassignment may use ConnectionID to reconcile an old projection and create a new owner projection; reassignment itself is never blocked by a missing calendar connection and is not attendee management.

## Activation and rollback

1. Complete MOS-117A's approved additive headers/mappings and leave calendar sync disabled by default.
2. Register an approved Azure/Entra application and implement a reviewed Graph gateway outside business worksheets.
3. Store per-user tokens in approved secure storage outside Sheets and save only CredentialReference.
4. Let every user explicitly authorize and choose a Microsoft calendar.
5. Test event projection, notification fetch, delta recovery, subscription expiry, conflict, deletion review, revocation, and rollback in a non-production environment.
6. Enable only approved connections after a separate deployment review.

Rollback disables the connection/gateway/subscription processing. MOS CRM, FollowUps, deadlines, schedules, audit events, links, and pending review requests remain intact.
