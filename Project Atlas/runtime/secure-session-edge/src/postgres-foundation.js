import { createPostgresRuntimeConfig, PostgresRuntime } from './postgres-runtime.js';
import { PostgresSessionStore } from './postgres-session-store.js';
import { PostgresPersistenceProvider } from './postgres-provider.js';
import { PostgresMigrationRunner, RuntimeReadiness } from './migrations.js';
import { PostgresInstallationReadinessValidator } from './postgres-readiness.js';

/** Server/install-controlled PostgreSQL assembly. It never chooses Sheets or a browser-selected provider. */
export async function createPostgresFoundation({ database, secretProvider, cursorSecret, PoolCtor, log, migrationLock } = {}) {
  if (!database || database.provider !== 'POSTGRESQL' || !cursorSecret) throw new Error('PostgreSQL provider selection is unavailable.');
  const applicationConfig = await createPostgresRuntimeConfig(roleDatabase(database, 'APPLICATION'), { secretProvider });
  const migrationConfig = await createPostgresRuntimeConfig(roleDatabase(database, 'MIGRATION'), { secretProvider });
  const runtime = new PostgresRuntime(applicationConfig, { PoolCtor, log });
  const migrationRuntime = new PostgresRuntime(migrationConfig, { PoolCtor, log });
  const sessions = new PostgresSessionStore({ runtime, touchIntervalMs: applicationConfig.pool.touchIntervalMs });
  const provider = new PostgresPersistenceProvider({ runtime, cursorSecret });
  const migrations = new PostgresMigrationRunner({ runtime: migrationRuntime, lock: migrationLock });
  const readiness = new RuntimeReadiness({ runtime, migrations, sessionStore: sessions });
  const installationReadiness = new PostgresInstallationReadinessValidator({ applicationRuntime: runtime, migrationRuntime, migrations, expectedTenantId: database.tenantId, provider: database.provider });
  return Object.freeze({ runtime, migrationRuntime, sessions, provider, migrations, readiness, installationReadiness, async close() { await Promise.all([runtime.close(), migrationRuntime.close()]); } });
}

function roleDatabase(database, role) {
  const key = role === 'APPLICATION' ? 'application' : 'migration'; const detail = database[key] || {};
  return { ...database, ...detail, user: detail.user || database[`${key}User`] || database.user, passwordSecretRef: detail.passwordSecretRef || database[`${key}PasswordSecretRef`] || database.passwordSecretRef, role };
}
