import { randomUUID } from 'node:crypto';
import { EdgeError, errors } from './errors.js';

const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const done = new Set(['COMPLETE', 'COMPLETED']);
const closed = new Set([...done, 'CANCELLED']);

function id(value) {
  if (typeof value !== 'string' || !identifier.test(value)) throw errors.invalidInput();
  return value;
}

function text(value, limit, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw errors.invalidInput();
  return value.trim();
}

function list(value, normalize) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 50) throw errors.invalidInput();
  return value.map(normalize);
}

function version(input) {
  if (!Number.isInteger(input) || input < 1) throw errors.invalidInput();
  return input;
}

function authorization(context, capability) {
  if (!context?.authoritative || typeof context.tenantId !== 'string' || !identifier.test(context.tenantId) ||
      context.tenantId.startsWith('PLATFORM_') || typeof context.userId !== 'string' ||
      !identifier.test(context.userId) || !Array.isArray(context.capabilities) ||
      !context.capabilities.includes(capability)) throw errors.forbidden();
  return context;
}

function approvedInput(input) {
  const dueAt = input.dueAt == null || input.dueAt === '' ? null : input.dueAt;
  if (dueAt !== null && (typeof dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(dueAt) ||
      Number.isNaN(Date.parse(dueAt)))) throw errors.invalidInput();
  const price = input.approvedPrice || null;
  if (price && (typeof price.amount !== 'string' || !/^\d{1,12}(?:\.\d{1,2})?$/.test(price.amount) ||
      typeof price.currency !== 'string' || !/^[A-Z]{3}$/.test(price.currency))) throw errors.invalidInput();
  const finish = text(input.finish, 512);
  const finishOperationCode = finish ? id(input.finishOperationCode) : '';
  const additions = list(input.operationsToAdd, (operation) => {
    if (!operation || typeof operation !== 'object') throw errors.invalidInput();
    return { code: id(operation.code), instructions: text(operation.instructions, 1000), jobOperationId: `JOB-OP-${randomUUID()}` };
  });
  return {
    expectedVersion: version(input.expectedVersion),
    authorizationSource: text(input.authorizationSource, 512, true),
    changeSummary: text(input.changeSummary, 1000, true),
    additions,
    scope: {
      services: list(input.services, (value) => text(value, 160, true)),
      finish,
      finishOperationCode,
      customerCommitments: text(input.customerCommitments, 1000),
      approvedPrice: price && { amount: price.amount, currency: price.currency },
      dueAt: dueAt && new Date(dueAt).toISOString(),
      specialInstructions: text(input.specialInstructions, 1500),
      handoffs: list(input.handoffs, (value) => text(value, 160, true)),
      evidenceReferences: list(input.evidenceReferences, id)
    }
  };
}

export class WorkOrderService {
  constructor({ repository }) {
    this.repository = repository;
  }

  read(context, jobId) {
    return this.repository.read(authorization(context, 'WORK_ORDER_READ'), id(jobId));
  }

  history(context, jobId, beforeRevision) {
    return this.repository.history(authorization(context, 'WORK_ORDER_READ'), id(jobId),
      beforeRevision == null ? null : version(beforeRevision));
  }

  queue(context) {
    return this.repository.queue(authorization(context, 'WORK_ORDER_READ'));
  }

  approve(context, jobId, input) {
    return this.repository.approve(authorization(context, 'WORK_ORDER_APPROVE'), id(jobId), approvedInput(input));
  }

  complete(context, jobId, input) {
    return this.repository.complete(authorization(context, 'WORK_ORDER_OPERATE'), id(jobId), version(input.expectedVersion));
  }

  completeOperation(context, jobId, operationId, input) {
    return this.repository.completeOperation(authorization(context, 'WORK_ORDER_OPERATE'),
      id(jobId), id(operationId), version(input.expectedVersion));
  }
}

