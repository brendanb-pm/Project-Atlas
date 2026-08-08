# Project Atlas / MOS Development Instructions

These instructions apply to the entire repository. Preserve more-specific valid
instructions in descendant directories when present. Human discussion may
contain detailed reasoning, alternatives, and brainstorming; Codex execution
briefs should remain compact and contain only the identifier, release channel,
necessary rationale and baseline, objective, requirements, acceptance criteria,
tests, constraints, deliverables, and stop conditions.

## Release channels and dependency boundaries

Every Atlas/MOS implementation task must be classified as `MAIN` or `BETA`.
`MAIN` is the default for established, reasonably defined, testable product
capabilities. Examples include CRM, Companies, Contacts, Customers, Dealers,
SalesActivity, FollowUps, Tasks, RFQs, Quotes, Jobs/Work Orders, Invoices,
Purchasing, Inventory, Machines, Tools, Documents, permissions, audit, standard
notifications, and standard dashboards.

Use `BETA` only for intentionally experimental functionality whose requirements,
workflow, reliability, or value require real-world experimentation, such as
unvalidated AI interpretation, autonomous decisions, predictive scheduling,
novel voice interaction, experimental computer vision, or experimental UX.
Classify the feature rather than its technology: new does not mean beta, stable
AI may become main, and non-AI work may be beta when genuinely experimental.
Decompose mixed capabilities so stable infrastructure remains in main and
experimental behavior remains isolated in beta.

Main must operate with every beta capability disabled. Main may expose stable
models, services, APIs, events, data, and extension points that beta consumes;
beta must never be a required dependency of main. Do not create duplicate beta
business entities when stable main entities already exist. Prefer isolating
experimental behavior, services, and UI over fragmenting canonical data models.

## Inspect before implementation

Before changing code, inspect the repository rather than assuming branch names,
directory layout, deployment architecture, feature flags, storage adapters,
domain models, services, tests, configuration conventions, or instruction files.
Reuse established architecture and conventions unless an explicit requirement
conflicts with them. Do not create parallel concepts before checking for an
equivalent model or service.

## Platform, module, and adapter boundaries

Project Atlas is the configurable platform. VMOS is Vitality's configured Atlas
deployment. Firearms, Coatings, and similar vertical capabilities are optional
modules over shared manufacturing and business foundations. Keep tenant identity,
branding, terminology, modules, workflows, and integrations configurable where
the architecture supports it.

Do not introduce new Vitality-, VMOS-, Firearms-, Cerakote-, Google-, Microsoft-,
Apple-, Asana-, Gmail-, Sheets-, or other deployment/provider-specific coupling
into generic Atlas business logic unless it genuinely belongs to that deployment,
module, or adapter. External systems should normally integrate through explicit
interfaces/adapters. Preserve `UI -> Service -> Repository -> Storage Adapter`;
business logic and UI must not select Google Sheets directly.

## Canonical state and external changes

Atlas/MOS owns canonical business state unless an explicitly documented domain
contract says otherwise. External integrations must not silently become the
source of truth for core records. Calendar systems do not own FollowUp lifecycle;
Asana is not required to operate Work Orders; AI does not independently create
authoritative records when human approval is required. Preserve canonical IDs,
relationships, versions, and audit history.

When an external system requests or implies destructive, lifecycle-changing, or
uncertain changes, preserve MOS state and require explicit reconciliation/human
review unless the domain contract explicitly permits automation. Do not silently
delete, cancel, complete, overwrite, or reassign canonical records because an
external system changed. This includes external deletion, ambiguous conflicts,
uncertain entity matching, and AI-extracted production changes.

## Production and credential safety

Do not mutate production resources unless the task explicitly authorizes that
specific production mutation. Production resources include Sheets, Drive files
or folders, Gmail, calendars, Script Properties, credentials, OAuth configuration,
triggers, watches, subscriptions, polling, external-provider records, and
deployments. Development, architecture, documentation, fake providers, tests,
and disabled configuration never imply activation permission. Report every
production change explicitly.

Never persist raw credentials, OAuth/access/refresh tokens, passwords,
app-specific passwords, API keys/secrets, or equivalent secrets in business
worksheets or operator-facing records. Use approved secure credential storage
and persist only safe references when necessary. Do not expose secrets or
credential references in normal operator UI.

## Idempotency, retries, and failure isolation

External integrations and mutation workflows must handle duplicate delivery,
double-click/double-submit, timeouts, unknown transport outcomes, provider
outages, replayed events, and partial failures. Use idempotency keys, correlation
IDs, and version checks where appropriate. Provider failure must not corrupt
canonical MOS state. When success is uncertain, refresh/reconcile authoritative
state before encouraging another mutation.

Recoverable UI failures must restore controls, preserve entered values when safe,
show understandable errors, allow a safe retry, avoid permanent loading states,
and avoid duplicate mutations.

## UI/UX quality gate

Any task that creates or materially changes operator-facing UI must include UI/UX
QA appropriate to the change. Evaluate the primary goal and action, information
hierarchy, system status, loading/success/failure/empty states, validation,
recovery, duplicate-submit prevention, touch usability, keyboard/focus behavior,
accessibility, responsiveness, operator-readable language, and technical-detail
leakage. Design for the actual operator, including nontechnical users. The mere
presence of a control is not sufficient UX validation.

