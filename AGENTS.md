# Project Atlas / MOS — Repository Instructions

These rules apply repository-wide unless a more-specific descendant `AGENTS.md` overrides them.

## Canonical standards

Canonical standards are maintained only in:

`https://github.com/brendanb-pm/Codex-Standards`

Use one shared local read-only checkout for all projects.

Resolve the checkout path in this order:

1. `CODEX_STANDARDS_HOME`, when set.
2. Otherwise `$HOME/.codex/Codex-Standards`.

At the first substantive task of a session, refresh that checkout once:

- if missing, clone `https://github.com/brendanb-pm/Codex-Standards`;
- if present and clean, update it with a fast-forward-only pull from `main`;
- do not refresh again for every task in the same session;
- agents must never edit, commit, push, reset, or otherwise mutate the canonical standards repository except for the refresh operation above.

If the checkout is dirty, conflicted, or cannot be safely refreshed, do not reset or discard anything automatically. Report the condition. A previously cached clean checkout may be used only when `Codex-Standards.md` is present; report `STANDARDS SOURCE: CACHED; FRESHNESS: UNVERIFIED`. If no usable checkout exists, stop substantive execution and report `CANONICAL STANDARDS UNAVAILABLE`.

Load only:

- `<standards-home>/Codex-Standards.md`; and
- conditional modules triggered by the task.

Do not copy canonical standards into this repository. Do not load every module by default. Use the core deterministic model/priority policy: select once before execution and do not continue discussing model choice during the run.

## Release channel

Classify every implementation task as `MAIN` or `BETA`.

- `MAIN` is default for established, reasonably defined, testable product capability.
- `BETA` is only for intentionally experimental behavior whose workflow, reliability, or value still requires real-world experimentation.
- New does not mean beta.
- Main must work with beta disabled; beta must not become a required dependency of main.

## Atlas architecture boundaries

Atlas is the configurable platform; VMOS is a configured deployment. Firearms, Coatings, and similar verticals are optional modules over shared foundations.

Preserve:

`UI -> Service -> Repository -> Storage Adapter`

Do not introduce deployment/provider-specific coupling into generic Atlas business logic unless it belongs there. Prefer explicit adapters for external systems. Do not create duplicate domain concepts before checking for an established model/service.

Atlas/MOS owns canonical business state unless a documented domain contract says otherwise. External providers must not silently become source of truth or delete/complete/overwrite/reassign canonical records because their state changed.

Preserve canonical IDs, relationships, versions, and audit history.

## Production boundary

Production mutation requires explicit authorization for the specific action. This includes Sheets/Drive, Gmail/calendar records, Script Properties, credentials/OAuth configuration, triggers, watches/subscriptions, provider records, and deployments.

Never store raw credentials/tokens/passwords/API keys in source, worksheets, operator records, logs, or normal UI.

For production/external work, load `modules/PRODUCTION-EXTERNAL-SYSTEMS.md`. For auth/tenancy/security work, load `modules/SECURITY-AUTH.md`. For schema/migrations, load `modules/DATA-MIGRATIONS.md`. For user-facing changes, load `modules/UI-UX.md`; add `modules/PERFORMANCE.md` when latency/data-loading behavior is material.

## Time / schedule semantics

When a domain value includes time of day, preserve local wall-clock intent, IANA timezone, and required absolute instant. Do not blindly treat local time as UTC. Keep deadlines distinct from scheduled blocks when the domain does.

## Tests and defects

Use targeted existing tests first and the core proportional-verification ladder. Defect remediation requires regression coverage that would have failed before the fix. Do not weaken valid tests to make a suite pass.

Fix adjacent defects only when clearly inside current acceptance criteria and safely bounded; otherwise document/defer them.

## Prompt integrity

Atlas/MOS execution briefs should end with:

`<<< END OF MOS PROMPT >>>`

When a brief explicitly uses this integrity mechanism and the marker is missing, do not infer the remainder or modify code. Reply exactly:

`INCOMPLETE PROMPT - END MARKER NOT RECEIVED`

## Reporting

Keep completion reports concise. Include as applicable: release channel, changed files, tests/results, schema/config changes, known defects/deferred scope, production changes, commit/push state, loaded modules, and the core `EFF` line for substantive story work.

Never describe functionality as deployed, activated, visually validated, live-provider verified, or production-ready unless that actually occurred.

## Temporary model-efficiency experiment

The six-story Atlas model-efficiency experiment is active until slots A1–A6 are
closed in `Project Atlas/docs/Experiments/Atlas-Model-Efficiency-Experiment.md`.
This is a temporary project experiment, not a permanent change to the canonical
selector. The experiment setup itself does not consume a slot.

Before substantive work on a candidate Atlas story, read the tracker and use
the first open slot only when the story naturally matches that slot. Do not
invent, shrink, reorder, or weaken work to fill a slot. Direct-to-Sol security,
tenant-isolation, financial-integrity, destructive-migration, durable-recovery,
systemic-reconciliation, and broadly ambiguous architecture triggers do not
consume Terra slots.

For an experimental story, stop before launching implementation and emit the
tracker's exact `INSTRUMENTATION START` request. Wait for the user's compute
percentages, record them, then keep the selected model/effort stable for that
run. After execution finishes, stop before any other story and emit the exact
`INSTRUMENTATION CHECKPOINT` request with the execution evidence. Wait for the
user's ending percentages before closing the slot. Preserve failures and
escalations as evidence; never silently hide them by switching models.

After A6, produce the required comparison and recommendation. Do not change the
canonical model selector unless the user separately approves that conclusion.
