# MOS-139 — Unified Lead Intake & Sales Callback Queue

## Accepted boundary

MOS-139 adds one tenant-scoped Lead identity for website, email import, phone, dealer referral, manual, and social intake. It does not add provider integrations, send email/text, or create a lead-only CRM activity system. Production changes: **NONE**.

## Intake and identity

Every intake supplies a source-specific idempotency key. Atlas stores SHA-256 hashes of the scoped key and normalized payload, so exact replay returns the existing Lead and conflicting replay fails closed. Lead email, phone, company, and contact-name fields are evidence, not Customer or Contact identity. No uniqueness or fuzzy-match rule silently merges people.

Lead state is `NEW`, `QUALIFIED`, `CALLBACK_REQUIRED`, `CONTACTED`, `QUOTED`, `WON`, or `LOST`. A bounded transition graph prevents terminal reopen and unsupported skips. `atlas_lead_events` retains actor, correlation, previous/next status, version, timestamp, and details for meaningful mutations.

## Reused MOS-134 primitives

`LeadIntakeService.recordActivity` delegates to the canonical `CrmActivityService`. Migration `0010_unified_lead_intake` adds optional Lead references to `atlas_sales_activities` and `atlas_follow_ups`, preserving the same activity types, audit events, optimistic lifecycle, due/overdue derivation, and owner queue. A callback is therefore a normal MOS-134 Follow-Up linked to a Lead, not a second task subsystem.

## Intentional conversion

Conversion requires `LEAD_CONVERT`, an expected Lead version, and an existing same-tenant Customer. An optional Contact must already belong to that Customer. Name, email, phone, or UI fields never create a Contact. Conversion records the Customer/Contact references, actor/time, `WON` state, incremented version, and append-only event atomically.

## Queue and performance

The default queue is bounded to 100 rows and prioritizes `CALLBACK_REQUIRED`, then `NEW`, then `QUALIFIED`, with stable creation/Lead-ID ordering. Optional status, source, and owner filters remain tenant-authoritative. PostgreSQL indexes cover workflow queue, source recency, converted Customer history, Lead activity, Lead due Follow-Ups, and Lead audit history.

## Operator experience

`LeadIntakeWorkspace.html` provides compact manual intake and a responsive callback-first queue with source/status filters, 48-pixel actions, loading, empty, retry, stale-save, idempotent replay, and late-response states. “Add activity,” “Set callback,” and “Convert” are explicit actions. The local preview is verification evidence only; no production route is activated.

## Verification

- all six intake sources, exact replay, conflicting replay, tenant isolation, workflow graph, callback priority, capability, audit, shared activity/follow-up, and explicit conversion tests;
- no-synthetic-Contact and cross-Customer Contact rejection;
- local rendered desktop/tablet/mobile verification;
- opt-in disposable PostgreSQL 17 validation with separate migration/application roles;
- proportional secure-edge and repository regression.
