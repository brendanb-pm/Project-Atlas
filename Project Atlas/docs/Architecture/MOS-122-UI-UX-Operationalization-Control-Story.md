# MOS-122 UI/UX Operationalization Control Story

Release channel: **MAIN**  
Inspected baseline: `a3440672a6b848df7b8af93c668e85b54a6e9266`

## Purpose and boundary

MOS-122 governs the conversion of Atlas's current collection of functional screens into a coherent operational product. It defines the UI architecture, quality model, and MOS-122A-H boundaries. It does not implement those substories, alter canonical business behavior, activate integrations, or modify production resources.

The target boundary remains:

`Operator interface -> purpose-built service/read model -> repository contract -> storage adapter`

Screens present and command canonical Atlas services. They do not calculate or persist independent lifecycle truth, infer authorization from visibility, or make provider state authoritative.

## Current UI inventory

The current router is `doGet(e)` in `UI/Code.gs`. Query parameters select separate full-page templates rather than one coherent route/shell model.

| Route/surface | Current purpose | Current strengths | Current limitations |
| --- | --- | --- | --- |
| Default `/` (`Index.html`) | Command Center plus Customer, RFQ, Quote, Job, and Invoice lists/create/edit | Responsive sidebar, keyboard focus styles, loading/toast/busy states, escaped dynamic values | Calls `getMvpBootstrap` for all permitted entities; generic forms expose IDs and implementation-shaped fields; all-data client filtering; VMOS/Vitality hard-coded; separate surfaces are links rather than integrated navigation |
| `?sales=1` (`SalesActivity.html`) | Sales activity capture, metrics, account timeline, follow-up queue | Compact sales workflow and touch-sized controls | Standalone styling/API conventions; no shared shell; multiple independent calls; desktop-like tables/fields need mobile workflow validation |
| `?ideas=1` (`Ideas.html`) | Capture and review non-operational ideas | Clear operational separation, preserved form on most failures, responsive stacking | Hard-coded VMOS presentation; separate notice/error conventions and no global navigation |
| `?dashboard=1` (`OperationsDashboard.html`) | Operational workload/dashboard | Explicit refresh, blocked/priority visibility, safe escaped rendering | Rebuilds broad data on refresh; not a 90-inch floor-board contract; no stale/offline/as-of model or incremental updates |
| `?traveler=1` with traveler/QR parameter (`Traveler.html`) | Printable job traveler and QR navigation | Print layout, responsive fallback, opaque QR handling | Hard-coded Vitality/VMOS identity; token/route semantics are not part of a unified shell; printed terminology is not tenant-configured |
| `?shop=1` (`ShopFloor.html`) | QR/job lookup, status commands, problem/block handling, history | Large actions, operator-safe language, QR does not identify actor, mutation busy/error handling | Dense single-page workflow; history is unbounded; technical/status text is inconsistent; portrait/tablet and focus flows need rendered validation |
| `?calendar=1` (`CalendarFollowUps.html`) | FollowUps, Today, calendar settings, reconciliation | Best-developed state model; preserves drafts on uncertain saves; responsive breakpoints; distinct deletion/conflict/cleanup recovery; ARIA/focus treatment | Loads an all-workspace payload; internal `MOS` terminology appears throughout; standalone shell and styling; 23 actions can create hierarchy/wrapping pressure |
| `RfqIntakeReview.html` | Static review concept | Clear warnings and human approval boundary | Not routed/wired; placeholder content; minimal accessibility and state behavior |
| `QuotePreparation.html` | Static quote-preparation concept | Clear pricing stages and human review language | Not routed/wired; placeholder content; no async/error/accessibility contract |
| `QuoteTemplate.html` | Customer-facing quote template | Simple printable structure | Hard-coded VMOS/Vitality branding; limited semantic/print/accessibility validation |

No route currently provides a unified Calendar, Sales, Shop Floor, Ideas, and administration navigation model. Query-string selection also makes active state, breadcrumbs, return paths, authorization-aware discovery, and deep-link consistency difficult.

## Existing interaction and quality patterns

Useful conventions to preserve and consolidate:

