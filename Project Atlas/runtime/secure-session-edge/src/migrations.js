import { createHash } from 'node:crypto';
import { errors } from './errors.js';
import { DOMAIN_MIGRATIONS } from './domain-migrations.js';

const foundationSql = `
CREATE TABLE IF NOT EXISTS atlas_installation (
  installation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS atlas_auth_sessions (
  session_id TEXT PRIMARY KEY,
  opaque_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  permitted_tenants JSONB NOT NULL,
  active_tenant TEXT NOT NULL DEFAULT '',
  issued_at TIMESTAMPTZ NOT NULL,
  authenticated_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  status TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  authentication_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  replaced_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS atlas_auth_sessions_user_active_idx ON atlas_auth_sessions (user_id, last_activity_at DESC) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS atlas_auth_sessions_expiry_idx ON atlas_auth_sessions (absolute_expires_at);
CREATE TABLE IF NOT EXISTS atlas_provider_contract_records (
  record_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  archived_at TIMESTAMPTZ,
  command_id TEXT,
  request_fingerprint TEXT,
  sort_name TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, record_id),
  CONSTRAINT atlas_provider_contract_records_version CHECK (version > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS atlas_provider_contract_command_idx ON atlas_provider_contract_records (tenant_id, command_id) WHERE command_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_provider_contract_list_idx ON atlas_provider_contract_records (tenant_id, created_at, record_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS atlas_provider_contract_name_idx ON atlas_provider_contract_records (tenant_id, sort_name, record_id) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS atlas_security_events (
  event_id TEXT PRIMARY KEY,
  tenant_id TEXT,
  correlation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);`;

export const FOUNDATION_MIGRATIONS = Object.freeze([
  { id: '0001_postgres_foundation', sql: foundationSql, checksum: createHash('sha256').update(foundationSql).digest('hex') },
  ...DOMAIN_MIGRATIONS
]);

export class PostgresMigrationRunner {
  constructor({ runtime, migrations = FOUNDATION_MIGRATIONS, lock = null } = {}) { if (!runtime) throw new Error('Migration runner requires PostgreSQL runtime.'); this.runtime = runtime; this.migrations = migrations; this.lock = lock; }
  async ensureMetadata() { await this.runtime.query('CREATE TABLE IF NOT EXISTS atlas_schema_migrations (migration_id TEXT PRIMARY KEY, checksum TEXT NOT NULL, status TEXT NOT NULL, applied_at TIMESTAMPTZ, failure_code TEXT)', [], 'MIGRATION_METADATA'); }
  async status() {
    try { const result = await this.runtime.query('SELECT migration_id, checksum, status FROM atlas_schema_migrations ORDER BY migration_id ASC', [], 'MIGRATION_STATUS'); return this.assess(result.rows); }
    catch (error) { if (error.code === 'SCHEMA_INCOMPATIBLE' || error.code === 'PERSISTENCE_UNAVAILABLE') return { state: 'UPGRADE_REQUIRED', ready: false }; throw error; }
  }
  assess(applied) {
    const byId = new Map(applied.map((row) => [row.migration_id, row]));
    for (const migration of this.migrations) { const row = byId.get(migration.id); if (row && row.checksum !== migration.checksum) return { state: 'CHECKSUM_MISMATCH', ready: false }; if (row?.status === 'FAILED' || row?.status === 'RUNNING') return { state: 'MIGRATION_INCOMPLETE', ready: false }; if (!row || row.status !== 'APPLIED') return { state: 'UPGRADE_REQUIRED', ready: false }; }
    if (applied.some((row) => !this.migrations.some((migration) => migration.id === row.migration_id))) return { state: 'SCHEMA_AHEAD', ready: false };
    return { state: 'CURRENT', ready: true };
  }
  async apply() {
    if (this.runtime.config.role !== 'MIGRATION') throw errors.forbidden();
    await this.ensureMetadata(); const release = await this.acquireLock();
    try {
      const current = await this.runtime.query('SELECT migration_id, checksum, status FROM atlas_schema_migrations ORDER BY migration_id ASC', [], 'MIGRATION_CHECK'); const assessment = this.assess(current.rows);
      if (assessment.state === 'CHECKSUM_MISMATCH' || assessment.state === 'SCHEMA_AHEAD') throw errors.schemaIncompatible();
      for (const migration of this.migrations) {
        const row = current.rows.find((candidate) => candidate.migration_id === migration.id); if (row?.status === 'APPLIED') continue;
        await this.runtime.query('INSERT INTO atlas_schema_migrations (migration_id, checksum, status) VALUES ($1,$2,$3) ON CONFLICT (migration_id) DO UPDATE SET checksum = EXCLUDED.checksum, status = EXCLUDED.status, failure_code = NULL', [migration.id, migration.checksum, 'RUNNING'], 'MIGRATION_MARK_RUNNING');
        try { await this.runtime.withTransaction('MIGRATION_APPLY', async (tx) => { await tx.query(migration.sql, [], 'MIGRATION_SQL'); }); await this.runtime.query('UPDATE atlas_schema_migrations SET status = $1, applied_at = NOW(), failure_code = NULL WHERE migration_id = $2', ['APPLIED', migration.id], 'MIGRATION_MARK_APPLIED'); }
        catch (error) { await this.runtime.query('UPDATE atlas_schema_migrations SET status = $1, failure_code = $2 WHERE migration_id = $3', ['FAILED', error.code || 'UNKNOWN', migration.id], 'MIGRATION_MARK_FAILED'); throw error; }
      }
      return this.status();
    } finally { await release(); }
  }
  async acquireLock() {
    if (this.lock) return this.lock.acquire();
    if (!this.runtime.acquireAdvisoryLock) throw errors.persistenceUnavailable();
    return this.runtime.acquireAdvisoryLock('atlas-schema-migrations');
  }
}

export class RuntimeReadiness {
  constructor({ runtime, migrations, sessionStore } = {}) { this.runtime = runtime; this.migrations = migrations; this.sessionStore = sessionStore; }
  async liveness() { return { status: 'LIVE' }; }
  async readiness() { try { await this.runtime.query('SELECT 1 AS ready', [], 'READINESS_DATABASE'); const schema = await this.migrations.status(); if (!schema.ready || !this.sessionStore) return { status: 'NOT_READY', reason: schema.state }; return { status: 'READY' }; } catch { return { status: 'NOT_READY', reason: 'DEPENDENCY_UNAVAILABLE' }; } }
}
