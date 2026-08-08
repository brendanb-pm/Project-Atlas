# MOS-117A Calendar Provider Framework and Scheduling Compatibility

## Scope and safety boundary

MOS-117A is Atlas Core infrastructure only. It does not authorize a provider, call a calendar API, create an external event, create a trigger, or change a production worksheet. Calendar adapters remain optional; MOS-115 SalesActivity and MOS-116 FollowUp behavior remain usable with every connection absent or disabled.

MOS identity is separate from a connected calendar account. A `UserCalendarConnection` is associated with a MOS `UserID`, but may point to a Google, Microsoft, Apple/iCloud, or no external account. `CredentialReference` is the only credential-related persisted value. Raw OAuth tokens, passwords, app-specific passwords, and provider secrets must never be stored in business worksheets.

For a current VMOS single-tenant deployment, a credential reference may name an approved deployment configuration location after a separate security review. Commercial Atlas requires encrypted, access-controlled per-user credential/token storage outside Sheets. MOS-117A does not create either mechanism.

## Deadline versus scheduled block

`SalesActivities.Next Action Due At` and `FollowUps.Due At` remain CRM deadlines/reminders. They are not appointment start times.

An optional scheduled calendar block is complete only when all three fields exist:

- `Start At`
- `End At`
- `Time Zone` (IANA, for example `America/Los_Angeles`)

A FollowUp with only `Due At` is `LEGACY_DEADLINE_ONLY`; its original meaning is preserved and it cannot automatically become a writable external calendar event. A scheduled FollowUp is `SCHEDULED`. New scheduled blocks require an end after start and a timezone; no duration is inferred. The service retains existing `create(... dueAt ...)`, `reschedule(... dueAt ...)`, and `rescheduleFollowUp` compatibility. `scheduleFollowUp` is the separate additive endpoint for a complete block.

MOS-115 continues to calculate Due Today, Overdue, stale accounts, and sales accountability from `Next Action Due At`. It does not silently create, update, or replace a canonical FollowUp.

## Provider registry

The registry defines capability metadata only. Provider implementations belong to MOS-117B through MOS-117D.

| Provider key | Initial declared posture |
| --- | --- |
| `GOOGLE_CALENDAR` | Writable/two-way capable; push, polling, and version support are planned adapter capabilities. |
| `MICROSOFT_GRAPH_CALENDAR` | Writable/two-way capable; push, delta sync, polling, and version support are planned adapter capabilities. |
| `APPLE_ICLOUD_CALENDAR` | No writable behavior is claimed until a supported adapter is implemented; polling is the only anticipated observation mechanism. |
| `ICAL_PUBLICATION` | Read-only publication only; never two-way synchronization. |

Every declaration includes provider key, create/update, external/deletion observation, two-way reschedule, push, delta, polling, versioning, and read-only publication capabilities. UI and later sync services must consult those declarations rather than assume feature parity.

## Proposed additive storage headers

No worksheet is created by this change. Add these headers only through an approved desktop activation/migration session.

| Store | Existing header(s) retained | Additive header(s) | Compatibility |
| --- | --- | --- | --- |
| `FollowUps` | `Due At` and all MOS-116 headers | `Start At, End At, Time Zone` | Existing records remain deadline-only. |
| `CalendarFollowUpLinks` | All MOS-116 headers | `ConnectionID` | Existing links may have no connection association. |
| `ExternalChangeRequests` | `Requested Due At` and all MOS-116 headers | `Requested Start At, Requested End At, Requested Time Zone` | Legacy review requests retain their Due At value. |
| `UserCalendarConnections` | None | `ConnectionID, UserID, Provider, ExternalAccountID, ExternalAccountDisplayName, ExternalCalendarID, ExternalCalendarDisplayName, ConnectionStatus, CapabilitiesJSON, CredentialReference, TokenExpiresAt, SyncCursor, SubscriptionID, SubscriptionExpiresAt, LastSyncAt, LastSuccessfulSyncAt, LastError, CreatedAt, UpdatedAt` | New, optional store; no core MOS dependency. |

## Activation and migration order

1. Leave calendar integration disabled and verify MOS-115/MOS-116 regression tests.
2. Add the three FollowUps scheduling headers, preserving all existing values and row order.
3. Add the CalendarFollowUpLinks and ExternalChangeRequests headers.
4. Create an empty `UserCalendarConnections` sheet with the exact headers above only when calendar connections are being activated.
5. Configure mappings only after headers are verified. Do not bulk-convert `Due At` values or assign timezones.
6. For a legacy FollowUp, require a human-confirmed Start/End/Time Zone before any later provider projection.
7. Activate a specific provider only in its later story and separate approved deployment review.

## Ownership routing and reassignment foundation

Routing resolves `FollowUp.Owner User ID` to that user's connected writable calendar. If there is no suitable connection, it returns `NOT_CONNECTED`; the FollowUp and any ownership reassignment remain valid. `CalendarFollowUpLinks.ConnectionID` provides the additive association needed for later old-owner reconciliation and new-owner projection. MOS-117A does not migrate, remove, or create external events.

## External change compatibility

External review records retain `Requested Due At` for MOS-116 payloads and add requested Start/End/Time Zone fields for later calendar-block conflicts. Existing correlation IDs, version checks, idempotency, deletion review, and failure isolation remain unchanged.
