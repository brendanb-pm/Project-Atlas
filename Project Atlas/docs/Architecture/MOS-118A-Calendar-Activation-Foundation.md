# MOS-118A Calendar Activation Foundation

## Durable synchronization boundary

`CalendarSyncEventRepository` is the provider-neutral durable implementation of
the `syncEvents` contract used by `CalendarFollowUpSyncService`. Inbound provider
changes and outbound projections record provider, FollowUp/connection/event
linkage, operation/change type, correlation, MOS/provider versions, outcome,
details, recovery requirement, timestamps, and activation measurements.

The production UI reconciliation path now uses this repository rather than a
no-op. Test-local in-memory repositories remain valid. Calendar synchronization
requires the additive mapping and fails closed when it is absent; MOS FollowUps,
CRM deadlines, scheduling without a provider, and iCal/no-calendar operation do
not require this store.

Inbound correlation lookup and mutation run under the Apps Script lock so two
concurrent deliveries cannot both mutate MOS. Both inbound and outbound paths
return an already-persisted provider/correlation result without repeating the
mutation. Failed or review-required results persist details and
`Recovery Required`; cleanup failures continue in `ExternalChangeRequests` with
their prior connection/event context.

## Schema

Create only in the approved non-production workbook:

`CalendarSyncEvents`: `CalendarSyncEventID, Provider, FollowUpID, ConnectionID, External Event ID, Operation, Change Type, Correlation ID, MOS Version, External Version, Result, Details, Provider Duration Ms, Repository Duration Ms, Total Duration Ms, Recovery Required, Occurred At`

Also verify the complete FollowUps, FollowUpEvents, CalendarFollowUpLinks,
ExternalChangeRequests (including MOS-117E-5 cleanup fields), and
UserCalendarConnections headers in the Desktop Activation Checklist. No legacy
record is rewritten.

## Measurement foundation

Each durable sync event captures provider duration, correlation-lookup/storage
duration, and total service duration in milliseconds. Later provider validation
must combine these records with client/endpoint timestamps to distinguish MOS,
repository, provider, and rendered latency. Correlation lookup reads only the
mapped provider/correlation column span and the matching row, avoiding a full
event payload read. No arbitrary SLA is established by MOS-118A.

## Non-production activation sequence

1. Keep `VMOS_CALENDAR_FOLLOWUP_ENABLED=false`; run all regressions.
2. Back up and visually verify the isolated workbook and exact headers.
3. Add `CalendarSyncEvents` and missing additive MOS-117 fields only in that
   workbook; update `VMOS_FOLLOW_UP_MAPPING` if its names differ.
4. Validate insert/read/correlation replay with fake provider fixtures.
5. Configure reviewed gateway composition and secure credential references,
   still without a live account.
6. Inject slow, failed, duplicate, deletion, conflict, cleanup and reassignment
   cases; inspect durable outcomes and measurement records.
7. Rehearse rollback. Only then request the separate MOS-118B authorization.

Stop if headers/mappings differ, correlation events are not durable, raw
credentials enter business storage, provider calls repeat on replay, ordinary
MOS use depends on connectivity, or rollback requires data repair.

## Rollback

Disable writable synchronization, stop any non-production provider processing,
and leave canonical FollowUps, schedules, deadlines, links, sync/audit events,
and review requests intact. Do not delete the additive store. Reconcile or
acknowledge outstanding test events, verify no-calendar CRM operation, and
re-enable only after authoritative reconciliation. No production resource is
changed by MOS-118A.
