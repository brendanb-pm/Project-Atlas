import { OidcProvider } from '../src/providers.js';
import { createAuthenticatedTenantRuntime } from '../src/tenant-runtime.js';
import { ObjectStorageRouter, S3ObjectStorageAdapter } from '../src/contextual-attachments.js';
import { ServerAiProviderAdapter } from '../src/ai-processing.js';
import { configuration, secret, tenants } from './config.mjs';
import { createGateways } from './gateways.mjs';

try {
  const { settings, database, origin } = await configuration('APPLICATION');
  const provider = { ...settings.oidc, enabled: true, clientSecret: await secret('oidc-client-secret'),
    redirectUri: origin + '/auth/callback', scopes: ['openid'], allowPersonalAccounts: false };
  if (!settings.storageBucket?.startsWith('atlas-mos140c-acceptance-')) {
    throw new Error('Dedicated provider configuration required');
  }
  const { storageGateway, aiGateway } = await createGateways(settings);
  const storage = new ObjectStorageRouter({ provider: 'S3', adapters: {
    S3: new S3ObjectStorageAdapter({ gateway: storageGateway, bucket: settings.storageBucket })
  } });
  const aiProvider = new ServerAiProviderAdapter({ ...settings.ai, gateway: aiGateway });
  const runtime = await createAuthenticatedTenantRuntime({
    edgeConfig: { environment: 'production', origin, allowedRoutes: ['tooling'],
      sessionStoreKind: 'postgresql', providers: { [provider.id]: provider } },
    oidcProviders: { [provider.id]: new OidcProvider(provider) },
    database, secretProvider: { getSecret: secret }, storage, aiProvider,
    entitlement: async ({ tenantId }) => tenants.includes(tenantId),
    log: (entry) => console.log(JSON.stringify(entry))
  });
  try {
    const { rows: [identity] } = await runtime.foundation.runtime.query(`SELECT
      shobj_description(oid,'pg_database') AS marker, current_setting('server_version_num')::int AS version
      FROM pg_database WHERE datname=current_database()`);
    if (identity.marker !== 'MOS-140C SYNTHETIC ACCEPTANCE ONLY' ||
        Math.floor(identity.version / 10000) !== 17) throw new Error('Acceptance database identity mismatch');
  } catch (error) {
    await runtime.close();
    throw error;
  }
  const server = runtime.createServer();
  server.listen(8080, '0.0.0.0', () => console.log('MOS-140C acceptance runtime listening'));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => { void runtime.close(); }));
  }
} catch {
  console.error('Acceptance startup failed. Verify mounted configuration, adapters and database readiness.');
  process.exitCode = 1;
}
