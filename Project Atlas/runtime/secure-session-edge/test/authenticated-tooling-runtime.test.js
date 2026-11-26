import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createHttpServer, createTenantEdge } from '../src/edge.js';
import { PostgresAtlasAuthority } from '../src/authority.js';
import { TestOidcProvider } from '../src/providers.js';
import { PostgresAuthAttemptStore } from '../src/store.js';
import { PostgresSessionStore } from '../src/postgres-session-store.js';
import { createPostgresRuntimeConfig, PostgresRuntime } from '../src/postgres-runtime.js';
import { FOUNDATION_MIGRATIONS, PostgresMigrationRunner } from '../src/migrations.js';
import { PostgresToolingRepository, ToolingTraceabilityService } from '../src/tooling-traceability.js';
import { ToolingProtectedApi } from '../src/tooling-api.js';
import { ContextualAttachmentService, InMemoryObjectStorageAdapter, ObjectStorageRouter, PostgresContextualAttachmentRepository } from '../src/contextual-attachments.js';
import { createAuthenticatedTenantRuntime } from '../src/tenant-runtime.js';

const ORIGIN = 'https://atlas.test';
const TENANT = 'TENANT-RUNTIME';
const USER = 'USER-RUNTIME';
const TYPE = 'TOOL-TYPE-140c0000-0000-4000-8000-000000000001';
const TOOL = 'TOOL-140c0000-0000-4000-8000-000000000002';

function providerConfig() { return { id: 'GOOGLE', enabled: true, clientId: 'google-client', authorizationEndpoint: 'https://google.invalid/authorize', tokenEndpoint: 'https://google.invalid/token', jwksUri: 'https://google.invalid/jwks', redirectUri: `${ORIGIN}/auth/callback`, issuers: ['https://google.issuer.invalid'], scopes: ['openid'] }; }

async function fixture() {
  const db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true }); const { Pool } = db.adapters.createPg();
  const secretProvider = { getSecret: async () => 'test-only-password' }, base = { environment: 'test', host: 'localhost', database: 'atlas_runtime', user: 'atlas', passwordSecretRef: 'test', tls: { required: false } };
  const app = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'APPLICATION' }, { secretProvider }), { PoolCtor: Pool });
  const migration = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'MIGRATION' }, { secretProvider }), { PoolCtor: Pool });
  await new PostgresMigrationRunner({ runtime: migration, lock: { acquire: async () => async () => {} } }).apply();
  await app.query('INSERT INTO atlas_installation(installation_id,tenant_id) VALUES($1,$2)', ['INSTALL-RUNTIME', TENANT]);
  await app.query('INSERT INTO atlas_users(user_id,display_name,status) VALUES($1,$2,$3)', [USER, 'Runtime Operator', 'ACTIVE']);
  await app.query('INSERT INTO atlas_tenant_memberships(tenant_id,membership_id,user_id,status,capabilities_json) VALUES($1,$2,$3,$4,$5::jsonb)', [TENANT, 'MEMBERSHIP-RUNTIME', USER, 'ACTIVE', JSON.stringify(['CORE_RECORD_READ', 'TOOLING_READ', 'TOOLING_WRITE', 'ATTACHMENT_READ', 'ATTACHMENT_WRITE'])]);
  await app.query('INSERT INTO atlas_external_identities(external_identity_id,user_id,provider,issuer,subject,status) VALUES($1,$2,$3,$4,$5,$6)', ['IDENTITY-RUNTIME', USER, 'GOOGLE', 'https://google.issuer.invalid', 'runtime-subject', 'ACTIVE']);
  const config = providerConfig(), provider = new TestOidcProvider(config), authority = new PostgresAtlasAuthority({ runtime: app, entitlement: async () => true });
  const tooling = new ToolingTraceabilityService({ repository: new PostgresToolingRepository({ runtime: app }) });
  const storage = new ObjectStorageRouter({ provider: 'TEST', adapters: { TEST: new InMemoryObjectStorageAdapter() } });
  const attachments = new ContextualAttachmentService({ repository: new PostgresContextualAttachmentRepository({ runtime: app }), storage });
  // These tests compress a manual workflow. Advance the clock between requests;
  // the dedicated limiter suite checks actual burst and sustained budgets.
  let simulatedTime = Date.now();
  const edge = createTenantEdge({ config: { environment: 'preproduction', origin: ORIGIN, sessionStoreKind: 'postgresql', allowedRoutes: ['tooling'], providers: { GOOGLE: config } }, providers: { GOOGLE: provider }, authority, sessionStore: new PostgresSessionStore({ runtime: app }), attemptStore: new PostgresAuthAttemptStore({ runtime: app }), protectedApi: new ToolingProtectedApi({ tooling, attachments }), clock: () => new Date(simulatedTime) });
  const server = createHttpServer(edge); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.prependListener('request', () => { simulatedTime += 1000; });
  const baseUrl = `http://127.0.0.1:${server.address().port}`, jar = new Map();
  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) }; if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; '); if (options.method && options.method !== 'GET') headers.origin ??= ORIGIN;
    const response = await fetch(baseUrl + path, { ...options, headers });
    for (const item of response.headers.getSetCookie?.() || []) { const [pair, ...attrs] = item.split(';'); const [key, value] = pair.split('='); if (attrs.some((a) => /^\s*Max-Age=0/i.test(a))) jar.delete(key); else jar.set(key, decodeURIComponent(value)); }
    return { response, body: await response.json() };
  }
  return { app, migration, provider, edge, jar, request, close: async () => { await new Promise((resolve) => server.close(resolve)); await app.close(); await migration.close(); } };
}

