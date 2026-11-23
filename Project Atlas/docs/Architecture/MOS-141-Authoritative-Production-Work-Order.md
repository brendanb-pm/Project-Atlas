# MOS-141 Authoritative Production Work Order

The canonical Job ID identifies the work order. Approved scope lives in a tenant-scoped revision history keyed to that Job. Required operations remain in `atlas_job_operations`. The work order and MOS-137 scan read the active assignment through the same Job ID.

## Operator workflow

The existing tenant edge serves `/work-orders` when composed with the PostgreSQL application runtime, durable session store, and configured tenant authority. The page presents the approved scope, operations, finish, approval evidence, revision history, active bin, and completion readiness. The production queue lists pending operations for approved jobs and places a finish instruction on its linked operation.

- `WORK_ORDER_READ` permits viewing the work order, queue, and history.
- `WORK_ORDER_APPROVE` permits explicitly approving scope, including additions to existing operations. Approval records the actor, timestamp, supplied source, evidence references, and summary. The complete prior approved revision stays available.
- `WORK_ORDER_OPERATE` permits completing approved operations and the Job. Completion fails while any approved operation remains incomplete. Bin release continues to use MOS-137.

Scope revisions accept the complete approved metadata and append required operations to the existing sequence. Existing operation identities and execution history stay intact. A finish must reference a uniquely identifiable required operation. Evidence references are operator-supplied identifiers. No communication provider can approve a revision. Each mutation serializes on the Job row and checks the version the operator saw. Validation errors and database failures roll back the revision and its operation changes together.

## Migration and rollback

Migration `0016_authoritative_work_order` is additive and follows MOS-140C migration `0015_authenticated_tenant_runtime`. Existing Jobs, operation histories, statuses, and WIP links are preserved. Existing scope needs an explicit initial approval before it enters the approved queue. No backfill infers approval from prior job status.

Grant the application role SELECT and INSERT on the revision table. Existing Job and operation write grants serve the transactional projection. Approval uses the current tenant context supplied by the established edge authority. The route stays unavailable until the host supplies the application runtime.

Operational rollback drains write traffic and disables the feature by omitting the work-order runtime from the edge composition. Keep the additive table and committed operations. The migration runner rejects an unknown applied migration, so an older runtime that consults schema readiness requires a compatibility artifact carrying `0016` in its known chain before restarting. There is no destructive down migration. Reconcile any completed production state before changing routing.

## Verification

From `Project Atlas/runtime/secure-session-edge`, run `npm ci`, `npm run test:postgres`, and `npm test`. The disposable PostgreSQL integration suite covers existing-row retention, approval, isolation, state transitions, stale and concurrent writes, failure recovery, HTTP authorization, and MOS-137 compatibility.
