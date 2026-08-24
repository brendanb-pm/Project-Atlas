import assert from 'node:assert/strict';
import test from 'node:test';
import { createEdgeConfig, createHttpServer, createPreproductionEdge } from '../src/edge.js';
import { AtlasAuthority } from '../src/authority.js';
import { PreproductionMemorySessionStore } from '../src/store.js';
import { TestOidcProvider } from '../src/providers.js';

const origin = 'https://atlas.test';
function providerConfig(id) { return { id, enabled: true, clientId: `${id.toLowerCase()}-client`, authorizationEndpoint: `https://${id.toLowerCase()}.invalid/authorize`, tokenEndpoint: `https://${id.toLowerCase()}.invalid/token`, jwksUri: `https://${id.toLowerCase()}.invalid/jwks`, redirectUri: `${origin}/auth/callback`, issuers: [`https://${id.toLowerCase()}.issuer.invalid`], scopes: ['openid'], allowPersonalAccounts: false }; }
function claim(id, code, overrides = {}) { return { signatureVerified: true, iss: `https://${id.toLowerCase()}.issuer.invalid`, aud: `${id.toLowerCase()}-client`, sub: `${id.toLowerCase()}-subject`, nonce: overrides.nonce || '__REPLACED__', exp: Math.floor(Date.now() / 1000) + 600, auth_time: Math.floor(Date.now() / 1000), ...overrides, code }; }
function fixture({ multiple = false, capabilities = ['CORE_RECORD_READ'], clock = () => new Date(), store, memberships: membershipOverride, users: userOverride } = {}) {
  const google = providerConfig('GOOGLE'), microsoft = providerConfig('MICROSOFT');
  const defaultMemberships = multiple ? [{ id: 'M1', userId: 'U1', tenantId: 'T1', status: 'ACTIVE', capabilities }, { id: 'M2', userId: 'U1', tenantId: 'T2', status: 'ACTIVE', capabilities }] : [{ id: 'M1', userId: 'U1', tenantId: 'T1', status: 'ACTIVE', capabilities }];
  const authority = new AtlasAuthority({ identities: [{ provider: 'GOOGLE', issuer: google.issuers[0], subject: 'google-subject', userId: 'U1' }, { provider: 'MICROSOFT', issuer: microsoft.issuers[0], subject: 'microsoft-subject', userId: 'U1' }], users: userOverride || [{ id: 'U1', status: 'ACTIVE' }], memberships: membershipOverride || defaultMemberships, entitlement: () => true });
  const providers = { GOOGLE: new TestOidcProvider(google), MICROSOFT: new TestOidcProvider(microsoft) };
  return { authority, providers, configs: { GOOGLE: google, MICROSOFT: microsoft }, edge: createPreproductionEdge({ config: { environment: 'preproduction', origin, sessionStoreKind: 'memory', preproductionTestHarness: true, allowedRoutes: ['home', 'customers'], providers: { GOOGLE: google, MICROSOFT: microsoft }, policy: { idleSeconds: 60, absoluteSeconds: 120, attemptSeconds: 60 } }, authority, providers, clock, sessionStore: store }) };
}
async function client(edge) {
  const server = createHttpServer(edge); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`, jar = new Map();
  return { jar, close: () => new Promise((resolve) => server.close(resolve)), async request(path, options = {}) {
    const headers = { ...(options.headers || {}) }; if (jar.size) headers.cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
    if (options.method && options.method !== 'GET') headers.origin ??= origin;
    const response = await fetch(`${base}${path}`, { ...options, headers, redirect: 'manual' });
    for (const item of response.headers.getSetCookie?.() || []) { const [pair, ...attrs] = item.split(';'); const [key, value] = pair.split('='); if (attrs.some((attribute) => /^\s*Max-Age=0/i.test(attribute))) jar.delete(key); else jar.set(key, decodeURIComponent(value)); }
    const body = await response.json(); return { response, body, headers: response.headers };
  } };
}
async function startAndCallback(api, fixtureValue, providerId = 'GOOGLE', code = 'ok') {
  const started = await api.request('/auth/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: providerId, intendedRoute: 'customers', tenantId: 'FORGED' }) }); assert.equal(started.response.status, 200);
  const state = new URL(started.body.authorizationUrl).searchParams.get('state'), nonce = new URL(started.body.authorizationUrl).searchParams.get('nonce'); fixtureValue.providers[providerId].claimsByCode[code] = claim(providerId, code, { nonce });
  return api.request(`/auth/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`);
}

test('Google and Microsoft deterministic OIDC callbacks create opaque sessions and trusted context', async () => {
  for (const providerId of ['GOOGLE', 'MICROSOFT']) {
    const value = fixture(), api = await client(value.edge); const completed = await startAndCallback(api, value, providerId, `${providerId}-ok`);
    assert.equal(completed.response.status, 200); assert.equal(completed.body.state, 'SIGNED_IN'); assert.ok(completed.body.csrfToken); assert.equal(api.jar.has('atlas_session'), true);
    const opaque = api.jar.get('atlas_session'); assert.equal(opaque.includes('U1'), false); assert.equal(opaque.includes('T1'), false);
    const context = await api.request('/preproduction/context', { headers: { 'x-atlas-tenant': 'FORGED', 'x-atlas-user': 'FORGED', 'x-atlas-capabilities': 'PLATFORM_ADMIN' } });
    assert.equal(context.response.status, 200); assert.deepEqual({ user: context.body.authenticatedUser, tenant: context.body.activeTenant }, { user: 'U1', tenant: 'T1' });
    await api.close();
  }
});

test('state, nonce, issuer, audience, expiry, replay, unknown identity and disabled access fail closed', async () => {
  const value = fixture(), api = await client(value.edge);
  assert.equal((await api.request('/auth/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'UNKNOWN' }) })).response.status, 503);
  const started = await api.request('/auth/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'GOOGLE' }) }); const state = new URL(started.body.authorizationUrl).searchParams.get('state'), nonce = new URL(started.body.authorizationUrl).searchParams.get('nonce');
  value.providers.GOOGLE.claimsByCode.bad = claim('GOOGLE', 'bad', { nonce: 'wrong' }); let result = await api.request(`/auth/callback?state=${state}&code=bad`); assert.equal(result.response.status, 400); assert.equal(api.jar.has('atlas_session'), false);
  result = await api.request(`/auth/callback?state=${state}&code=bad`); assert.equal(result.response.status, 400, 'state is single use');
  for (const [code, overrides] of [['issuer', { iss: 'https://evil.invalid' }], ['audience', { aud: 'wrong' }], ['expired', { exp: Math.floor(Date.now() / 1000) - 1 }], ['unknown', { sub: 'not-provisioned' }]]) {
    const next = await api.request('/auth/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'GOOGLE' }) }); const nextState = new URL(next.body.authorizationUrl).searchParams.get('state'), nextNonce = new URL(next.body.authorizationUrl).searchParams.get('nonce'); value.providers.GOOGLE.claimsByCode[code] = claim('GOOGLE', code, { nonce: nextNonce, ...overrides });
    result = await api.request(`/auth/callback?state=${nextState}&code=${code}`); assert.ok([400, 403].includes(result.response.status)); assert.equal(result.body.message.includes('T1'), false);
  }
  const noMembership = fixture({ memberships: [] }), noMembershipApi = await client(noMembership.edge); assert.equal((await startAndCallback(noMembershipApi, noMembership)).response.status, 403); await noMembershipApi.close();
  const disabled = fixture({ users: [{ id: 'U1', status: 'INACTIVE' }] }), disabledApi = await client(disabled.edge); assert.equal((await startAndCallback(disabledApi, disabled)).response.status, 403); await disabledApi.close();
  await api.close();
});

test('tenant selection is server-authoritative, CSRF-protected, and rotates the old session', async () => {
  const value = fixture({ multiple: true }), api = await client(value.edge); const complete = await startAndCallback(api, value); assert.equal(complete.body.state, 'TENANT_SELECTION_REQUIRED');
  const oldOpaque = api.jar.get('atlas_session'); let result = await api.request('/auth/tenant-select', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atlas-csrf': complete.body.csrfToken }, body: JSON.stringify({ tenantId: 'FOREIGN' }) }); assert.equal(result.response.status, 403);
  result = await api.request('/auth/tenant-select', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atlas-csrf': complete.body.csrfToken }, body: JSON.stringify({ tenantId: 'T2', userId: 'FORGED', capabilities: ['PLATFORM_ADMIN'] }) }); assert.equal(result.response.status, 200); assert.equal(result.body.activeTenant, 'T2'); assert.notEqual(api.jar.get('atlas_session'), oldOpaque);
  const oldClient = await client(value.edge); oldClient.jar.set('atlas_session', oldOpaque); assert.equal((await oldClient.request('/preproduction/context')).response.status, 401, 'rotated session cannot authorize'); await oldClient.close();
  assert.equal((await api.request('/preproduction/context')).body.activeTenant, 'T2'); await api.close();
});

test('CSRF, origin, logout, revoke-all, expiration, entitlement and capability boundaries fail safely', async () => {
  let now = new Date('2026-08-23T00:00:00Z'); const value = fixture({ clock: () => now }), api = await client(value.edge); const complete = await startAndCallback(api, value); const session = api.jar.get('atlas_session');
  let result = await api.request('/auth/logout', { method: 'POST', headers: { 'x-atlas-csrf': 'wrong' }, body: '{}' }); assert.equal(result.response.status, 403);
  result = await api.request('/auth/logout', { method: 'POST', headers: { origin: 'https://evil.invalid', 'x-atlas-csrf': complete.body.csrfToken }, body: '{}' }); assert.equal(result.response.status, 403);
  result = await api.request('/auth/logout', { method: 'POST', headers: { 'x-atlas-csrf': complete.body.csrfToken }, body: '{}' }); assert.equal(result.response.status, 200); assert.equal(api.jar.has('atlas_session'), false);
  const stale = await client(value.edge); stale.jar.set('atlas_session', session); assert.equal((await stale.request('/preproduction/context')).response.status, 401); await stale.close();
  const second = await startAndCallback(api, value, 'GOOGLE', 'second'); const record = await value.edge.sessions.resolve(api.jar.get('atlas_session')); await value.edge.sessions.store.revokeAllForUser('U1'); assert.equal((await api.request('/preproduction/context')).response.status, 401); assert.equal(record.userId, 'U1');
  const expiry = fixture({ clock: () => now }); const expiryApi = await client(expiry.edge); await startAndCallback(expiryApi, expiry); now = new Date('2026-08-23T00:01:01Z'); assert.equal((await expiryApi.request('/preproduction/context')).response.status, 401); await expiryApi.close(); await api.close();
  const denied = fixture({ capabilities: [] }), deniedApi = await client(denied.edge); await startAndCallback(deniedApi, denied); assert.equal((await deniedApi.request('/preproduction/context')).response.status, 403); await deniedApi.close();
});

test('production/test-store separation, unavailable stores, security headers, redacted audit and bounds are enforced', async () => {
  assert.throws(() => createEdgeConfig({ environment: 'production', origin, sessionStoreKind: 'memory' }));
  assert.throws(() => createPreproductionEdge({ config: { environment: 'production', origin, sessionStoreKind: 'postgresql-required', preproductionTestHarness: true }, authority: new AtlasAuthority(), providers: {} }));
  assert.throws(() => createPreproductionEdge({ config: { environment: 'production', origin, sessionStoreKind: 'postgresql-required' }, authority: new AtlasAuthority(), providers: {}, sessionStore: new PreproductionMemorySessionStore() }));
  const testProviderFixture = fixture(); assert.throws(() => createPreproductionEdge({ config: { environment: 'production', origin, sessionStoreKind: 'postgresql-required', providers: { GOOGLE: testProviderFixture.configs.GOOGLE } }, authority: testProviderFixture.authority, providers: { GOOGLE: testProviderFixture.providers.GOOGLE } }));
  const unavailableStore = new PreproductionMemorySessionStore({ enabled: false }), value = fixture({ store: unavailableStore }), api = await client(value.edge); const started = await api.request('/auth/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'GOOGLE' }) }); const state = new URL(started.body.authorizationUrl).searchParams.get('state'), nonce = new URL(started.body.authorizationUrl).searchParams.get('nonce'); value.providers.GOOGLE.claimsByCode.unavailable = claim('GOOGLE', 'unavailable', { nonce }); const unavailable = await api.request(`/auth/callback?state=${state}&code=unavailable`); assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.headers.get('content-security-policy').includes("frame-ancestors 'none'"), true); assert.equal(unavailable.headers.get('x-content-type-options'), 'nosniff'); assert.equal(unavailable.headers.get('access-control-allow-origin'), null);
  assert.equal(JSON.stringify(value.edge.audit.events).includes('unavailable'), false, 'audit excludes auth code'); await api.close();
});
