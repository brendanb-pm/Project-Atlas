import { createPostgresRuntimeConfig, PostgresRuntime } from './postgres-runtime.js';
import { PostgresSessionStore } from './postgres-session-store.js';
import { PostgresPersistenceProvider } from './postgres-provider.js';
import { PostgresMigrationRunner, RuntimeReadiness } from './migrations.js';

/** Server/install-controlled PostgreSQL assembly. It never chooses Sheets or a browser-selected provider. */
export async function createPostgresFoundation({ database, secretProvider, cursorSecret, PoolCtor, log, migrationLock } = {}) {
  if (!database || database.provider !== 'POSTGRESQL' || !cursorSecret) throw new Error('PostgreSQL provider selection is unavailable.');
  const applicationConfig = await createPostgresRuntimeConfig({ ...database, role: 'APPLICATION' }, { secretProvider });
  const migrationConfig = await createPostgresRuntimeConfig({ ...database, role: 'MIGRATION' }, { secretProvider });
  const runtime = new PostgresRuntime(applicationConfig, { PoolCtor, log });
  const migrationRuntime = new PostgresRuntime(migrationConfig, { PoolCtor, log });
  const sessions = new PostgresSessionStore({ runtime, touchIntervalMs: applicationConfig.pool.touchIntervalMs });
  const provider = new PostgresPersistenceProvider({ runtime, cursorSecret });
  const migrations = new PostgresMigrationRunner({ runtime: migrationRuntime, lock: migrationLock });
  const readiness = new RuntimeReadiness({ runtime, migrations, sessionStore: sessions });
  return Object.freeze({ runtime, migrationRuntime, sessions, provider, migrations, readiness, async close() { await Promise.all([runtime.close(), migrationRuntime.close()]); } });
}
