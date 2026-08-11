# MOS-122C Daily Workspace and Persona-Oriented Command Center

Release channel: **MAIN**
Baseline: `2405ee3dde28ad350cb39185dccff85bedb2fcd0`

## Navigation regression preflight

The complete path was inspected from `getAtlasNavigation` through the authorized execution context, membership capability expansion, `AtlasNavigationService_`, the callable response, and both navigation renderers. Styling does not hide valid entries. The service intentionally emits the capability-free Home route and filters every other route from the immutable server context.

Therefore the observed one-item live navigation payload has one deterministic code-level cause: the successful navigation context supplied zero recognized capabilities. It is not correct Owner/Admin behavior. An ADMIN or Owner/Manager-style capability context produces every currently supported configured workspace. The repository cannot establish whether the live zero-capability context is caused by incomplete membership data, an unrecognized role assignment, or a stale deployment without inspecting live identity/configuration resources, which this story does not authorize.

Atlas does not elevate that caller. Both shell renderers now label the state `LIMITED_ACCESS` and tell the operator that active membership needs administrative review. `ENFORCED` authorization remains fail closed. Development and validation behavior remains explicitly non-authoritative under MOS-121 and is not production approval. Activation must verify the live principal mapping, active tenant membership, role/capability JSON, deployed version, and DeploymentProfile in controlled non-production before writable production use.

## Daily workspace architecture

`getCommandCenterWorkspace` is one authorized, provider-neutral read endpoint. `CommandCenterWorkspaceService_` composes a compact read model from authoritative Follow-Up, Job, Purchase Request, calendar reconciliation, and MVP reference repositories. It does not persist attention state, call external providers, or use `getMvpBootstrap`.

The returned contract contains:

- ordered attention items with stable derived identity, severity, explanation, source, record, and route;
- bounded Today and My Work lists;
- authorized reference counts;
- at most five recent RFQs, Jobs, and Invoices per authorized domain;
- section-safe unavailable notices;
- non-authorizing presentation flags derived from trusted capabilities.

The Command Center loads this payload on entry. The legacy MVP bootstrap loads only after navigating to an entity workspace. Attention and Today appear before reference metrics and recent records.

## Implemented attention sources

- open Follow-Ups past their Due At: `DUE_OVERDUE`;
- Jobs in `BLOCKED` or `PROBLEM_REPORTED`: `CRITICAL_BLOCKING`;
- Jobs in `NEEDS_CLASSIFICATION` or `UNKNOWN`: `ACTION_REQUIRED`;
- Purchase Requests in pending/requested/submitted states when purchase visibility exists: `ACTION_REQUIRED`;
- pending calendar External Change Requests when reconciliation capability exists: `ACTION_REQUIRED`.

No alert is inferred from record existence alone. Security-ledger details are not returned. Severity uses text and restrained semantic treatment; blocking work sorts before action-required and overdue work.

## Persona and responsibility composition

There are no role-name dashboards. Sections are composed from immutable capabilities and existing ownership fields. Follow-Ups use Owner User ID; Jobs use the existing operator/owner field where populated. Actor and owner remain distinct. When Atlas lacks a trustworthy assignment, the item remains team-level attention rather than being attributed to the current user.

An empty attention list is explicitly healthy. A source failure returns a safe section warning while other sections continue rendering. Retry refreshes the single workspace payload. Raw repository/configuration errors are not sent to the operator.

## Performance and payload discipline

The browser receives no full Customer, Follow-Up, JobEvent, SalesActivity, calendar workspace, or history collection. The representative regression fixture performs no more than eight repository list operations, contains no N+1 loop, bounds attention to 12, Today/My Work to eight, and each recent list to five. One client/server round trip loads the workspace. External providers are never called.

The current Sheets adapter still implements several source reads as full-sheet reads before server-side filtering. This is a known MOS-120 implementation debt, not hidden UI work. Future bounded repository methods can replace those reads behind this service without changing the client contract. Real Apps Script/Sheets execution time, rows examined, and payload timing remain an activation measurement.

## Responsive, accessibility, and rendered evidence

The daily workspace uses a desktop attention-plus-current-work composition, a stacked tablet layout, and a single-column mobile priority flow. Metrics and recent reference work move below actionable content. Controls are native buttons/links with meaningful labels, visible focus, minimum touch height, logical headings, text-plus-color severity, safe live-region behavior, and no clickable non-semantic cards.

A local rendering using repository CSS and the implemented composition was inspected at 1440x900, 1024x768, 768x1024, and 390x844 with synthetic non-production records. No horizontal overflow was measured. This was not a deployed Apps Script application with representative tenant data, permission-limited identity, partial source failure, or assistive technology, so rendered and accessibility QA remain partial.

## Safety and remaining activation work

No production data, schema, Script Property, identity, deployment, provider, or external resource changed. Live activation must validate navigation under an actual Owner/Admin membership, permission-limited personas, representative data volumes, partial-source failure, and the four viewport classes. MOS-122D and the Floor Board remain separate stories.
