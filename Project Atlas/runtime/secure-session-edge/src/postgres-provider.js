import { createHmac, timingSafeEqual } from 'node:crypto';
import { errors } from './errors.js';

const MAX_LIMIT = 200;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SORTS = Object.freeze({ name: 'sort_name', occurredAt: 'occurred_at', createdAt: 'created_at' });

function requireScope(scope) {
  if (!scope?.authoritative || !ID.test(scope.tenantId || '') || !ID.test(scope.userId || '')) throw errors.forbidden();
  return scope;
}
function limitOf(value) { if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) throw errors.invalidInput(); return value; }
function recordId(value) { if (!ID.test(value || '')) throw errors.invalidInput(); return value; }
function safeJson(value) { return JSON.stringify(value || {}); }

/**
 * PostgreSQL implementation of the MOS-133B routine-record contract.  The
 * table and sortable columns are fixed here; callers cannot inject SQL shape.
 */
export class PostgresPersistenceProvider {
  constructor({ runtime, cursorSecret, executor = null, table = 'atlas_provider_contract_records', maxLimit = MAX_LIMIT } = {}) {
    if (!runtime || typeof cursorSecret !== 'string' || cursorSecret.length < 16 || table !== 'atlas_provider_contract_records') throw new Error('PostgreSQL provider configuration is unavailable.');
    this.runtime = runtime; this.executor = executor; this.table = table; this.maxLimit = Math.min(maxLimit, MAX_LIMIT); this.cursorSecret = cursorSecret;
    this.capabilities = Object.freeze({ atomicTransactions: true, optimisticConcurrency: true, indexedSearch: true, cursorPagination: true, boundedRoutineReads: true, migrationSupport: true });
  }
  async runInTransaction(fn, options = {}) {
    if (this.executor) throw new Error('Nested PostgreSQL transactions are unsupported.');
    return this.runtime.withTransaction('PERSISTENCE_TRANSACTION', async (tx) => fn(new PostgresPersistenceProvider({ runtime: this.runtime, cursorSecret: this.cursorSecret, executor: tx, table: this.table, maxLimit: this.maxLimit })), options);
  }
  async getForScope(scope, id) {
    scope = requireScope(scope); id = recordId(id);
    const result = await this.query('SELECT record_id, tenant_id, version, archived_at, command_id, request_fingerprint, sort_name, occurred_at, record_json, created_at, updated_at FROM atlas_provider_contract_records WHERE tenant_id = $1 AND record_id = $2', [scope.tenantId, id], 'GET');
    if (!result.rowCount) throw errors.notFound(); return this.row(result.rows[0]);
  }
  async existsForScope(scope, id) { try { await this.getForScope(scope, id); return true; } catch (error) { if (error.code === 'NOT_FOUND') return false; throw error; } }
  async listForScope(scope, { limit, orderBy = 'createdAt', direction = 'ASC', cursor, filters = {} } = {}) {
    scope = requireScope(scope); limit = limitOf(limit); if (limit > this.maxLimit) throw errors.invalidInput();
    const column = SORTS[orderBy]; if (!column || !['ASC', 'DESC'].includes(direction)) throw errors.invalidInput();
    const clauses = ['tenant_id = $1', 'archived_at IS NULL']; const values = [scope.tenantId];
    if (filters.name !== undefined) { if (typeof filters.name !== 'string' || filters.name.length > 160) throw errors.invalidInput(); values.push(filters.name); clauses.push(`sort_name = $${values.length}`); }
    const decoded = cursor ? this.decodeCursor(cursor, scope, orderBy, direction) : null;
    if (decoded) { values.push(decoded.value, decoded.id); clauses.push(`(${column}, record_id) ${direction === 'ASC' ? '>' : '<'} ($${values.length - 1}, $${values.length})`); }
    values.push(limit + 1);
    const sql = `SELECT record_id, tenant_id, version, archived_at, command_id, request_fingerprint, sort_name, occurred_at, record_json, created_at, updated_at FROM atlas_provider_contract_records WHERE ${clauses.join(' AND ')} ORDER BY ${column} ${direction}, record_id ${direction} LIMIT $${values.length}`;
    const result = await this.query(sql, values, 'LIST'); const rows = result.rows.slice(0, limit).map((row) => this.row(row)); const tail = result.rows[limit - 1];
    return { records: rows, nextCursor: result.rows.length > limit ? this.encodeCursor({ tenantId: scope.tenantId, orderBy, direction, value: tail[this.dbName(orderBy)], id: tail.record_id }) : null };
  }
  async createForScope(scope, record, { idempotencyCriteria } = {}) {
    scope = requireScope(scope); const id = recordId(record?.id); if (record.tenantId && record.tenantId !== scope.tenantId) throw errors.forbidden();
    const commandId = idempotencyCriteria?.commandId || record.commandId || null; const fingerprint = idempotencyCriteria?.requestFingerprint || record.requestFingerprint || null;
    if ((commandId && !ID.test(commandId)) || (fingerprint && !ID.test(fingerprint))) throw errors.invalidInput();
    if (commandId) { const prior = await this.query('SELECT request_fingerprint, record_id FROM atlas_provider_contract_records WHERE tenant_id = $1 AND command_id = $2', [scope.tenantId, commandId], 'IDEMPOTENCY_LOOKUP'); if (prior.rowCount) { if (prior.rows[0].request_fingerprint !== fingerprint) throw errors.persistenceConflict(); return { record: await this.getForScope(scope, prior.rows[0].record_id), replayed: true }; } }
    const canonical = { ...record, id, tenantId: scope.tenantId, version: 1 }; const result = await this.query('INSERT INTO atlas_provider_contract_records (record_id, tenant_id, version, command_id, request_fingerprint, sort_name, occurred_at, record_json) VALUES ($1,$2,1,$3,$4,$5,$6,$7::jsonb) RETURNING record_id, tenant_id, version, archived_at, command_id, request_fingerprint, sort_name, occurred_at, record_json, created_at, updated_at', [id, scope.tenantId, commandId, fingerprint, String(record.name || ''), record.occurredAt || new Date().toISOString(), safeJson(canonical)], 'CREATE');
    return { record: this.row(result.rows[0]), replayed: false };
  }
  async updateForScope(scope, id, changes, { expectedVersion } = {}) {
    scope = requireScope(scope); id = recordId(id); if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || changes?.tenantId && changes.tenantId !== scope.tenantId) throw errors.invalidInput();
    const previous = await this.getForScope(scope, id); if (previous.version !== expectedVersion) throw errors.persistenceConflict();
    const next = { ...previous, ...changes, id, tenantId: scope.tenantId, version: expectedVersion + 1 }; delete next.archivedAt;
    const result = await this.query('UPDATE atlas_provider_contract_records SET version = version + 1, sort_name = $1, occurred_at = $2, record_json = $3::jsonb, updated_at = NOW() WHERE tenant_id = $4 AND record_id = $5 AND version = $6 AND archived_at IS NULL RETURNING record_id, tenant_id, version, archived_at, command_id, request_fingerprint, sort_name, occurred_at, record_json, created_at, updated_at', [String(next.name || ''), next.occurredAt || previous.occurredAt, safeJson(next), scope.tenantId, id, expectedVersion], 'UPDATE');
    if (!result.rowCount) throw errors.persistenceConflict(); return this.row(result.rows[0]);
  }
  async archiveForScope(scope, id, { expectedVersion } = {}) {
    scope = requireScope(scope); id = recordId(id); if (!Number.isInteger(expectedVersion)) throw errors.invalidInput();
    const result = await this.query('UPDATE atlas_provider_contract_records SET archived_at = NOW(), version = version + 1, updated_at = NOW() WHERE tenant_id = $1 AND record_id = $2 AND version = $3 AND archived_at IS NULL RETURNING record_id, tenant_id, version, archived_at, command_id, request_fingerprint, sort_name, occurred_at, record_json, created_at, updated_at', [scope.tenantId, id, expectedVersion], 'ARCHIVE'); if (!result.rowCount) throw errors.persistenceConflict(); return this.row(result.rows[0]);
  }
  async appendForScope(scope, record, options) { return this.createForScope(scope, record, options); }
  async query(text, values, operation) { return this.executor ? this.executor.query(text, values, operation) : this.runtime.query(text, values, operation); }
  row(row) { return { ...row.record_json, id: row.record_id, tenantId: row.tenant_id, version: Number(row.version), archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null, commandId: row.command_id, requestFingerprint: row.request_fingerprint, name: row.sort_name, occurredAt: new Date(row.occurred_at).toISOString() }; }
  dbName(orderBy) { return SORTS[orderBy]; }
  encodeCursor(body) { const json = Buffer.from(JSON.stringify(body)).toString('base64url'); const mac = createHmac('sha256', this.cursorSecret).update(json).digest('base64url'); return `${json}.${mac}`; }
  decodeCursor(cursor, scope, orderBy, direction) { if (typeof cursor !== 'string' || cursor.length > 1024) throw errors.invalidInput(); const [json, mac] = cursor.split('.'); if (!json || !mac) throw errors.invalidInput(); const expected = createHmac('sha256', this.cursorSecret).update(json).digest('base64url'); if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) throw errors.invalidInput(); let body; try { body = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')); } catch { throw errors.invalidInput(); } if (body.tenantId !== scope.tenantId || body.orderBy !== orderBy || body.direction !== direction || !ID.test(body.id || '') || typeof body.value !== 'string') throw errors.invalidInput(); return body; }
}

export function trustedTenantScope(context) { return requireScope(context); }
