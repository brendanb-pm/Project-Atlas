# MOS-117E-2 Calendar UI/UX QA

## Scope

This QA pass covers the standalone calendar workspace at `?calendar=1`:
FollowUps, Today, and Calendar Settings. It does not authorize a deployment,
provider connection, or production mutation.

## Static verification completed

- Responsive breakpoints retain the existing two-column and single-column
  layouts for tablet and mobile sizes.
- Calendar mutation calls have both success and failure handlers, loading
  feedback, and duplicate-submit protection on the initial submission.
- The interface distinguishes the CRM deadline (`Due At`) from a scheduled
  calendar block (`Start At`, `End At`, and time zone).
- Calendar states, capability-aware actions, deletion actions, conflict
  actions, and provider-health states have UI contract coverage.
- The calendar workspace has a scoped visible keyboard-focus treatment.

## Required rendered QA before activation

Deploy only to an approved non-production validation target, then visit
`?calendar=1` at 1440x900, 1024x768, 768x1024, and 390x844. At each size,
inspect FollowUps, Today, and Calendar Settings for horizontal overflow,
clipped controls, overlapping text, inaccessible actions, and labels that
lose business meaning.

Exercise these fixture-driven flows with fake/provider-test states:

1. A Due At-only FollowUp displays as not scheduled and offers Schedule.
2. Scheduling validates date, start, end, and time zone; failed saves retain
   values; successful saves reload authoritative data; double-clicks submit
   once.
3. Calendar Settings distinguishes the MOS account from connected calendars
   and exposes no credentials or provider internals.
4. External deletion offers Keep Follow-up, Reschedule, Mark Complete, and
   Cancel Follow-up without implying that MOS data was deleted.
5. A schedule conflict clearly presents MOS and calendar times and supports
   each resolution action.
6. Reassigning to both connected and unconnected owners clearly explains the
   resulting calendar behavior.
7. Expired authorization, revoked access, outage, and sync errors remain
   actionable rather than producing a blank workspace.

Capture screenshots of each viewport and review flow as release evidence.

## MOS-117E-3 completion-gate findings

Code/functional status is **PARTIAL**. The provider-neutral services and fake
Google, Microsoft, Apple/iCloud, no-calendar, and iCal paths pass their
automated regression tests, but the operator UI boundary still has these
activation blockers:

1. Scheduling through `scheduleFollowUp` updates the MOS FollowUp but does not
   route a projection request to the owner's provider adapter.
2. The browser constructs entered wall-clock values with a `Z` suffix. That
   treats them as UTC even when the selected IANA time zone is not UTC.
3. A recoverable scheduling failure leaves the submit button disabled. The
   entered values remain visible, but the operator cannot retry without
   reopening the form.
4. Reassignment updates the MOS owner and explains the expected outcome, but
   it does not yet invoke old/new owner projection reconciliation.

These findings do not affect core CRM use when calendar providers are disabled.
They must be corrected and retested before writable calendar activation.

## Controlled rendered-QA record

For each cell, record `PASS`, `FAIL`, or `DEFECT` and link the captured image or
defect record. Do not mark the production calendar UX validated while any cell
is blank or contains `FAIL`/`DEFECT`.

| Workflow | 1440x900 | 1024x768 | 768x1024 | 390x844 |
| --- | --- | --- | --- | --- |
| FollowUps list / Due At-only record |  |  |  |  |
| Today schedule |  |  |  |  |
| Calendar Settings |  |  |  |  |
| Schedule FollowUp |  |  |  |  |
| External deletion review |  |  |  |  |
| Conflict review |  |  |  |  |
| Reassignment |  |  |  |  |
| Provider failure / recovery |  |  |  |  |

At every cell verify no horizontal scrolling, clipped controls, overlapping
text, hidden required fields, oversized dialogs, unusable touch controls,
ambiguous scheduling state, ambiguous account/connection state, technical
provider data, or unclear destructive-action consequences.