For responsive operator UI, consider at least these viewport classes unless a
documented device-specific requirement supersedes them:

- Desktop: approximately 1440 x 900
- Tablet landscape: approximately 1024 x 768
- Tablet portrait: approximately 768 x 1024
- Mobile: approximately 390 x 844

Check horizontal overflow, clipped controls, overlapping content, dialog fit,
hidden required information, touch-target size, form usability, action wrapping,
and readability.

Never claim rendered/visual QA from unit tests, DOM/HTML/CSS inspection, static
analysis, contract tests, responsive rules, or source review alone. Track these
separately when applicable:

- `CODE / FUNCTIONAL STATUS: PASS | PARTIAL | FAIL`
- `UI/UX CODE-LEVEL QA: PASS | PARTIAL | FAIL`
- `RENDERED VISUAL QA: PASS | PARTIAL | FAIL | NOT PERFORMED`
- `PERFORMANCE / RESPONSIVENESS QA: PASS | PARTIAL | FAIL | NOT PERFORMED`

Rendered visual QA may pass only after inspecting the actual rendered application
at the required viewport/device classes. If rendering is unavailable, report it
honestly. Performance/responsiveness QA may pass only when relevant operator
workflows have been evaluated with representative data and conditions; unit
tests passing by themselves are not sufficient evidence.

Normal operator UI should use business language. Avoid exposing architecture or
provider internals such as adapter, gateway, repository, credential reference,
ETag, cursor, raw JSON, CalDAV internals, or provider object identifiers unless
the operator genuinely needs them. Developer diagnostics may remain technical.

## Performance is part of UX

Treat performance defects that materially affect normal operator workflows as
UX defects as well as technical defects. Evaluate operator-facing work for both
interaction quality and perceived/system responsiveness. Primary workflows
should avoid unnecessary network round trips, repository reads or writes,
repeated full-dataset reads, blocking operations, synchronous external-provider
dependencies, redundant rendering or initialization, duplicate calculations,
avoidable polling, and unnecessarily large payloads.

When an operation cannot finish immediately, acknowledge input promptly, show
visible progress and state, preserve entered data, prevent duplicate submission,
keep unrelated MOS functionality usable, and provide understandable failure and
recovery behavior. External integrations must not make ordinary MOS workflows
wait unnecessarily when their work can safely proceed independently.

Assess performance using realistic end-to-end operator workflows and
representative data volumes, not only isolated function timings or backend
benchmarks. Do not optimize prematurely without evidence, but investigate
demonstrated latency, scaling problems, redundant work, and architectural
bottlenecks. Never sacrifice correctness, auditability, data integrity, or safe
failure merely to reduce latency.

## Time and timezone safety

For schedules with a time of day, preserve local wall-clock intent, the IANA time
zone, and the absolute instant required by external systems. Never blindly treat
local wall-clock input as UTC. Do not infer historical timezone or duration when
the data does not provide it. Keep CRM deadlines distinct from scheduled blocks
when the domain defines them separately. Test relevant DST boundaries.

## Tests, defects, and completion

Tests must validate business behavior rather than mirror implementation. Defect
remediation requires regression tests that would have failed before the fix. Do
not weaken or remove valid tests to make a suite pass. Run the full relevant
regression suite before declaring implementation complete. Passing tests never
override a demonstrated defect.

If implementation reveals an adjacent defect, fix and test it only when it is
clearly within existing acceptance criteria and can be corrected safely without
broadening scope. Document and defer new capabilities or significant scope. Do
not turn a defect-remediation story into a broad refactor.

Implementation completion and independent completion/QA gates remain separate
when specified. Remediation does not waive or weaken the independent gate that
follows it. Keep known blockers visible and do not declare a story complete merely
because implementation ended.

## Schema and documentation changes

Prefer additive, backward-compatible migrations. Do not bulk-rewrite production
data without explicit approval. For persistence changes, document exact proposed
headers/schema, preserve IDs and relationships, define legacy-record behavior,
state activation/migration order, and identify rollback/disable behavior where
appropriate.

## Prompt integrity

Atlas/MOS Codex execution briefs should end with:

`<<< END OF MOS PROMPT >>>`

When a brief explicitly uses this integrity mechanism and the marker is missing,
do not infer the remainder or modify code. Stop and reply exactly:

`INCOMPLETE PROMPT - END MARKER NOT RECEIVED`

Permanent repository rules in this file do not need to be repeated in each
execution brief.

## Reporting

Keep implementation reports concise and factual. Include, as applicable, the
release channel, inspected baseline, final commit SHA, changed files, schema or
configuration changes, tests/results, known defects, deferred scope, QA status,
production activation blockers, and whether production resources changed. Never
describe functionality as deployed, activated, visually validated, or
production-ready unless that actually occurred.

## Core principle

Optimize for correctness, operator usability and responsiveness, auditability,
recoverability, modularity, tenant portability, testability, and safe failure.
Avoid unnecessary refactoring and speculative abstraction. Do not spend compute
rewriting working code for stylistic consistency. Fix architecture when it
creates a demonstrated product, safety, portability, performance, maintenance,
or reliability problem.
