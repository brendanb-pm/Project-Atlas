import { readFile } from 'node:fs/promises';

export const tenants = Object.freeze(['ACCEPTANCE-A', 'ACCEPTANCE-B']);
export const databaseName = 'atlas_mos140c_acceptance';
export const roleNames = Object.freeze({ APPLICATION: 'atlas_acceptance_app', MIGRATION: 'atlas_acceptance_migrate' });

export async function secret(name) {
  if (!/^[a-z][a-z0-9-]+$/.test(name)) throw new Error('Invalid secret reference');
  const value = (await readFile('/config/' + name, 'utf8')).trim();
  if (!value) throw new Error('Empty configuration file');
  return value;
}

export async function configuration(role) {
  const settings = JSON.parse(await secret('settings-json'));
  const origin = new URL(settings.origin);
  if (origin.protocol !== 'https:' || origin.origin !== settings.origin || !origin.hostname.includes('.') ||
      settings.database?.name !== databaseName || !settings.database.host ||
      !['GOOGLE', 'MICROSOFT'].includes(settings.oidc?.id)) throw new Error('Invalid acceptance configuration');
  const database = {
    provider: 'POSTGRESQL',
    environment: 'production',
    host: settings.database.host,
    port: settings.database.port,
    database: databaseName,
    user: roleNames[role],
    passwordSecretRef: 'database-password',
    tls: { required: true, rejectUnauthorized: true, ca: await secret('database-ca') }
  };
  return { settings, database, origin: origin.origin };
}
