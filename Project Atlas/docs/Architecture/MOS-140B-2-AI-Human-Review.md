# MOS-140B-2 — AI Human Review and Authoritative Commit

Status: code and rendered pilot complete; live provider and production activation remain unauthorized.

## Review lifecycle

The reusable boundary is:

`tenant evidence → B-1 processing → immutable proposals → durable field review → explicit human save → canonical domain service`

AI processing never invokes the final command. A review session starts only after an authorized operator explicitly selects evidence and requests AI Assist. Field decisions remain `PENDING`, `ACCEPTED`, `EDITED_ACCEPTED`, or `REJECTED`; one field never forces another field's disposition. Manual entry remains available in every processing and failure state.

Migration `0013_ai_human_review` adds tenant-scoped review sessions, current field-review decisions, and append-only review events. Original B-1 proposals are immutable. Review rows link the proposal, processing job, reviewing user, reviewed value, disposition, and time. A committed session records the resulting authoritative record and version.

## Authoritative mutation boundary

`AiHumanReviewService` may create and update review records, but has no operational-write repository. Its final method invokes `ToolingTraceabilityService.applyHumanReviewedAiAssist`, which independently requires `TOOLING_WRITE` and runs the canonical PostgreSQL tooling transaction.

The tooling command locks and revalidates the review session, processing result, source attachment snapshot, tool identity, tool version, accepted field set, units, condition, and nominal catalog geometry. It then applies accepted values, appends the physical measurement and condition history where applicable, records the normal tooling audit event, links the review provenance, and commits the review session atomically. Retry uses a commit idempotency hash; changed replays fail closed.

There is no AI-owned direct update path to tooling data. Read access to a proposal does not grant permission to modify its parent record.

## Tooling/regrind pilot

The bounded pilot covers `Condition`, `NominalDiameter`, and `ActualMeasuredDiameter` for an existing Tool Instance:

- `REGRIND / 1/2 END MILL` may propose `REGROUND` and nominal `0.5000 INCH`.
- Missing actual geometry remains `REQUIRES_HUMAN_INPUT`.
- An operator may enter `0.4975 INCH`; the saved measurement is attributed to `HUMAN_CONFIRMED_AI_ASSIST`, not to the model.
- Nominal diameter is the existing Tool Type catalog fact. A differing proposal cannot silently rewrite catalog geometry in this pilot.

This reuses MOS-138 identity, measurement, condition, version, and audit semantics. It does not expand tooling into another domain or implement broader MOS-138 work.

## UX, stale state, and accessibility

The tooling workspace exposes an explicit AI Assist action below contextual attachments. Uploading or listing an attachment never starts processing. Operators compare current authoritative and suggested values, see bounded source evidence, and review each field independently. Ambiguous, conflicting, invalid, not-found, and human-input states use plain text rather than color alone.

Review decisions are server-persisted. Request generations discard late responses, while review operations are serialized to preserve edits. Source changes, archived attachments, superseded processing, review-version conflicts, or tool-version conflicts block commit and retain the review for refresh/reprocessing. Provider failure does not clear the form or evidence.

Controls use semantic labels, live status announcements, keyboard-native buttons/inputs, visible Atlas focus treatment, touch-sized actions, and a single-column mobile comparison. The final action states exactly that reviewed values will be saved; no bulk accept action is provided.

## Performance and activation

Ordinary page load and attachment hydration remain AI-independent. Processing is explicit, review/proposal reads are fixed and bounded to 100 fields, and no continuous polling is introduced. Attachment metadata is reused for the review; full evidence download remains in the B-1 processing attempt only.

No live provider was configured or called. No production tenant, credentials, deployment, or evidence changed.

## MOS-140C handoff

Operational acceptance can exercise the Vitality tooling flow: select or capture a regrind label, request AI Assist, review nominal/condition suggestions, manually measure actual diameter, save reviewed values, and confirm the resulting physical Tool Instance, measurement, audit event, and review provenance. It must separately evaluate an approved live provider, real operator workflow, physical-device capture, and production activation decision.

Production changes: **NONE**.
