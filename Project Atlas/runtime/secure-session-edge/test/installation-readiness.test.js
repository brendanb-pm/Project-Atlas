import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createPostgresRuntimeConfig, PostgresRuntime } from '../src/postgres-runtime.js';
import { FOUNDATION_MIGRATIONS, PostgresMigrationRunner } from '../src/migrations.js';
import { PostgresInstallationReadinessValidator } from '../src/postgres-readiness.js';

async function fixture({ migrate = true, expectedTenantId = 'TENANT-A', roleProbe, versionProbe } = {}) {
  const db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true }); const { Pool } = db.adapters.createPg();
  const secretProvider = { getSecret: async () => 'test-password-only' };
  const base = { environment: 'test', host: 'localhost', database: 'atlas_readiness_test', passwordSecretRef: 'test', tls: { required: false } };
  const application = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, user: 'atlas_app', role: 'APPLICATION' }, { secretProvider }), { PoolCtor: Pool });
  const migration = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, user: 'atlas_migration', role: 'MIGRATION' }, { secretProvider }), { PoolCtor: Pool });
  const migrations = new PostgresMigrationRunner({ runtime: migration, lock: { acquire: async () => async () => {} } }); if (migrate) await migrations.apply();
  const validator = new PostgresInstallationReadinessValidator({ applicationRuntime: application, migrationRuntime: migration, migrations, expectedTenantId, versionProbe: versionProbe || (async () => 17), roleProbe: roleProbe || (async (runtime, metadata) => runtime.config.role === 'APPLICATION' ? { isSuperuser: false, canCreateSchema: false, ownsSchema: false, canWriteMigrationMetadata: false } : { isSuperuser: false, canCreateSchema: true, ownsSchema: false, canWriteMigrationMetadata: metadata }) });
  return { application, migration, migrations, validator };
}
async function close(f) { await f.application.close(); await f.migration.close(); }
async function seedInstallation(f, tenantId = 'TENANT-A') { await f.application.query('INSERT INTO atlas_installation (installation_id, tenant_id) VALUES ($1,$2)', ['INSTALL-TEST', tenantId]); }

