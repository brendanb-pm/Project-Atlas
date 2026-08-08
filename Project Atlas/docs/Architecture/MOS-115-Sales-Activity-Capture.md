# MOS-115 Sales Activity and Follow-up Capture

## Main implementation record

Promotion method: **clean reimplementation from beta behavioral reference**. Beta commit `a3c45d2` also changes product-concept tenant/module files and beta documentation, so it was not cherry-picked or merged. Main MOS-115 has no dependency on Atlas tenant profiles, native Kanban, Firearms, Coatings, AI, Asana, notifications, or beta feature flags.

## Domain decision

Existing `Customer` is the canonical dealer/account entity; it already maps CompanyID, Primary Contact, Sales Rep, and Notes. There is no current Company, Contact, Dealer, Opportunity, Task, Reminder, or Activity store to reuse. MOS-115 adds only `SalesActivity`; ContactID and OpportunityID are optional future references and do not create parallel models.

Open lifecycle status is stored as `OPEN`; `FOLLOW_UP_DUE` and `OVERDUE` are derived from Next Action Due At at read/queue time, avoiding conflicting manually maintained date states. WON/LOST persist as `CLOSED_WON`/`CLOSED_LOST`. No stale record is automatically closed.

## Proposed schema and activation

No existing worksheet/header changes are needed. After explicit production approval, create only an empty `SalesActivities` worksheet with:

`SalesActivityID, CustomerID, ContactID, OpportunityID, Activity Type, Activity Datetime, Owner User ID, Created By User ID, Summary, Notes, Outcome, Materials Left, Material Type, Quantity Left, Location, Next Action, Next Action Due At, Follow-up Owner User ID, Status, Created At, Updated At`

Proposed ID convention is `SACT-YY-####`; confirm it before activation. The app uses runtime header mapping and will refuse a write on missing/mismatched headers. It does not create the sheet.

## Permission / audit policy

`sales:write` is required to create. The activity owner may update their activity; `sales:manage` may update/reassign. Pending a real role service, main composes manager access from optional `VMOS_SALES_MANAGERS` configuration; leaving it unset preserves owner-only changes. Created/updated fields and actor IDs preserve audit data. Closing/reopening a future Opportunity is intentionally deferred because no Opportunity model exists.

## UI and metrics

`?sales=1` is a mobile/tablet activity page with account selection, six quick actions, notes, materials, next action/due date, timeline, and queue summary. It never exposes IDs to operators. Dashboard metrics are intentionally deferred until SalesActivities storage is activated and authoritative: contacted this week, due/overdue, conversions, last-contact average, drop-offs, and no-next-action exceptions. Quote totals are never treated as revenue.
