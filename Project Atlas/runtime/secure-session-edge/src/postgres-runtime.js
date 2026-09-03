import pg from 'pg';
import { EdgeError, errors } from './errors.js';

const { Pool } = pg;
const TRANSIENT_CODES = new Set(['40001', '40P01', '57P01', '57P02', '57P03', '53300', '57014', '08000', '08003', '08006']);

function positive(value, fallback, min, max) { const n = Number(value ?? fallback); if (!Number.isInteger(n) || n < min || n > max) throw new Error('PostgreSQL runtime configuration is invalid.'); return n; }
function required(value) { return typeof value === 'string' && value.trim().length > 0; }

/** Server-only configuration. The password is supplied by an injected tenant secret provider. */
export async function createPostgresRuntimeConfig(input = {}, { secretProvider } = {}) {
  const environment = input.environment || 'preproduction', production = environment === 'production';
  if (!['test', 'development', 'preproduction', 'production'].includes(environment) || !required(input.host) || !required(input.database) || !required(input.user) || !secretProvider?.getSecret) throw new Error('PostgreSQL runtime configuration is unavailable.');
  const password = await secretProvider.getSecret(input.passwordSecretRef); if (!required(password)) throw new Error('PostgreSQL runtime configuration is unavailable.');
  const tls = input.tls || {};
  if (production && (tls.required !== true || tls.rejectUnauthorized !== true)) throw new Error('Production PostgreSQL requires authenticated TLS.');
  return Object.freeze({ environment, production, host: input.host, port: positive(input.port, 5432, 1, 65535), database: input.database, user: input.user, password, role: input.role || 'APPLICATION', tls: Object.freeze({ required: tls.required === true, rejectUnauthorized: tls.rejectUnauthorized === true, ca: tls.ca || undefined }), pool: Object.freeze({ max: positive(input.pool?.max, 10, 1, 50), idleTimeoutMs: positive(input.pool?.idleTimeoutMs, 30000, 1000, 300000), connectionTimeoutMs: positive(input.pool?.connectionTimeoutMs, 5000, 100, 60000), statementTimeoutMs: positive(input.pool?.statementTimeoutMs, 5000, 100, 60000), touchIntervalMs: positive(input.pool?.touchIntervalMs, 60000, 1000, 900000) }) });
}

export class PostgresRuntime {
  constructor(config, { PoolCtor = Pool, log = () => {}, pool } = {}) {
    if (!config || !['APPLICATION', 'MIGRATION'].includes(config.role)) throw new Error('PostgreSQL role configuration is invalid.');
    this.config = config; this.log = log; this.pool = pool || new PoolCtor({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password, max: config.pool.max, idleTimeoutMillis: config.pool.idleTimeoutMs, connectionTimeoutMillis: config.pool.connectionTimeoutMs, ssl: config.tls.required ? { rejectUnauthorized: config.tls.rejectUnauthorized, ca: config.tls.ca } : false, options: `-c statement_timeout=${config.pool.statementTimeoutMs}`, application_name: 'atlas-tenant-runtime' });
  }
  async query(text, values = [], operation = 'QUERY') {
    const started = performance.now();
    try { const result = await this.pool.query({ text, values, query_timeout: this.config.pool.statementTimeoutMs }); this.log({ operation, outcome: 'SUCCESS', durationMs: Math.round(performance.now() - started) }); return result; }
    catch (error) { this.log({ operation, outcome: classifyPgError(error), durationMs: Math.round(performance.now() - started) }); const mapped = mapPgError(error); mapped.cause = error; throw mapped; }
  }
  async withTransaction(operation, fn, { isolation = 'READ COMMITTED', retryable = false } = {}) {
    if (this.config.role !== 'APPLICATION' && this.config.role !== 'MIGRATION') throw errors.persistenceUnavailable();
    const attempts = retryable ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let client; try {
        if (!['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'].includes(isolation)) throw errors.invalidInput();
        client = await this.pool.connect(); await client.query(`BEGIN ISOLATION LEVEL ${isolation}`); const tx = new PostgresTransaction(this, client);
        const result = await fn(tx); await client.query('COMMIT'); return result;
      } catch (error) {
        try { await client?.query('ROLLBACK'); } catch { /* safe cleanup only */ }
        if (attempt + 1 < attempts && isSafeRetryable(error)) continue;
        throw mapPgError(error);
      } finally { client?.release(); }
    }
  }
  async acquireAdvisoryLock(key) {
    if (this.config.role !== 'MIGRATION' || !/^[a-z0-9-]{1,80}$/.test(String(key || ''))) throw errors.forbidden();
    let client; const started = performance.now();
    try {
      client = await this.pool.connect();
      await client.query({ text: 'SELECT pg_advisory_lock(hashtext($1))', values: [key], query_timeout: this.config.pool.statementTimeoutMs });
      this.log({ operation: 'MIGRATION_LOCK', outcome: 'SUCCESS', durationMs: Math.round(performance.now() - started) });
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try { await client.query({ text: 'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked', values: [key], query_timeout: this.config.pool.statementTimeoutMs }); }
        catch (error) { throw mapPgError(error); }
        finally { client.release(); }
      };
    } catch (error) {
      client?.release();
      this.log({ operation: 'MIGRATION_LOCK', outcome: classifyPgError(error), durationMs: Math.round(performance.now() - started) });
      throw mapPgError(error);
    }
  }
  async close() { await this.pool.end(); }
  async liveness() { return { live: true }; }
  async rollbackSmoke(operation = 'TRANSACTION_ROLLBACK_SMOKE') {
    let client;
    try { client = await this.pool.connect(); await client.query('BEGIN READ ONLY'); await client.query('SELECT 1 AS transaction_smoke'); await client.query('ROLLBACK'); return { rolledBack: true }; }
    catch (error) { try { await client?.query('ROLLBACK'); } catch { /* safe cleanup only */ } throw mapPgError(error); }
    finally { client?.release(); }
  }
}

export class PostgresTransaction {
  constructor(runtime, client) { this.runtime = runtime; this.client = client; this.active = true; }
  async query(text, values = [], operation = 'TRANSACTION_QUERY') {
    if (!this.active) throw errors.persistenceUnavailable();
    try { return await this.client.query({ text, values, query_timeout: this.runtime.config.pool.statementTimeoutMs }); } catch (error) { const mapped=mapPgError(error);mapped.cause=error;throw mapped; }
  }
  async withTransaction() { throw new Error('Nested PostgreSQL transactions are unsupported.'); }
}

export function mapPgError(error) {
  if (error instanceof EdgeError) return error;
  if (error?.code === '23505') return errors.persistenceConflict();
  if (error?.code === '40001' || error?.code === '40P01') return errors.persistenceConflict();
  if (error?.code === '42501') return errors.forbidden();
  if (error?.code === '42P01' || error?.code === '42703') return errors.schemaIncompatible();
  if (error?.code === '57014') return errors.persistenceUnavailable();
  if (error?.code?.startsWith('08') || TRANSIENT_CODES.has(error?.code) || /timeout|connect|terminat/i.test(String(error?.message || ''))) return errors.persistenceUnavailable();
  return errors.persistenceUnavailable();
}
function classifyPgError(error) { return error?.code && TRANSIENT_CODES.has(error.code) ? 'TEMPORARY_FAILURE' : 'DATABASE_FAILURE'; }
function isSafeRetryable(error) { return error?.code === '40001' || error?.code === '40P01'; }