- minimum controls are generally near 44 pixels;
- dynamic business text is escaped before HTML assembly on active screens;
- callable responses distinguish safe errors and uncertain outcomes;
- create flows use duplicate-submit guards and operation IDs;
- Calendar and shop-floor flows refresh authoritative state after uncertain outcomes;
- empty, loading, success, and failure language exists on most routed surfaces;
- desktop-to-single-column media rules exist on active templates;
- canonical mutations remain behind callable services.

Inconsistent or duplicated patterns:

- every template defines its own colors, typography, spacing, cards, buttons, notices, loading states, API wrapper, busy model, and breakpoints;
- success/error feedback alternates among top toasts, bottom notices, inline text, full-screen overlays, and page replacement;
- some actions disable one control while the default shell blocks the entire interface;
- confirmation uses native `confirm`/`prompt` in places and custom review UI elsewhere;
- navigation, page titles, status labels, capitalization, and `FollowUp`/`Follow-up` terminology vary;
- screen rendering relies heavily on large HTML strings and full rerenders;
- keyboard focus restoration after render, validation summary behavior, skip navigation, table semantics, and reduced-motion support are not consistently defined;
- generic forms infer labels and input types from property names, exposing storage/domain shape rather than task-specific interaction design.

## Tenant and module presentation audit

The architecture already defines `TenantBrandConfiguration` with organization/product/deployment names, logo references, theme colors, enabled modules, and terminology overrides. Current UI does not consume it consistently.

Hard-coded presentation includes `VMOS`, `VITALITY`, `Vitality Manufacturing Operating System`, VMOS-specific web titles, VMOS-specific error/loading text, and VMOS traveler/quote branding. These may be valid VMOS defaults but must not be Atlas Core constants.

The Firearms and Coatings boundaries remain optional modules. Firearms-specific intake, condition, optic, authorization, and camera flows belong in a module workspace. Generic Customer, Job, Document, and workflow surfaces may expose module-provided summaries/actions through registered extension points, but must not acquire mandatory firearms/coatings fields or terminology.

The target presentation contract is:

```text
Trusted request context
  -> active Tenant Membership and capabilities
  -> TenantBrandConfiguration
  -> enabled module/navigation contributions
  -> role/capability-aware workspace model
  -> shared Atlas shell and design system
  -> purpose-built screen read model and commands
```

Role/module-aware presentation is not authorization. Hidden navigation never replaces server-side capability enforcement.

## Major UX debt and workflow friction

| Priority | Debt | Operator effect | Governing response |
| --- | --- | --- | --- |
| High | Data/entity navigation rather than attention/work navigation | Users must know where records live before knowing what needs action | Add role-aware Home/Daily Work with due, blocked, approval, exception, and recent-work queues |
| High | `getMvpBootstrap` and client-side all-record filtering | Slow initial load and refresh as data grows; unrelated data crosses the wire | Retire in stages through MOS-120 bounded read models and view-specific payloads |
| High | Disconnected full-page query routes | Lost context, inconsistent navigation, duplicated UI infrastructure | Define one shell/route registry with deep links and capability/module visibility |
| High | Generic create/edit forms and raw relationship IDs | Excess typing and domain knowledge; easy invalid relationships | Use task-specific forms, searchable relationship pickers, defaults, progressive disclosure, and business labels |
| High | No shared design system | Inconsistent hierarchy, states, accessibility, and maintenance | Establish tokens, components, content rules, state patterns, and conformance tests in 122B |
| High | Dashboard is not a long-running floor display | No stale/offline indication, incremental change, distance hierarchy, or burn-in/session behavior | Separate manager Command Center from 90-inch Floor Board and use snapshot/delta contracts |
| Medium | Broad or inconsistent busy behavior | Unrelated work may be blocked; operators may lose confidence | Scope busy states to actions, acknowledge promptly, preserve input, and keep unrelated navigation usable |
| Medium | Inconsistent confirmations and recovery | Destructive consequences and uncertain outcomes require relearning | Standardize confirmation, destructive-action, uncertain-result, retry, and refresh patterns |
| Medium | Incomplete mobile and tablet validation | Horizontal tables and dense actions may be technically responsive but operationally awkward | Assign explicit device/persona acceptance to each substory and validate rendered interaction |
| Medium | Hard-coded tenant/module branding | Atlas Core cannot present cleanly for another deployment | Resolve all display identity and terminology through trusted tenant/module configuration |
| Medium | Static RFQ/quote concepts are not wired | Product expectations may be mistaken for functioning routes | Label prototypes clearly until their implementation stories integrate them |

