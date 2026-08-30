# Atlas Six-Story Model-Efficiency Experiment

**Status:** ACTIVE

**Next slot:** A1

**Setup date:** 2026-08-30

**Canonical Standards baseline at setup:**
`68a6d872c96c88d002b2d2605c407c42a1058a03`

This temporary experiment measures whether Terra can replace a meaningful
portion of Sol usage while preserving Atlas implementation quality and
increasing accepted stories per Codex compute cycle. It does not change the
canonical selector and is not itself an experiment story.

## Slot ladder

| Slot | Required model / effort | Naturally suitable work | Status |
|---|---|---|---|
| A1 | Terra — Medium | Bounded / straightforward feature | OPEN |
| A2 | Terra — Medium | Bounded / straightforward feature | OPEN |
| A3 | Terra — High | Moderately complex, cross-file, or business-rule-heavy | OPEN |
| A4 | Terra — High | Moderately complex, cross-file, or business-rule-heavy | OPEN |
| A5 | Terra — Extra High | Hard but bounded | OPEN |
| A6 | Sol — Medium | High-risk but bounded control | OPEN |

Fill slots in order. A real story that does not naturally fit the next open
slot proceeds outside the experiment under the canonical selector; the slot
stays open. Do not invent work or alter scope, acceptance, verification, or
architecture standards to obtain a fit.

Skip Terra for material changes to authorization/security architecture,
tenant-isolation boundaries, payment or financial-integrity invariants,
irreversible/destructive migrations, recovery/idempotency architecture,
systemic reconciliation/corruption logic, or highly ambiguous architecture
with broad blast radius. Exceptional Sol High work is outside the six slots
unless the user explicitly revises the experiment.

## Start gate

Before launching implementation for an experimental story, stop and send
exactly:

```text
INSTRUMENTATION START
Please record:

- current 5-hour Codex compute %
- current weekly/secondary compute % if visible
```

Do not begin implementation until the user supplies the values. Preserve the
values verbatim and note whether each percentage means used or remaining when
the user exposes that distinction. Then record:

- slot and story ID;
- selected model/effort and natural complexity;
- start timestamp;
- starting 5-hour and weekly/secondary percentages.

Model and effort remain stable during the run. If the selected tier proves
unsafe or insufficient, stop at a clean boundary, preserve safe work, and
record the escalation rather than silently switching models.

## Completion gate

After execution—including its required verification and requested Git
delivery—finishes, stop before starting any other Codex story and send exactly:

```text
INSTRUMENTATION CHECKPOINT
Please record:

- current 5-hour Codex compute %
- current weekly/secondary compute % if visible
```

Record the supplied ending percentages and these observed facts:

- elapsed wall time from the recorded start and end timestamps;
- first-pass `PASS`, `PARTIAL`, or `FAIL`;
- correction/retry loops;
- implementation-caused test failures;
- defects found during verification, including severity/class;
- whether model escalation was required;
- observed Auto Review invocation count;
- final story status and commit/SHA;
- notable architecture or quality concerns.

Do not infer unexposed compute, runtime model, priority, or Auto Review data.
Updating this tracker to close the slot is checkpoint closure, not another
experiment story.

## Observation records

Keep one JSON record per slot. Replace nulls only with observed or user-supplied
values. `computeStart` and `computeEnd` preserve the user's percentages and
whether they mean used or remaining; `computeConsumed` is calculated only when
the two checkpoints are comparable.

```json
{"slot":"A1","status":"OPEN","story":null,"complexity":null,"start":null,"end":null,"computeStart":{"fiveHour":null,"weekly":null},"computeEnd":{"fiveHour":null,"weekly":null},"computeConsumed":null,"elapsed":null,"firstPass":null,"retries":null,"implementationTestFailures":null,"defects":null,"escalation":null,"autoReview":null,"acceptance":null,"commit":null,"concerns":null}
{"slot":"A2","status":"OPEN","story":null,"complexity":null,"start":null,"end":null,"computeStart":{"fiveHour":null,"weekly":null},"computeEnd":{"fiveHour":null,"weekly":null},"computeConsumed":null,"elapsed":null,"firstPass":null,"retries":null,"implementationTestFailures":null,"defects":null,"escalation":null,"autoReview":null,"acceptance":null,"commit":null,"concerns":null}
{"slot":"A3","status":"OPEN","story":null,"complexity":null,"start":null,"end":null,"computeStart":{"fiveHour":null,"weekly":null},"computeEnd":{"fiveHour":null,"weekly":null},"computeConsumed":null,"elapsed":null,"firstPass":null,"retries":null,"implementationTestFailures":null,"defects":null,"escalation":null,"autoReview":null,"acceptance":null,"commit":null,"concerns":null}
{"slot":"A4","status":"OPEN","story":null,"complexity":null,"start":null,"end":null,"computeStart":{"fiveHour":null,"weekly":null},"computeEnd":{"fiveHour":null,"weekly":null},"computeConsumed":null,"elapsed":null,"firstPass":null,"retries":null,"implementationTestFailures":null,"defects":null,"escalation":null,"autoReview":null,"acceptance":null,"commit":null,"concerns":null}
{"slot":"A5","status":"OPEN","story":null,"complexity":null,"start":null,"end":null,"computeStart":{"fiveHour":null,"weekly":null},"computeEnd":{"fiveHour":null,"weekly":null},"computeConsumed":null,"elapsed":null,"firstPass":null,"retries":null,"implementationTestFailures":null,"defects":null,"escalation":null,"autoReview":null,"acceptance":null,"commit":null,"concerns":null}
{"slot":"A6","status":"OPEN","story":null,"complexity":null,"start":null,"end":null,"computeStart":{"fiveHour":null,"weekly":null},"computeEnd":{"fiveHour":null,"weekly":null},"computeConsumed":null,"elapsed":null,"firstPass":null,"retries":null,"implementationTestFailures":null,"defects":null,"escalation":null,"autoReview":null,"acceptance":null,"commit":null,"concerns":null}
```

## Six-story conclusion

After all slots close, add a comparison table containing slot, story,
complexity, model/effort, compute consumed, elapsed time, first-pass result,
retries, defects, escalation, Auto Review count, and final acceptance. Recommend
the permanent Atlas ladder from measured throughput and quality. Do not modify
the canonical selector without separate user approval.
