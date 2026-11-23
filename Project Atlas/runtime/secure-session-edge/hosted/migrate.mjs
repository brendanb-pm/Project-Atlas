import { createPostgresRuntimeConfig, PostgresRuntime } from '../src/postgres-runtime.js';
import { PostgresMigrationRunner } from '../src/migrations.js';
import { configuration, secret, tenants, databaseName, roleNames } from './config.mjs';

const capabilities = [
  ['CORE_RECORD_READ', 'TOOLING_READ', 'TOOLING_WRITE', 'ATTACHMENT_READ', 'ATTACHMENT_WRITE', 'AI_PROCESS', 'AI_PROCESS_READ'],
  ['CORE_RECORD_READ', 'TOOLING_READ']
];

try {
  const { settings, database } = await configuration('MIGRATION');
  const subjects = JSON.parse(await secret('oidc-subjects-json'));
  if (!Array.isArray(subjects) || subjects.length !== 2 || new Set(subjects).size !== 2 ||
      subjects.some((subject) => typeof subject !== 'string' || !subject.trim()) ||
      settings.oidc.issuers?.length !== 1) throw new Error('Two distinct synthetic subjects are required');
  const runtime = new PostgresRuntime(await createPostgresRuntimeConfig({ ...database, role: 'MIGRATION' }, {
    secretProvider: { getSecret: secret }
  }));
  try {
    const { rows: [identity] } = await runtime.query(`SELECT current_database() AS database, current_user AS username,
      current_setting('server_version_num')::int AS version,
      shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`);
    if (identity.database !== databaseName || identity.username !== roleNames.MIGRATION ||
        identity.marker !== 'MOS-140C SYNTHETIC ACCEPTANCE ONLY' || Math.floor(identity.version / 10000) !== 17) {
      throw new Error('Acceptance database identity mismatch');
    }
    const runner = new PostgresMigrationRunner({ runtime });
    if (!(await runner.apply()).ready) throw new Error('Acceptance migration failed');
    await runtime.withTransaction('ACCEPTANCE_SEED', async (tx) => {
      for (const [index, tenant] of tenants.entries()) {
        const user = 'OPERATOR-' + tenant;
        await tx.query('INSERT INTO atlas_installation(installation_id,tenant_id) VALUES($1,$2) ON CONFLICT DO NOTHING', ['INSTALL-' + tenant, tenant]);
        await tx.query('INSERT INTO atlas_users(user_id,display_name) VALUES($1,$2) ON CONFLICT DO NOTHING', [user, user]);
        await tx.query(`INSERT INTO atlas_tenant_memberships(tenant_id,membership_id,user_id,capabilities_json)
          VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`, [tenant, 'MEMBER-' + tenant, user, JSON.stringify(capabilities[index])]);
        await tx.query(`INSERT INTO atlas_external_identities(external_identity_id,user_id,provider,issuer,subject)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, ['IDENTITY-' + tenant, user, settings.oidc.id, settings.oidc.issuers[0], subjects[index]]);
        const binding = await tx.query(`SELECT 1 FROM atlas_external_identities
          WHERE external_identity_id=$1 AND user_id=$2 AND provider=$3 AND issuer=$4 AND subject=$5 AND status='ACTIVE'`,
        ['IDENTITY-' + tenant, user, settings.oidc.id, settings.oidc.issuers[0], subjects[index]]);
        if (binding.rowCount !== 1) throw new Error('Synthetic identity binding does not match configured subject');
      }
    });
    console.log('Acceptance schema and two synthetic identities ready');
  } finally {
    await runtime.close();
  }
} catch {
  console.error('Acceptance migration failed. Check database marker, TLS, role, migration status and synthetic identities.');
  process.exitCode = 1;
}
