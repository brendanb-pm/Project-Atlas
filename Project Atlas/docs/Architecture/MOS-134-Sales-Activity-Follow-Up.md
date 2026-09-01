# MOS-134 — Sales / Dealer Activity Capture & Follow-Up

## Accepted boundary

MOS-134 extends the existing `atlas_sales_activities` and `atlas_follow_ups` records. It does not introduce a Dealer aggregate or a second task manager. A dealer, prospect business, or ordinary account remains an Atlas Customer; a Contact remains owned by exactly one Customer. Contact name, email, and phone are never used to synthesize identity.

Production changes: **NONE**.

## Canonical activity

`CrmActivityService` accepts authoritative `AuditContext` only and exposes separate read, activity-write, and follow-up-write capabilities. A new activity records Customer, optional same-Customer Contact, owner, type, direction, occurrence time, summary/notes, source/channel, optional RFQ/Quote/Job links, disposition, and version/archive lifecycle fields. Related commercial records are checked against the same tenant and Customer before insertion.

Activity types are `CALL`, `EMAIL`, `TEXT_MESSAGE`, `MEETING`, `NOTE`, `DEALER_VISIT`, `FOLLOW_UP`, `QUOTE_ACTIVITY`, and `OTHER`. This is one channel-neutral history, not separate call, email, or dealer-visit subsystems.

When next action and due time are supplied together, the same transaction creates one linked canonical Follow-Up. No Follow-Up is created from partial input.

## Follow-up lifecycle and audit

Follow-Ups have a named owner, clear next action, due time, optimistic version, and `OPEN`, `COMPLETED`, or `CANCELLED` state. Rescheduling retains the same Follow-Up identity and appends a `RESCHEDULED` event. Completion and cancellation append distinct events; cancellation requires a reason. Due/overdue is derived at read time and is not persisted as a stale status.

Meaningful mutations append `atlas_crm_activity_events` with actor, correlation, resource, previous/new version, timestamp, and bounded JSON details. Activity and Follow-Up history therefore remains distinguishable from the current projection.

## Bounded reads and indexes

Customer and optional Contact timelines use `(occurred_at DESC, sales_activity_id DESC)` cursor pagination with a maximum page of 100. Owner queues use `(due_at, follow_up_id)` ordering. PostgreSQL migration `0009_crm_activity_follow_up` adds stable Customer/Contact timeline, owner/due, related-commercial, and audit-history indexes. Reads remain tenant-scoped and do not hydrate unbounded history.

## Mobile quick entry

`CrmActivityWorkspace.html` implements:

`OPEN CUSTOMER / CONTACT → ADD ACTIVITY → TYPE + SHORT NOTE → OPTIONAL NEXT ACTION / DUE DATE → SAVE`

The responsive surface uses a short form, 48-pixel actions, Customer/dealer language, bounded recent history, explicit “Load older,” and loading, empty, error, stale-save, retry, and late-response protection. The preview is local evidence only and does not activate a production route.

## Verification

- focused PostgreSQL migration, Customer/Contact consistency, tenant isolation, related-entity, owner/due, lifecycle, cursor, authorization, audit, and no-synthetic-Contact tests;
- Apps Script compatibility and workspace source contracts;
- local rendered desktop/tablet/mobile verification;
- opt-in disposable PostgreSQL 17 role-boundary validation;
- proportional secure-edge and repository regression.

MOS-139 lead intake is deliberately excluded. It must reuse these activity, Follow-Up, audit, and queue primitives.
