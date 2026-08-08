# MOS-115 Sales Activity and Follow-up Capture

## Existing-model decision

`Customer` is the existing canonical CRM account and is reused for dealer/customer accounts. The current mapping also has CompanyID, Primary Contact, Sales Rep, and Notes. There is no mapped Company, Contact, Dealer, Opportunity, Task, Reminder, Activity, or timeline store. No parallel Dealer/Account model is created. `ContactID` and `OpportunityID` remain nullable future references; an Opportunity store is not introduced in MOS-115.

## Incremental implementation

1. Add `SalesActivity` service/repository interface and a proposed, uninitialized `SalesActivities` mapping.
2. Enforce the open-interaction next-action rule and explicit manager/owner authorization policy.
3. Add mobile-first capture, account timeline, follow-up queue, and module-aware CRM/dashboard descriptors after an approved storage composition root exists.
4. Activate only after an authorized operator creates the approved empty store; no existing customer header changes are needed.

## Proposed migration

New worksheet only, created empty after separate approval: `SalesActivities`.

`SalesActivityID, CustomerID, ContactID, OpportunityID, Activity Type, Activity Datetime, Owner User ID, Created By User ID, Summary, Notes, Outcome, Materials Left, Material Type, Quantity Left, Location, Next Action, Next Action Due At, Follow-up Owner User ID, Status, Created At, Updated At`

PK: SalesActivityID (`SACT-YY-####` proposed; requires ID-convention approval before activation). FK: CustomerID required; ContactID/OpportunityID optional. Records are retained; correcting an activity uses a controlled update/audit policy rather than hard deletion.

## API and permissions

Proposed service commands: `create(input, actor)`, `update(id, changes, actor)`, `listTimeline(customerId)`, `followUpQueue(now)`, and `accountFollowUpHealth(customerId, now)`. UI never calls Sheets. An injected authorization policy requires `sales:write` to log; only activity owner or `sales:manage` may update/reassign/close. Existing production user/role services do not yet exist, so the policy is an explicit dependency, not a fabricated account model.

## UX and dashboard

The prototype supports immediate mobile/tablet capture with six large quick actions, a PDX Arsenal timeline, and Due Today/Overdue/Upcoming queue. Normal entry contains activity, outcome, concise notes, materials, next action, due date, and owner. Command Center additions are only eligible when CRM + authoritative SalesActivities data is enabled: contacted this week, due, overdue, open opportunities, conversions, average last contact, drop-offs, and no-next-action exceptions. Quote totals are never labeled revenue.

## Staleness

Open accounts are `REMINDER` at 7 days, `STALE` at 14, and `SERIOUSLY_STALE` at 30. They are never automatically closed. WON/LOST closes the activity/opportunity path without requiring a next action; managers may explicitly close or reopen when an Opportunity model is later approved.

## Manual acceptance fixture

Create Customer `PDX Arsenal`; log `IN_PERSON_VISIT`, `LEFT_MATERIALS`, `BUSINESS_CARDS`, quantity `25`, “Spoke with counter staff. Owner unavailable.”, next action “Call and ask for owner,” due Aug 12, owner Josh. Confirm it appears on the account timeline and Upcoming queue, and that attempting the same open activity without an action/due date is rejected.
