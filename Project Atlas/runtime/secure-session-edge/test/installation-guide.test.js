import assert from 'node:assert/strict';
import test from 'node:test';
import { TenantInstallationGuide, renderInstallationGuide } from '../src/installation-guide.js';

function readiness(state = 'READY', remediationCode = state, checks = {}) { return { state, remediationCode, checks: { connectivity: { state: 'PASS' }, tls: { state: 'PASS' }, applicationRole: { state: 'PASS' }, migrationRole: { state: 'PASS' }, ...checks } }; }
function deferred() { let resolve; return { promise: new Promise((done) => { resolve = done; }), resolve }; }

test('guided happy path uses D-A as the only readiness authority and requires safe acknowledgements before go-live eligibility', async () => {
  let calls = 0; const guide = new TenantInstallationGuide({ readinessValidator: { inspect: async () => { calls += 1; return readiness(); } }, bootstrap: { state: 'READY', tenantScoped: true, platformAuthority: false }, deploymentTarget: 'AWS_RDS_POSTGRESQL', clock: () => new Date('2026-01-01T00:00:00.000Z') });
  guide.acknowledge({ tenantResponsibilities: true, backupRestore: true }); const report = await guide.validate();
  assert.equal(calls, 1); assert.equal(report.state, 'READY'); assert.equal(report.goLiveEligible, true); assert.equal(report.deploymentTargetLabel, 'Amazon RDS for PostgreSQL'); assert.equal(report.readiness.state, 'READY');
});

test('D-A failure states map to actionable guide states without leaking configuration details and retry is safe', async () => {
  const states = [['DATABASE_UNAVAILABLE', 'UNAVAILABLE'], ['SECURITY_ERROR', 'NOT_READY'], ['MIGRATION_REQUIRED', 'UPGRADE_REQUIRED'], ['INCOMPATIBLE', 'NOT_READY'], ['INITIALIZATION_REQUIRED', 'ACTION_REQUIRED']];
  for (const [input, expected] of states) {
    const guide = new TenantInstallationGuide({ readinessValidator: { inspect: async () => readiness(input, 'safe-code') } }); const report = await guide.retry();
    assert.equal(report.state, expected); assert.doesNotMatch(JSON.stringify(report), /postgres:\/\/|password=|secret-value|db-host\.internal/i);
  }
});

test('late readiness responses cannot overwrite newer installer state', async () => {
  const first = deferred(), second = deferred(); let count = 0;
  const guide = new TenantInstallationGuide({ readinessValidator: { inspect: async () => (++count === 1 ? first.promise : second.promise) } });
  const attemptA = guide.validate(), attemptB = guide.validate(); second.resolve(readiness('DATABASE_UNAVAILABLE')); const b = await attemptB; first.resolve(readiness('READY')); const a = await attemptA;
  assert.equal(b.state, 'UNAVAILABLE'); assert.deepEqual(a, { ignored: true }); assert.equal(guide.snapshot().state, 'UNAVAILABLE');
});

test('first-admin readiness stays tenant scoped and cannot grant platform authority or create cloud/business resources', async () => {
  const guide = new TenantInstallationGuide({ readinessValidator: { inspect: async () => readiness() }, bootstrap: { state: 'READY', tenantScoped: true, platformAuthority: true }, deploymentTarget: 'AZURE_POSTGRESQL_FLEXIBLE_SERVER' });
  guide.acknowledge({ tenantResponsibilities: true, backupRestore: true }); const report = await guide.validate();
  assert.equal(report.firstAdmin, 'ACTION_REQUIRED'); assert.equal(report.goLiveEligible, false); assert.equal(report.deploymentTargetLabel, 'Azure Database for PostgreSQL Flexible Server');
});

test('go-live eligibility requires a supported target in addition to readiness, bootstrap and acknowledgements', async () => {
  const guide = new TenantInstallationGuide({ readinessValidator: { inspect: async () => readiness() }, bootstrap: { state: 'READY', tenantScoped: true, platformAuthority: false } });
  guide.acknowledge({ tenantResponsibilities: true, backupRestore: true }); assert.equal((await guide.validate()).goLiveEligible, false);
  guide.selectTarget('AWS_RDS_POSTGRESQL'); assert.equal((await guide.retry()).goLiveEligible, true);
});

test('rendered guide exposes a stable accessible progress state, busy state, retry control and vendor/tenant boundary', () => {
  const html = renderInstallationGuide({ state: 'VALIDATING', message: 'Checking <trusted> setup.', steps: [{ label: 'TLS', status: 'ACTION_REQUIRED' }] });
  assert.match(html, /<main aria-busy="true">/); assert.match(html, /aria-live="polite"/); assert.match(html, /role="status"/); assert.match(html, /disabled aria-disabled="true"/); assert.match(html, /min-height:44px/); assert.match(html, /Your organization operates hosting/); assert.doesNotMatch(html, /password|connection string/i);
});