## Governing UX principles

All MOS-122 substories must apply these requirements:

1. Show users what needs attention now, with reason, urgency, owner, and safe next action.
2. Make the primary action visually and semantically obvious; reduce competing equal-weight actions.
3. Minimize typing, repeated entry, raw-ID entry, and unnecessary navigation.
4. Preserve entered work on recoverable failure and uncertain outcomes; disable duplicate submission while keeping unrelated work usable.
5. Use business language. Keep Apps Script, Sheets, repositories, adapters, provider internals, raw IDs, cursors, and configuration property names out of ordinary operator UI.
6. Present only permitted, relevant role/module work while retaining server-side authorization as the authority.
7. Make touch targets, spacing, focus behavior, and input controls appropriate to the intended device.
8. Bound lists/history and request details explicitly; do not serialize unrelated full datasets.
9. Treat perceived responsiveness, progress, and recovery as UX requirements.
10. Resolve branding and terminology from tenant configuration; allow modules to contribute isolated navigation and components through explicit extension points.
11. Keep specialty-module fields and flows outside generic Atlas screens unless surfaced through a declared module extension.
12. Treat screens as views/commands over canonical Atlas services, never independent sources of truth.
13. Preserve accessibility and safe failure before visual novelty.
14. Do not equate a responsive CSS breakpoint, unit test, or static inspection with rendered usability.

## Representative validation personas

| Persona | Primary needs | Failure to avoid |
| --- | --- | --- |
| Shop Operator | Scan/find work, understand current step, record progress/problem quickly, return to queue | Deep navigation, raw IDs, small controls, ambiguous save status, long history before current action |
| Shop Manager | See priority, workload, blocked/late work, exceptions, escalation and ownership | Decorative dashboards without actionable drill-down or trustworthy as-of state |
| Sales User | Find an account, capture activity, schedule/follow up, review RFQ/quote work rapidly | Re-entering account data, global history loads, desktop-only capture, deadline/schedule confusion |
| Admin / Owner | Configure tenant/modules/users, review approvals/finance/reporting, control operational exceptions | Technical deployment details in daily UI, unsafe broad permissions, irreversible actions without consequences |
| Nontechnical Small-Shop Owner | Understand current shop health and complete common tasks without platform knowledge | Terms such as Apps Script, Sheet, adapter, gateway, cursor, JSON, or provider identifiers |

Personas are validation lenses, not hard-coded roles. Capabilities determine access; tenant configuration may map different role names to the same workspace contributions.

## Device-context requirements

| Context | Expected behavior |
| --- | --- |
| 1440 x 900 desktop | Persistent or efficiently collapsible navigation; list/detail or workbench layouts; keyboard-complete workflows; no excessive unused space; bounded data and explicit paging |
| 1024 x 768 tablet landscape | Touch-first controls; primary actions reachable without precision; useful master/detail where it fits; no hidden required content or horizontal form scrolling |
| 768 x 1024 tablet portrait | Stacked detail and actions; readable tables become cards or deliberately scroll with headers/context; dialogs fit and focus remains contained |
| 390 x 844 mobile | Sales/activity/lookup/approval essentials only where justified; single-column forms; minimal typing; sticky action only when it does not obscure content; no desktop table dependency |
| Large-format floor display | Legible at 15-25 feet; status/priority/blocked cues not color-only; minimal chrome; current-state cards; as-of/stale/offline indication; incremental updates with full-refresh recovery; no sensitive finance/customer detail |

Large-format validation must include the actual physical viewing context or a documented equivalent distance/scale setup. A desktop screenshot enlarged in a browser is insufficient evidence by itself.

## Target UI architecture

### Application shell

Define a provider-neutral shell with:

- tenant-configured product/organization identity and theme;
- capability/module-aware route registry;
- primary workspace navigation, breadcrumbs/return context, page title, and account/session controls;
- consistent global status, toast, dialog, focus, and error regions;
- deep-link restoration that never trusts client route state for authorization;
- screen-level loading so unrelated navigation remains usable;
- a shared endpoint client that preserves safe errors, uncertain outcomes, correlation references, and duplicate-submit semantics.

