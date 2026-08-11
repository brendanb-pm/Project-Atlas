# MOS-122H UI/UX Acceptance Preparation

MOS-122 is code-complete through the acceptance-preparation boundary, but is not yet live/rendered accepted. This package distinguishes test evidence from deployed operator evidence.

## Routed surface inventory

| Route | Template | Primary acceptance workflows |
|---|---|---|
| Command Center | `Index` | persona attention, partial sources, limited/zero capabilities |
| Customers / RFQs / Quotes / Jobs / Invoices | `Index` current routed entity view | navigation, bounded next-story migration, empty/error behavior |
| Sales Activity | `SalesActivity` | Customer workspace, Visit/Call/Text/Email, material drop, next action, failure preservation |
| Follow-Ups | `CalendarFollowUps` | queue, deadline/schedule clarity, no-calendar state, uncertain outcome |
| Shop Floor | `ShopFloor` | scan/lookup, current work, transition, problem/report/recovery |
| Operations Dashboard | `OperationsDashboard` | manager workload and blocked attention |
| Floor Board | `FloorBoard` | sparse/busy/blocked/new/stale long-session display |
| Ideas | `Ideas` | list, capture, promotion confirmation, recovery |
| Traveler | `Traveler` | print and QR work-location contract |
| Admin / Settings | `AdminSettings` | tenant/modules/integrations/health, identity-admin separation |

Static RFQ review, Quote preparation, Quote template, and other non-registry artifacts are reference/secondary surfaces and must be tested when their production routes are activated; they do not create a parallel shell.

## Required evidence matrix

| Dimension | Current status | Evidence required for PASS |
|---|---|---|
| CODE / FUNCTIONAL | PASS | Full regression, endpoint coverage, security, and story-specific contracts remain green at tested MAIN. |
| UI/UX CODE-LEVEL | PASS | Shared-shell, responsive, accessibility, state, bounded-payload, failure-preservation, and terminology tests. |
| RENDERED VISUAL | NOT PERFORMED | Actual deployed rendering at 1440x900, 1024x768, 768x1024, 390x844, plus 1920x1080/physical large display for Floor Board. |
| ACCESSIBILITY | PARTIAL | Automated/source contracts pass; keyboard-only, visible focus, 200% zoom/reflow, contrast, screen-reader labels/live announcements, and reduced-motion checks remain. |
| PERFORMANCE / RESPONSIVENESS | PARTIAL | Local bounded-model characterization exists; real Apps Script/Sheets and browser timings with representative data remain. |
| LIVE RUNTIME | PARTIAL | Command Center transport was validated previously; live identity personas, Follow-Up/purchasing stores, all routed surfaces, and failure fixtures remain. |

## Rendered workflow matrix

At every applicable viewport validate information hierarchy, primary action, readable business language, scrolling/overflow, dialog fit, action wrapping, touch targets, keyboard/focus order, loading/empty/success/error/uncertain states, preserved input, duplicate-submit prevention, and tenant/module contamination.

Required fixtures include:

- Command Center: Owner/Manager, Shop Operator, Sales, Admin, permission-limited, zero-capability, empty, and partial-source failure.
- Navigation: long tenant labels, disabled specialty modules, active location, legacy routes, and narrow menu.
- CRM: new/empty Customer, populated bounded timeline, routine Visit, material drop, overdue follow-up, stale account, missing next action, save failure, and uncertain outcome.
- Follow-Ups: due today, overdue, upcoming, deadline-only, scheduled, completed/cancelled, no-calendar, provider attention, conflict, deletion, and cleanup failure.
- Operations: Jobs, Shop Floor current work, problem report, resolution, QR invalid/revoked, offline/failure, and resumption.
- Floor Board: no work, sparse, busy, several blocked Jobs, long names, new work, unchanged refresh, stale/failure with last state retained, 1920x1080 and physical 90-inch distance/readability.
- Ideas and Operations Dashboard: populated/empty/failure and confirmation behavior.
- Admin: ADMIN_CONFIG-only, ADMIN_IDENTITY, non-admin denial, modules disabled/enabled, integration disabled/attention, missing stores, long labels, and safe-detail boundaries.

## Device and accessibility sessions

- Desktop: all routes at 1440x900; keyboard-only full workflow; 200% zoom/reflow; Windows high contrast where available.
- Physical tablet: 1024x768 and 768x1024; gloved/touch operation, rotation, on-screen keyboard, loss/recovery of network.
- Mobile: 390x844 CRM activity, Follow-Ups, quick lookup, lightweight operational action, Admin health fallback.
- Scanner/QR: supported scanner input, repeated scan, invalid/revoked token, operator attribution, offline/retry, no QR-as-identity confusion.
- Large display: actual display/browser scaling, several-feet readability, burn-in/long-session behavior, stale indication, refresh continuity, and interactive keyboard focus if used.
- Screen reader: landmarks/headings, labels/instructions/errors, status announcements, table/card semantics, and logical order on Command Center, CRM, Follow-Ups, Shop Floor, Floor Board, and Admin.

## Performance evidence

Use representative SMALL/MEDIUM/HEAVY synthetic or approved non-production data. For Command Center, Shop Floor, Floor Board, CRM timeline, Follow-Up queue, and Admin workspace record cold/warm server duration, Apps Script/Sheets calls, rows examined, result count, serialized bytes, browser render-to-useful-state, interaction latency, and repeated-refresh behavior. Floor Board must record at least a 30-minute session with unchanged and changed refreshes. External-provider delay must not block unrelated Atlas work.

No arbitrary PASS SLA is set before baseline measurement. Capture visible disruption and choose workflow targets from measured non-production behavior. Synthetic/in-memory timing is not Apps Script/Sheets evidence.

## Representative usability observation

Observe Owner/Manager, Shop Operator, Sales, Admin, and a nontechnical small-shop owner completing realistic work without coaching beyond the task. Record completion, errors, hesitation, recovery, assistance requested, and operator language. Classify assistance events as `TRAINING`, `UX`, `BUG`, `MISSING_CAPABILITY`, `CONFIGURATION`, or `TECHNICAL_ADMINISTRATION`.

## Remaining activation gates

Owner/Admin identity provisioning, Follow-Up workbook activation, purchasing mapping/threshold approval and activation, live provider decisions, physical tablet/scanner/large-display validation, multi-persona rendered validation, and real Apps Script/Sheets measurements remain open. MOS-122 must not be declared accepted until required evidence is attached to this matrix with reviewer/date/environment/build identifiers.

No production resource changed.