test('readiness is inspect-only: empty database returns initialization required without creating Atlas tables, sessions, or business data', async () => {
  const f = await fixture({ migrate: false }); const first = await f.validator.inspect(); const second = await f.validator.inspect();
  assert.equal(first.state, 'INITIALIZATION_REQUIRED'); assert.equal(first.remediationCode, 'ATLAS_SCHEMA_UNINITIALIZED'); assert.deepEqual(second, first);
  const tables = (await f.application.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'atlas_%'", [], 'TEST_EMPTY_INSPECTION')).rows;
  assert.equal(tables.length, 0); await close(f);
});

test('valid initialized C/E schema, matching tenant, distinct roles and rollback smoke return safe READY result', async () => {
  const f = await fixture(); await seedInstallation(f); const readiness = await f.validator.inspect();
  assert.equal(readiness.state, 'READY'); assert.equal(readiness.remediationCode, 'READY');
  for (const check of ['connectivity', 'version', 'tls', 'installation', 'applicationRole', 'migrationRole', 'migration', 'foundationSchema', 'domainSchema', 'sessionSchema', 'transactionSmoke', 'tenantScope']) assert.equal(readiness.checks[check].state, 'PASS', check);
  const serialized = JSON.stringify(readiness); assert.doesNotMatch(serialized, /password|localhost|atlas_readiness_test|SELECT|BEGIN/i); await close(f);
});

test('wrong trusted tenant, malformed tenant input, older schema, checksum drift and unsupported versions fail closed with stable classifications', async () => {
  const mismatch = await fixture({ expectedTenantId: 'TENANT-B' }); await seedInstallation(mismatch, 'TENANT-A'); assert.deepEqual((await mismatch.validator.inspect()).state, 'SECURITY_ERROR'); await close(mismatch);
  const malformed = await fixture({ expectedTenantId: 'PLATFORM_ADMIN' }); assert.equal((await malformed.validator.inspect()).state, 'CONFIGURATION_ERROR'); await close(malformed);
  const old = await fixture({ migrate: false }); const oldRunner = new PostgresMigrationRunner({ runtime: old.migration, migrations: [FOUNDATION_MIGRATIONS[0]], lock: { acquire: async () => async () => {} } }); await oldRunner.apply(); await old.application.query('INSERT INTO atlas_installation (installation_id, tenant_id) VALUES ($1,$2)', ['INSTALL-OLD', 'TENANT-A']); assert.equal((await old.validator.inspect()).state, 'MIGRATION_REQUIRED'); await close(old);
  const drift = await fixture(); await seedInstallation(drift); drift.validator.migrations = new PostgresMigrationRunner({ runtime: drift.migration, migrations: [{ ...FOUNDATION_MIGRATIONS[0], checksum: 'different' }, ...FOUNDATION_MIGRATIONS.slice(1)], lock: { acquire: async () => async () => {} } }); const driftResult = await drift.validator.inspect(); assert.equal(driftResult.state, 'CONFIGURATION_ERROR'); assert.equal(driftResult.remediationCode, 'MIGRATION_CHECKSUM_DRIFT'); await close(drift);
  const version = await fixture({ versionProbe: async () => 16 }); await seedInstallation(version); assert.equal((await version.validator.inspect()).state, 'INCOMPATIBLE'); await close(version);
  const nextMajor = await fixture({ versionProbe: async () => 18 }); await seedInstallation(nextMajor); const nextMajorResult = await nextMajor.validator.inspect(); assert.equal(nextMajorResult.state, 'INCOMPATIBLE'); assert.equal(nextMajorResult.remediationCode, 'POSTGRESQL_18_CERTIFICATION_REQUIRED'); await close(nextMajor);
});

test('production TLS, role separation and least-privilege requirements fail closed before installation inspection', async () => {
  const f = await fixture();
  const insecure = new PostgresInstallationReadinessValidator({ applicationRuntime: { ...f.application, config: { ...f.application.config, production: true, tls: { required: false, rejectUnauthorized: false } } }, migrationRuntime: f.migration, migrations: f.migrations, expectedTenantId: 'TENANT-A', versionProbe: async () => 17, roleProbe: async () => ({}) });
  assert.equal((await insecure.inspect()).state, 'SECURITY_ERROR');
  const overprivileged = await fixture({ roleProbe: async (runtime, metadata) => runtime.config.role === 'APPLICATION' ? { isSuperuser: false, canCreateSchema: true, ownsSchema: false, canWriteMigrationMetadata: false } : { isSuperuser: false, canCreateSchema: true, ownsSchema: false, canWriteMigrationMetadata: metadata } });
  assert.equal((await overprivileged.validator.inspect()).state, 'SECURITY_ERROR'); await close(overprivileged); await close(f);
});

test('collapsed credentials and non-PostgreSQL selection are rejected before any database inspection', async () => {
  const f = await fixture(); const collapsed = new PostgresInstallationReadinessValidator({ applicationRuntime: f.application, migrationRuntime: f.application, migrations: f.migrations, expectedTenantId: 'TENANT-A', versionProbe: async () => 17, roleProbe: async () => ({}) });
  assert.equal((await collapsed.inspect()).remediationCode, 'DATABASE_ROLES_NOT_DISTINCT');
  const wrongProvider = new PostgresInstallationReadinessValidator({ applicationRuntime: f.application, migrationRuntime: f.migration, migrations: f.migrations, expectedTenantId: 'TENANT-A', provider: 'SHEETS' });
  assert.equal((await wrongProvider.inspect()).state, 'CONFIGURATION_ERROR'); await close(f);
});

test('rollback smoke always issues a read-only begin and rollback without a commit', async () => {
  const calls = []; const client = { query: async (query) => { calls.push(typeof query === 'string' ? query : query.text); return { rows: [{ transaction_smoke: 1 }], rowCount: 1 }; }, release: () => calls.push('RELEASE') };
  const runtime = new PostgresRuntime({ role: 'APPLICATION', host: 'h', port: 5432, database: 'd', user: 'u', password: 'p', tls: { required: false }, pool: { max: 1, idleTimeoutMs: 1000, connectionTimeoutMs: 1000, statementTimeoutMs: 1000 } }, { pool: { connect: async () => client, end: async () => {} } });
  assert.deepEqual(await runtime.rollbackSmoke(), { rolledBack: true }); assert.deepEqual(calls, ['BEGIN READ ONLY', 'SELECT 1 AS transaction_smoke', 'ROLLBACK', 'RELEASE']);
});