async function authenticate(f) {
  const start = await f.request('/auth/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'GOOGLE', intendedRoute: 'tooling', tenantId: 'TENANT-FORGED' }) });
  const url = new URL(start.body.authorizationUrl), state = url.searchParams.get('state'), nonce = url.searchParams.get('nonce');
  f.provider.claimsByCode.valid = { signatureVerified: true, iss: 'https://google.issuer.invalid', aud: 'google-client', sub: 'runtime-subject', nonce, exp: Math.floor(Date.now() / 1000) + 600 };
  return f.request(`/auth/callback?state=${encodeURIComponent(state)}&code=valid`);
}

test('authenticated tenant runtime binds OIDC, PostgreSQL session authority and tooling CRUD', async () => {
  const f = await fixture();
  assert.equal((await f.request(`/api/tooling/tools/${TOOL}`)).response.status, 401);
  const login = await authenticate(f); assert.equal(login.body.state, 'SIGNED_IN'); const csrf = login.body.csrfToken;
  const createType = await f.request('/api/tooling/tool-types', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atlas-csrf': csrf }, body: JSON.stringify({ toolTypeId: TYPE, description: 'Runtime end mill', toolClass: 'END_MILL', unitSystem: 'INCH', nominalDiameter: 0.5, tenantId: 'TENANT-FORGED' }) });
  assert.equal(createType.response.status, 201);
  const createTool = await f.request('/api/tooling/tools', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atlas-csrf': csrf, 'x-atlas-user': 'USER-FORGED', 'x-atlas-capabilities': 'PLATFORM_ADMIN' }, body: JSON.stringify({ toolInstanceId: TOOL, toolTypeId: TYPE, condition: 'NEW', storageLocation: 'CRIB-A', tenantId: 'TENANT-FORGED' }) });
  assert.equal(createTool.response.status, 201);
  const loaded = await f.request(`/api/tooling/tools/${TOOL}`); assert.equal(loaded.body.data.toolInstanceId, TOOL); assert.equal(loaded.body.data.condition, 'NEW'); assert.doesNotMatch(JSON.stringify(loaded.body), /TENANT-FORGED|USER-FORGED|PLATFORM_ADMIN/);
  const history = await f.request(`/api/tooling/tools/${TOOL}/history?limit=10`); assert.equal(history.response.status, 200); assert.equal(history.body.data[0].event_type, 'MANUAL_ENTRY'); assert.equal(history.body.data[0].details.condition, 'NEW');
  const evidence = await f.request(`/api/tooling/tools/${TOOL}/attachments`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-atlas-csrf': csrf, 'x-atlas-file-name': 'regrind.txt', 'x-atlas-attachment-category': 'INSPECTION', 'x-atlas-idempotency-key': 'runtime-regrind-proof' }, body: Buffer.from('verified micrometer reading') }); assert.equal(evidence.response.status, 201);
  const regrind = await f.request(`/api/tooling/tools/${TOOL}/regrinds`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-atlas-csrf': csrf }, body: JSON.stringify({ expectedVersion: 1, measuredDiameter: 0.4875, unitSystem: 'INCH', reason: 'Verified after regrind', evidenceAttachmentId: evidence.body.data.attachment_id }) }); assert.equal(regrind.response.status, 201);
  const after = await f.request(`/api/tooling/tools/${TOOL}`); assert.equal(after.body.data.nominalDiameter, 0.5); assert.equal(after.body.data.currentMeasurement.measuredDiameter, 0.4875); assert.equal(after.body.data.condition, 'REGROUND');
  const stale = await f.request(`/api/tooling/tools/${TOOL}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-atlas-csrf': csrf }, body: JSON.stringify({ expectedVersion: 1, condition: 'USED' }) }); assert.equal(stale.response.status, 409); assert.equal((await f.request(`/api/tooling/tools/${TOOL}`)).body.data.condition, 'REGROUND');
  const firstLocator = await f.request(`/api/tooling/tools/${TOOL}/identifiers/replace`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-atlas-csrf': csrf }, body: '{}' }); assert.equal(firstLocator.response.status, 200);
  const secondLocator = await f.request(`/api/tooling/tools/${TOOL}/identifiers/replace`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-atlas-csrf': csrf }, body: '{}' }); assert.equal((await f.request(`/api/tooling/locators/resolve?token=${encodeURIComponent(firstLocator.body.data.opaqueToken)}`)).response.status, 404); const resolved = await f.request(`/api/tooling/locators/resolve?token=${encodeURIComponent(secondLocator.body.data.opaqueToken)}`); assert.equal(resolved.body.data.toolInstanceId, TOOL);
  assert.equal((await f.app.query('SELECT count(*)::int count FROM atlas_tool_instances WHERE tenant_id=$1', [TENANT])).rows[0].count, 1);
  await f.close();
});

test('tooling API enforces CSRF, current capability and durable callback replay denial', async () => {
  const f = await fixture(), login = await authenticate(f); const csrf = login.body.csrfToken;
  assert.equal((await f.request('/api/tooling/tool-types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).response.status, 403);
  await f.app.query('UPDATE atlas_tenant_memberships SET capabilities_json=$2::jsonb WHERE tenant_id=$1', [TENANT, JSON.stringify(['CORE_RECORD_READ', 'TOOLING_READ'])]);
  const denied = await f.request('/api/tooling/tool-types', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atlas-csrf': csrf }, body: JSON.stringify({ toolTypeId: TYPE, description: 'Denied', toolClass: 'END_MILL', unitSystem: 'INCH' }) }); assert.equal(denied.response.status, 403);
  assert.equal((await f.request('/api/tooling/tools?query=%27%3B%20DROP%20TABLE&limit=1000')).response.status, 400);
  const started = await f.request('/auth/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'GOOGLE', intendedRoute: 'tooling' }) }); const state = new URL(started.body.authorizationUrl).searchParams.get('state'), nonce = new URL(started.body.authorizationUrl).searchParams.get('nonce'); f.provider.claimsByCode.replay = { signatureVerified: true, iss: 'https://google.issuer.invalid', aud: 'google-client', sub: 'runtime-subject', nonce, exp: Math.floor(Date.now() / 1000) + 600 };
  assert.equal((await f.request(`/auth/callback?state=${state}&code=replay`)).response.status, 200); assert.equal((await f.request(`/auth/callback?state=${state}&code=replay`)).response.status, 400);
  await f.close();
});

test('operator tooling, attachment and AI routes are fixed, bounded service delegations', async () => {
  const calls = [], service = (name) => new Proxy({}, { get: (_target, method) => async (...args) => { calls.push([name, String(method), ...args]); return { delegated: true }; } });
  const api = new ToolingProtectedApi({ tooling: service('tooling'), attachments: service('attachments'), ai: service('ai'), reviews: service('reviews') });
  const cases = [
    ['POST', '/api/tooling/tool-types', 'TOOLING_WRITE'], ['POST', '/api/tooling/tools', 'TOOLING_WRITE'], ['GET', `/api/tooling/tools/${TOOL}`, 'TOOLING_READ'], ['PATCH', `/api/tooling/tools/${TOOL}`, 'TOOLING_WRITE'],
    ['POST', `/api/tooling/tools/${TOOL}/regrinds`, 'TOOLING_WRITE'], ['POST', `/api/tooling/tools/${TOOL}/conditions`, 'TOOLING_WRITE'], ['GET', `/api/tooling/tools/${TOOL}/history?limit=25`, 'TOOLING_READ'],
    ['POST', '/api/tooling/identifiers', 'TOOLING_WRITE'], ['POST', `/api/tooling/tools/${TOOL}/identifiers/replace`, 'TOOLING_WRITE'], ['POST', '/api/tooling/identifiers/TOOL-ID-140c0000-0000-4000-8000-000000000003/revoke', 'TOOLING_WRITE'], ['GET', '/api/tooling/locators/resolve?token=1234567890123456', 'TOOLING_READ'],
    ['GET', `/api/tooling/tools/${TOOL}/attachments?limit=25`, 'ATTACHMENT_READ'], ['POST', `/api/tooling/tools/${TOOL}/attachments`, 'ATTACHMENT_WRITE'], ['PATCH', '/api/tooling/attachments/ATTACH-140c0000-0000-4000-8000-000000000004', 'ATTACHMENT_WRITE'],
    ['POST', '/api/tooling/ai/jobs', 'AI_PROCESS'], ['GET', '/api/tooling/ai/jobs/AI-JOB-140c0000-0000-4000-8000-000000000005', 'AI_PROCESS_READ'], ['POST', '/api/tooling/ai/jobs/AI-JOB-140c0000-0000-4000-8000-000000000005/reviews', 'AI_PROCESS_READ'],
    ['GET', '/api/tooling/ai/reviews/AI-REVIEW-140c0000-0000-4000-8000-000000000006', 'AI_PROCESS_READ'], ['POST', '/api/tooling/ai/reviews/AI-REVIEW-140c0000-0000-4000-8000-000000000006/commit', 'TOOLING_WRITE']
  ];
  for (const [method, value, capability] of cases) { const route = api.match(method, new URL(value, ORIGIN)); assert.ok(route, value); assert.equal(route.capability, capability); assert.equal(typeof route.execute, 'function'); }
  assert.equal(api.match('GET', new URL('/api/tooling/tools?query=x&limit=0', ORIGIN)).capability, 'TOOLING_READ');
  assert.equal(api.match('GET', new URL('/api/tooling/unknown', ORIGIN)), null);
  assert.equal(calls.length, 0, 'route discovery cannot invoke domain services');
});

test('production composition loads only APPLICATION credentials and fails closed around injected providers', async () => {
  const db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true }), { Pool } = db.adapters.createPg(), seen = [];
  const testSecrets = { getSecret: async () => 'migration-test-password' }, base = { environment: 'test', host: 'localhost', database: 'atlas_production_shape', user: 'migration', passwordSecretRef: 'migration', tls: { required: false } };
  const migration = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'MIGRATION' }, { secretProvider: testSecrets }), { PoolCtor: Pool }); await new PostgresMigrationRunner({ runtime: migration, lock: { acquire: async () => async () => {} } }).apply();
  const secretProvider = { getSecret: async (reference) => { seen.push(reference); return 'application-test-password'; } };
  const storage = new ObjectStorageRouter({ provider: 'S3', adapters: { S3: { put: async () => {}, get: async () => ({ body: Buffer.alloc(0) }), remove: async () => {} } } });
  const runtime = await createAuthenticatedTenantRuntime({ edgeConfig: { environment: 'production', origin: 'https://tenant.atlas.invalid', sessionStoreKind: 'postgresql', providers: {} }, oidcProviders: {}, database: { environment: 'production', provider: 'POSTGRESQL', host: 'localhost', database: 'atlas_production_shape', tenantId: TENANT, tls: { required: true, rejectUnauthorized: true }, application: { user: 'application', passwordSecretRef: 'application-secret' } }, secretProvider, storage, aiProvider: { providerId: 'TENANT_AI', modelId: 'approved', process: async () => ({ proposals: [] }) }, PoolCtor: Pool, entitlement: async () => true });
  assert.deepEqual(seen, ['application-secret']);
  assert.equal(runtime.foundation.runtime.config.role, 'APPLICATION');
  assert.equal(runtime.edge.sessions.store.isDurablePostgresStore, true);
  const server = runtime.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/ready')).status, 200);
    for (const path of ['/api/tooling/tools', '/api/work-orders', '/work-orders']) {
      assert.equal((await fetch(base + path)).status, 401, path);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await runtime.close();
    await migration.close();
  }
});