export class PostgresWorkOrderRepository {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  async read(context, jobId) {
    return this.runtime.withTransaction('WORK_ORDER_READ', async (tx) => {
      const key = [context.tenantId, jobId];
      const job = await this.job(tx, key);
      const approved = await this.current(tx, key);
      const operations = await this.operations(tx, key);
      const open = operations.filter((operation) => !closed.has(operation.status));
      const finished = new Set(operations.filter((operation) => done.has(operation.status)).map((operation) => operation.job_operation_id));
      const readiness = !approved ? 'APPROVAL_REQUIRED' : closed.has(job.status) ? job.status :
        open.length || approved.scope.operations.some((operation) => !finished.has(operation.jobOperationId))
          ? 'OPERATIONS_INCOMPLETE' : 'READY';
      const { rows } = await tx.query(
        `SELECT a.wip_bin_id, b.bin_label, b.current_location
         FROM atlas_wip_bin_assignments a JOIN atlas_wip_bins b USING (tenant_id, wip_bin_id)
         WHERE a.tenant_id=$1 AND a.job_id=$2 AND a.status='ACTIVE'`, key);
      return { job, approved, operations, readiness, bin: rows[0] ?? null };
    }, { isolation: 'REPEATABLE READ' });
  }

  async history(context, jobId, beforeRevision) {
    const key = [context.tenantId, jobId];
    await this.job(this.runtime, key);
    return (await this.runtime.query(
      `SELECT revision, approved_by_user_id, approved_at, authorization_source, change_summary, scope
       FROM atlas_work_order_revisions WHERE tenant_id=$1 AND job_id=$2
       AND ($3::integer IS NULL OR revision<$3) ORDER BY revision DESC LIMIT 50`, [...key, beforeRevision])).rows;
  }

  async queue(context) {
    return (await this.runtime.query(
      `SELECT j.job_id, j.title, j.due_at, r.revision,
              CASE WHEN o.job_operation_id=r.scope->>'finishOperationId' THEN r.scope->>'finish' END AS finish,
              o.job_operation_id, o.operation_code, o.status
       FROM atlas_jobs j
       JOIN LATERAL (SELECT revision, scope FROM atlas_work_order_revisions
         WHERE tenant_id=j.tenant_id AND job_id=j.job_id ORDER BY revision DESC LIMIT 1) r ON true
       JOIN atlas_job_operations o USING (tenant_id, job_id)
       WHERE j.tenant_id=$1 AND j.archived_at IS NULL AND j.status NOT IN ('COMPLETE','COMPLETED','CANCELLED')
         AND o.status NOT IN ('COMPLETE','COMPLETED','CANCELLED')
       ORDER BY j.due_at NULLS LAST, j.job_id, o.sequence_number LIMIT 100`, [context.tenantId])).rows;
  }

  approve(context, jobId, input) {
    return this.mutate(context, jobId, input.expectedVersion, async (tx, key) => {
      const previous = await this.current(tx, key);
      const existing = await this.operations(tx, key);
      if (existing.length + input.additions.length > 200) throw errors.invalidInput();
      let sequence = existing.at(-1)?.sequence_number || 0;
      for (const addition of input.additions) {
        sequence += 1;
        await tx.query(`INSERT INTO atlas_job_operations
          (tenant_id, job_id, job_operation_id, sequence_number, operation_code) VALUES ($1,$2,$3,$4,$5)`,
        [...key, addition.jobOperationId, sequence, addition.code]);
      }
      const operations = await this.operations(tx, key);
      const finishOperations = operations.filter((operation) => operation.operation_code === input.scope.finishOperationCode &&
        operation.status !== 'CANCELLED');
      if (input.scope.finish && (finishOperations.length !== 1 ||
          (previous?.scope.finish !== input.scope.finish && done.has(finishOperations[0].status)))) throw errors.invalidInput();
      const instructions = new Map([
        ...(previous?.scope.operations || []).map((operation) => [operation.jobOperationId, operation.instructions]),
        ...input.additions.map((operation) => [operation.jobOperationId, operation.instructions])
      ]);
      const scope = { ...input.scope, operations: operations.filter((operation) => operation.status !== 'CANCELLED')
        .map((operation) => ({
          jobOperationId: operation.job_operation_id, code: operation.operation_code,
          instructions: instructions.get(operation.job_operation_id) || ''
        })) };
      if (input.scope.finish) scope.finishOperationId = finishOperations[0].job_operation_id;
      if (!scope.operations.length) throw errors.invalidInput();
      const { rows } = await tx.query(
        `INSERT INTO atlas_work_order_revisions
         (tenant_id, job_id, revision, approved_by_user_id, authorization_source, change_summary, scope)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING revision, approved_at`,
        [...key, (previous?.revision || 0) + 1, context.userId, input.authorizationSource, input.changeSummary, JSON.stringify(scope)]);
      await this.refresh(tx, key, operations, scope.dueAt);
      return rows[0];
    });
  }

