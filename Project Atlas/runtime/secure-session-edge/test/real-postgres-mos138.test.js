import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import pg from 'pg';
import { createPostgresRuntimeConfig, PostgresRuntime } from '../src/postgres-runtime.js';
import { FOUNDATION_MIGRATIONS, PostgresMigrationRunner } from '../src/migrations.js';

const ENABLED = process.env.ATLAS_MOS138_REAL_POSTGRES === '1';
const DATABASE = 'atlas_preprod_vitality_mos133h';
const MIGRATION_USER = 'atlas_mos133h_migration';
const APPLICATION_USER = 'atlas_mos133h_application';

if (!ENABLED) {
  test('MOS-138 real PostgreSQL validation requires explicit disposable-environment opt-in', { skip: true }, () => {});
} else {
  for (const name of ['MOS133H_MIGRATION_PASSWORD','MOS133H_APPLICATION_PASSWORD']) if (!process.env[name]) throw new Error(`Missing protected ${name} handoff.`);
  let migration;
  let application;
  let runner;
  const secretProvider = { getSecret: async (reference) => reference === 'mos138-migration' ? process.env.MOS133H_MIGRATION_PASSWORD : process.env.MOS133H_APPLICATION_PASSWORD };
  const base = { environment: 'development', host: 'localhost', port: 5432, database: DATABASE, tls: { required: false }, pool: { max: 2, connectionTimeoutMs: 5000, statementTimeoutMs: 10000, touchIntervalMs: 1000 } };

  before(async () => {
    migration = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, user: MIGRATION_USER, passwordSecretRef: 'mos138-migration', role: 'MIGRATION' }, { secretProvider }));
    application = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, user: APPLICATION_USER, passwordSecretRef: 'mos138-application', role: 'APPLICATION' }, { secretProvider }));
    runner = new PostgresMigrationRunner({ runtime: migration, migrations: FOUNDATION_MIGRATIONS });
  });
  after(async () => { await application?.close(); await migration?.close(); });

  test('target remains the established local PostgreSQL 17 disposable rehearsal database and least-privilege roles', async () => {
    const identity = (await migration.query("SELECT current_database() AS database,current_user AS role,current_setting('server_version_num')::int AS version", [], 'MOS138_REAL_IDENTITY')).rows[0];
    assert.equal(identity.database, DATABASE);
    assert.equal(identity.role, MIGRATION_USER);
    assert.ok(identity.version >= 170000 && identity.version < 180000);
    const privileges = (await migration.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user', [], 'MOS138_REAL_ROLE')).rows[0];
    assert.deepEqual(privileges, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  });

  test('ordered MOS-138 migration applies once and reaches CURRENT', async () => {
    await runner.apply();
    assert.deepEqual(await runner.status(), { state: 'CURRENT', ready: true });
    const applied = (await migration.query("SELECT migration_id FROM atlas_schema_migrations WHERE migration_id='0007_physical_tooling_traceability'", [], 'MOS138_REAL_MIGRATION')).rows;
    assert.deepEqual(applied.map((x) => x.migration_id), ['0007_physical_tooling_traceability']);
  });

  test('real PostgreSQL exposes the required tooling tables, indexes and application read boundary', async () => {
    const tables = new Set((await application.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])", [['atlas_tool_types','atlas_tool_instances','atlas_tool_measurements','atlas_tool_condition_events','atlas_holders','atlas_tool_assemblies','atlas_tool_machine_assignments','atlas_operation_tool_requirements','atlas_operation_tool_executions','atlas_tool_identifiers']], 'MOS138_REAL_TABLES')).rows.map((x) => x.table_name));
    for (const name of ['atlas_tool_types','atlas_tool_instances','atlas_tool_measurements','atlas_tool_condition_events','atlas_holders','atlas_tool_assemblies','atlas_tool_machine_assignments','atlas_operation_tool_requirements','atlas_operation_tool_executions','atlas_tool_identifiers']) assert.ok(tables.has(name), name);
    const indexes = new Set((await migration.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'", [], 'MOS138_REAL_INDEXES')).rows.map((x) => x.indexname));
    for (const name of ['atlas_tool_instances_lookup_idx','atlas_tool_assemblies_active_holder_idx','atlas_tool_assemblies_active_tool_idx','atlas_tool_assignments_machine_idx','atlas_tool_executions_operation_idx','atlas_tool_identifiers_resource_idx']) assert.ok(indexes.has(name), name);
  });

  test('real PostgreSQL tenant constraint rejects cross-tenant tooling stitching without persistent fixture data', async () => {
    const client = new pg.Client({ host: 'localhost', port: 5432, database: DATABASE, user: MIGRATION_USER, password: process.env.MOS133H_MIGRATION_PASSWORD, ssl: false });
    await client.connect();
    try {
      await client.query('BEGIN');
      const tenantA = (await client.query('SELECT tenant_id FROM atlas_installation ORDER BY tenant_id LIMIT 1')).rows[0]?.tenant_id;
      assert.ok(tenantA);
      await client.query("INSERT INTO atlas_users(user_id,display_name) VALUES('USER-MOS138-REAL','MOS-138') ON CONFLICT(user_id) DO NOTHING");
      await client.query("INSERT INTO atlas_tool_types(tenant_id,tool_type_id,description,tool_class,nominal_diameter,unit_system,created_by_user_id) VALUES($1,'TOOL-TYPE-13800000-0000-4000-8000-000000000001','1/2 in end mill','END_MILL',0.5000,'INCH','USER-MOS138-REAL')", [tenantA]);
      await client.query("INSERT INTO atlas_tool_instances(tenant_id,tool_instance_id,tool_type_id,condition,created_by_user_id) VALUES($1,'TOOL-13800000-0000-4000-8000-000000000002','TOOL-TYPE-13800000-0000-4000-8000-000000000001','REGROUND','USER-MOS138-REAL')", [tenantA]);
      await assert.rejects(() => client.query("INSERT INTO atlas_tool_instances(tenant_id,tool_instance_id,tool_type_id,condition,created_by_user_id) VALUES('TENANT-CROSS-MOS138','TOOL-13800000-0000-4000-8000-000000000003','TOOL-TYPE-13800000-0000-4000-8000-000000000001','NEW','USER-MOS138-REAL')"), (error) => error.code === '23503');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
}
