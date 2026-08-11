# MOS-122D — Shop-Floor and Tablet UX Operationalization

Status: implemented on MAIN; production activation remains separate.

## Boundary and inspected implementation

MOS-122D operationalizes the existing `shopfloor` route, `ShopFloorService_`, QR-token repository, Job/JobEvent persistence, endpoint authorization registry, shared navigation frame, and traveler generation. It does not change canonical Job, workflow, QR, event, identity, tenant, capability, or recovery semantics.

The former screen exposed large action controls, but assembled a Job and its history through separate browser requests, showed assignment without a distinct authenticated-operator presentation, collapsed STOP and problem concepts, used browser prompts for resolution, returned unrestricted history, and discarded an entered problem note when a transport failure caused a re-render.

## Primary operator workspace

One QR-scoped, provider-neutral read model now supplies the focused workspace:

- Job / Work Order identity, part, customer, status, and immediate next action;
- workflow, machine, program, due date, quantity, and business assignment;
- separately presented authenticated Atlas operator identity;
- only workflow transitions valid for the authoritative current state and caller capability;
- current block reason, note, responsible party, and required next action;
- a bounded recent Job-event timeline.

The browser renders this model but does not become a source of truth. Mutations continue through the existing authorized service endpoints and are followed by an authoritative workspace refresh.

## Action and exception model

The primary valid transition is the dominant action. Problem reporting and block resolution remain separate secondary workflows. A STOP action appears only when an actual configured workflow transition is `STOPPED` or `PAUSED`; Atlas does not fabricate a new STOP state. Reporting a problem uses the established `STOP_PROBLEM` event and blocked Job state.

Blocked work is communicated with text, not color alone. The workspace suppresses normal transitions while blocked and presents the reason, note, responsible party, next action, and a structured inline resolution form. Problem reasons use operator language and an optional note. Browser prompts are no longer used.

## QR, identity, and traveler contract

QR remains a work locator. Opening or repeatedly scanning a valid QR is read-only and harmless. Consequential mutations still require server-resolved principal, tenant membership, capability, immutable audit context, valid tenant-scoped QR, workflow state, command idempotency, and existing MOS-121 recovery protections.

The raw QR token is not returned in the workspace payload or rendered in the interface. Invalid, unavailable, revoked, and unauthorized QR paths retain safe errors. The current operator is visibly separate from the Job's assigned operator. When a presentable operator identity is unavailable, the UI shows an activation warning; the server remains the authoritative authorization boundary.

Printed travelers remain durable navigation aids, not current-state authority. The rendered workspace explicitly directs operators to Atlas for current state and recent history.

## Responsive, accessible, and async behavior

The workspace uses a two-column desktop/tablet-landscape layout and a single-column tablet-portrait/mobile layout. Primary targets are at least 64 pixels high on mobile and 68 pixels otherwise; secondary targets are at least 56 pixels. Long Job, customer, machine, program, and assignment text wraps without horizontal overflow. Keyboard focus is visible, live feedback uses status regions, controls are semantic buttons/fields, color is never the only status signal, and reduced-motion preferences disable animation.

Each mutation immediately enters a visible busy state and disables duplicate submission. Success is announced only after a successful server response and authoritative refresh. On an uncertain transport outcome, Atlas tells the operator to refresh before retrying. Entered problem and resolution text remains in browser state on recoverable failure.

## Performance and data-access contract

Initial QR resolution and each post-mutation refresh use one browser round trip to `getShopFloorWorkspace`. The payload is purpose-built and excludes unrelated bootstrap/workspace data. Event results default to 12 and are hard-capped at 25. One service invocation performs bounded lookups for the QR, Job, customer presentation, operator presentation, and one Job-event repository read; it does not introduce an N+1 loop.

The current Sheets adapter still obtains Job events through the existing repository list/filter behavior before the service bounds the result. This is a known MOS-120 bounded-query migration item, not a reason to duplicate Sheets logic in the UI or service contract. Real Apps Script/Sheets timing and device/network measurements remain an activation requirement.

## Rendered validation evidence

The actual repository HTML/CSS was rendered locally with non-production fixtures at:

- 1440 × 900 desktop;
- 1024 × 768 tablet landscape;
- 768 × 1024 tablet portrait;
- 390 × 844 mobile.

Rendered inspection covered ready, blocked, missing-identity, invalid-QR, problem-entry, submitting, and failed-submission states with long representative labels. All tested viewports had equal document client and scroll widths (no horizontal overflow). The failed-submission scenario retained the entered note and showed operator-safe retry guidance. Live Apps Script authentication, touch hardware, production Sheets, and production QR/provider resources were not used.

## Remaining activation and UX work

- Validate ENFORCED identity presentation with real non-production Apps Script sessions.
- Measure the read model against representative non-production Sheets volumes and implement the MOS-120 bounded JobEvent query when evidence warrants it.
- Validate physical tablet touch, scanner/camera behavior, and shop lighting/glove conditions.
- Perform screen-reader and full keyboard validation in the controlled deployment.
- Continue broader visual language consolidation under later MOS-122 substories; MOS-122D intentionally does not redesign unrelated screens.

No production deployment, worksheet, schema, identity, QR token, traveler, provider, or other production resource was changed by this story.