### Navigation contribution contract

Core and module routes declare stable route ID, business label, workspace group, required capability, applicable device contexts, module dependency, icon reference, and read-model/command dependencies. Physical template filenames and query parameters are implementation details, not the navigation contract.

### Presentation/read-model contract

Each screen declares:

- operator goal and persona/device contexts;
- authoritative service commands;
- minimal read-model fields;
- list limits, sort, paging/cursor, as-of/freshness semantics;
- loading, empty, partial, stale, success, error, uncertain, and unauthorized states;
- input preservation and duplicate-submit behavior;
- accessibility and rendered-test scenarios;
- performance evidence required before PASS.

Client state may hold drafts, selection, paging, and presentation preferences. It must not independently own business lifecycle, permissions, tenant identity, audit actor, or provider reconciliation state.

## MOS-122A-H boundaries

### MOS-122A - Information Architecture & Navigation

Define the route/workspace taxonomy, shared shell, deep links, role/capability/module route contributions, responsive navigation, attention-first landing model, and migration from query-string islands. Do not redesign every screen or create the component library here.

### MOS-122B - Atlas Design System

Create tenant-aware tokens and reusable primitives for typography, color, spacing, elevation, controls, forms, tables/cards, status, alerts, dialogs, progress, empty states, focus, motion, and content language. Include accessibility contracts, destructive/uncertain action patterns, and a component demonstration/QA surface. Do not migrate all workflows at once.

### MOS-122C - Operator Workspace / Daily Work

Implement the attention-first home workspace: assigned work, due/overdue FollowUps, blocked jobs, approvals/exceptions appropriate to capability, and recent/resumable work. Use bounded purpose-built read models with clear freshness. Do not duplicate Command Center or floor-board analytics.

### MOS-122D - Shop-Floor & Tablet UX

Operationalize scan/find job, current step, status transition, problem/block resolution, traveler, and restricted kiosk/shared-station patterns for tablet use. Preserve named-operator identity, QR scope, idempotency, and K/L recovery. Bound history and keep module-specific Firearms/Coatings work in extension workspaces.

### MOS-122E - Command Center / 90-inch Floor Board

Separate manager decision support from passive large-format display. Implement actionable summaries for managers and a privacy-safe current-state floor board using MOS-120 snapshot/delta, stale/offline/as-of state, missed-update recovery, and long-session behavior. Do not make Asana or another board canonical.

### MOS-122F - CRM / Sales UX

Operationalize account summary, recent bounded activity, fast activity capture, FollowUp queue, Today/Upcoming/Overdue, RFQ review, and quote preparation for desktop/mobile sales contexts. Preserve Due At versus scheduled-block semantics and authoritative approval/issuance controls.

### MOS-122G - Administrative / Configuration UX

Define tenant branding/terminology/modules, user/membership/role administration, calendar/integration configuration, finance/approval policy, and operational settings with explicit authorization, safe defaults, activation state, audit, and rollback visibility. Deployment internals and credentials remain outside ordinary operator presentation.

### MOS-122H - Rendered UX, Accessibility & Performance Acceptance

Independently render and inspect all applicable workflows at required viewport classes, keyboard/screen-reader-relevant states, zoom/reflow, touch behavior, error/recovery paths, slow/offline/provider conditions, and representative SMALL/MEDIUM/HEAVY data. Distinguish code-level QA, rendered visual QA, accessibility QA, and performance/responsiveness QA. H is an acceptance gate, not a place to hide substantial remediation.

Each implementation substory must preserve existing business behavior unless its acceptance criteria explicitly authorize a change. A-H may be sequenced incrementally, but 122H evidence must be rerun after material UI remediation.

## Performance and responsiveness contract

MOS-122 adopts MOS-119 evidence and MOS-120 contracts rather than masking slow data access with spinners.

Priority UI migrations are:

1. replace `getMvpBootstrap` with view-specific bounded lists/details and staged consumer retirement;
2. replace SalesActivity global scans/N+1 metrics with Account Summary and Follow-Up Queue read models;
3. bound JobEvents, Documents, and ProcessTrials in Job Detail;
4. use current-state snapshot plus revision deltas for floor-board refresh;
5. split Calendar Workspace by actor/view/date window and load only matching links/requests/account labels;
6. return bounded Command Center exception lists with an as-of timestamp and 30-60 second near-real-time policy;
7. avoid blocking ordinary Atlas work on external providers when reconciliation can proceed independently.

Every affected story captures before/after repository calls, rows examined, payload bytes, operation/serialization duration, rendered response, resulting record count, and correctness equivalence using representative data. Unit timing and local synthetic timing alone cannot produce a responsiveness PASS. No arbitrary production SLA is established here.

## State and accessibility acceptance model

Every operational screen must explicitly support, as applicable:

- initial loading, incremental loading, empty, filtered-empty, partial/stale, success, validation error, authorization denial, provider unavailable, unknown outcome/reconciliation, and offline/retry states;
- immediate input acknowledgement, scoped busy controls, preserved drafts, duplicate-submit prevention, and authoritative refresh after uncertainty;
- semantic headings/landmarks, programmatic labels/descriptions/errors, logical focus order, visible focus, focus restoration, keyboard operation, non-color status cues, adequate contrast, zoom/reflow, touch target sizing, and reduced-motion consideration;
- operator-safe language without internal schema, storage, security-policy, or provider-token leakage.

Automated accessibility checks are necessary but not sufficient. Rendered keyboard, touch, reflow, screen-reader-relevant semantics, and actual operator comprehension remain acceptance evidence.

## Evidence and reporting

Applicable substories report separately:

- `CODE / FUNCTIONAL STATUS: PASS | PARTIAL | FAIL`
- `UI/UX CODE-LEVEL QA: PASS | PARTIAL | FAIL`
- `RENDERED VISUAL QA: PASS | PARTIAL | FAIL | NOT PERFORMED`
- `ACCESSIBILITY QA: PASS | PARTIAL | FAIL | NOT PERFORMED`
- `PERFORMANCE / RESPONSIVENESS QA: PASS | PARTIAL | FAIL | NOT PERFORMED`

Evidence distinguishes source/contract tests, rendered screenshots and inspection, operator-task observations, accessibility checks, and real Apps Script/Sheets measurements. Screenshots do not prove keyboard behavior, provider behavior, data correctness, or responsiveness.

## Decisions requiring Brendan

1. **Primary business terminology:** choose the default Atlas labels and tenant overrides for Customer versus Account, Job versus Work Order, and FollowUp versus Follow-up. Current screens and documents conflict.
2. **Default workspace priority:** confirm which attention groups appear first for each VMOS persona/capability bundle; this controls 122A/122C information hierarchy, not authorization.
3. **Large-display product direction:** decide whether VMOS's first 90-inch experience is an Atlas-owned Floor Board or the previously documented VMOS shell around an Asana view. Atlas canonical state and the MOS-120 delta contract remain required either way.
4. **Mobile scope:** confirm whether 390 x 844 initially targets CRM/activity/approval/lookup only or must include full administrative/entity editing. The latter materially changes navigation and form scope.
5. **Tenant branding source and fallback:** approve the operational source, required fields, and safe fallback for `TenantBrandConfiguration` before hard-coded VMOS/Vitality strings are removed from shared templates.
6. **Prototype disposition:** decide whether RFQ Intake Review and Quote Preparation static templates are approved interaction directions for 122F or should remain explicitly labeled design artifacts pending separate workflow approval.

These decisions do not block publishing this control architecture. They must be resolved in the relevant substory before implementation choices depend on them.

## Verification and stop conditions

This control story is complete when the current surfaces and debt are documented, A-H boundaries are explicit, tenant/module boundaries are preserved, device/persona/performance evidence is defined, and no product behavior changed.

Stop an implementation substory when it would:

- make UI state canonical;
- bypass server authorization or trusted tenant configuration;
- introduce a specialty-module field into generic Atlas contracts without an extension boundary;
- require unapproved production mutation;
- claim rendered or performance PASS without the required evidence;
- broadly restyle unrelated workflows without task/equivalence validation;
- implement a MOS-122 substory from this control document alone.

MOS-122 documentation does not declare the current UI operationally complete, rendered-validated, accessible, performant, production-ready, or production-activated.
