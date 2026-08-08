# ADR: Asana Shop-Floor Sync

## Decision

VMOS is the authoritative system of record. Asana is a visual execution and Kanban interaction surface only. It is not authoritative for jobs, workflow history, customer communications, financials, documents, tooling, materials, or audits.

An Asana section move is a request: `Asana move -> VMOS validation -> canonical VMOS status update -> append-only JobEvent -> Asana reconciliation -> notification-rule evaluation`. Rejected requests leave VMOS unchanged, create a `REJECTED` ExternalSyncEvent, and instruct Asana to return/flag the card with an operator-readable reason. Customer notifications can originate only from an accepted VMOS status change.

## Sync safety

- Every inbound request has a provider, external task ID, and correlation/idempotency ID. Replayed IDs return the original sync result.
- VMOS serializes a job transition; its configured workflow validates the current state and permitted service path.
- VMOS is authoritative during conflict reconciliation. If cards and VMOS disagree, the card is moved/flagged to VMOS's state.
- Events carry a correlation ID and origin to prevent feedback loops. Out-of-order events are rejected when their transition is no longer permitted.
- A board adapter has only `requestCreate`, `requestMove`, and `requestReconcile` responsibilities. No adapter writes canonical data.

## Consequences

Live configuration must map one Asana project/section to a VMOS workflow/status mapping and provide durable stores below. Webhook/polling authentication, retries, rate limits, and a dead-letter/review view require a separate activation review. No live Asana integration is included in this decision.