  completeOperation(context, jobId, operationId, expectedVersion) {
    return this.mutate(context, jobId, expectedVersion, async (tx, key, job) => {
      const approved = await this.requireApproval(tx, key);
      if (!approved.scope.operations.some((operation) => operation.jobOperationId === operationId)) throw errors.notFound();
      const result = await tx.query(`UPDATE atlas_job_operations SET status='COMPLETE', completed_at=NOW(),
        updated_at=NOW(),version=version+1 WHERE tenant_id=$1 AND job_id=$2 AND job_operation_id=$3
        AND status NOT IN ('COMPLETE','COMPLETED','CANCELLED') RETURNING job_operation_id`, [...key, operationId]);
      if (!result.rowCount) throw errors.persistenceConflict();
      await this.refresh(tx, key, await this.operations(tx, key), job.due_at);
      return result.rows[0];
    });
  }

  complete(context, jobId, expectedVersion) {
    return this.mutate(context, jobId, expectedVersion, async (tx, key) => {
      const approved = await this.requireApproval(tx, key);
      const operations = await this.operations(tx, key);
      const status = new Map(operations.map((operation) => [operation.job_operation_id, operation.status]));
      if (approved.scope.operations.some((operation) => !done.has(status.get(operation.jobOperationId))) ||
          operations.some((operation) => !closed.has(operation.status))) {
        throw new EdgeError('OPERATIONS_INCOMPLETE', 'Complete all approved required operations before completing this work order.', 409);
      }
      const { rows } = await tx.query(`UPDATE atlas_jobs SET status='COMPLETE', version=version+1,
        current_operation_code=NULL, updated_at=NOW() WHERE tenant_id=$1 AND job_id=$2 RETURNING job_id, status, version`, key);
      return rows[0];
    });
  }

  mutate(context, jobId, expectedVersion, work) {
    const key = [context.tenantId, jobId];
    return this.runtime.withTransaction('WORK_ORDER_MUTATION', async (tx) => {
      const job = await this.job(tx, key, true);
      if (job.version !== expectedVersion || closed.has(job.status)) throw errors.persistenceConflict();
      return work(tx, key, job);
    }, { retryable: true });
  }

  async job(tx, key, lock = false) {
    const { rows } = await tx.query(`SELECT job_id, title, status, due_at, version FROM atlas_jobs
      WHERE tenant_id=$1 AND job_id=$2 AND archived_at IS NULL ${lock ? 'FOR UPDATE' : ''}`, key);
    if (!rows.length) throw errors.notFound();
    return rows[0];
  }

  async current(tx, key) {
    const { rows } = await tx.query(`SELECT revision, approved_by_user_id, approved_at, authorization_source, change_summary, scope
      FROM atlas_work_order_revisions WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 1`, key);
    return rows[0] ?? null;
  }

  async requireApproval(tx, key) {
    const result = await this.current(tx, key);
    if (!result) throw new EdgeError('APPROVAL_REQUIRED', 'Approve the production scope before starting work.', 409);
    return result;
  }

  async operations(tx, key) {
    return (await tx.query(`SELECT job_operation_id, operation_code, sequence_number, status FROM atlas_job_operations
      WHERE tenant_id=$1 AND job_id=$2 ORDER BY sequence_number`, key)).rows;
  }

  refresh(tx, key, operations, dueAt) {
    const current = operations.find((operation) => !closed.has(operation.status));
    return tx.query(`UPDATE atlas_jobs SET due_at=$3, current_operation_code=$4, version=version+1,
      updated_at=NOW() WHERE tenant_id=$1 AND job_id=$2`, [...key, dueAt, current?.operation_code ?? null]);
  }
}
