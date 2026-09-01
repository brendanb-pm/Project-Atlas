import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { EdgeError } from '../src/errors.js';
import { evaluateToolingPreflight, PostgresToolingRepository, ToolingTraceabilityService } from '../src/tooling-traceability.js';

const NOW = new Date('2026-08-31T18:00:00.000Z');
const IDS = Object.freeze({
  type: 'TOOL-TYPE-11111111-1111-4111-8111-111111111111',
  otherType: 'TOOL-TYPE-22222222-2222-4222-8222-222222222222',
  tool: 'TOOL-33333333-3333-4333-8333-333333333333',
  holder: 'HOLDER-44444444-4444-4444-8444-444444444444',
  assembly: 'TOOL-ASM-55555555-5555-4555-8555-555555555555',
  measurement: 'TOOL-MEAS-66666666-6666-4666-8666-666666666666',
  requirement: 'TOOL-REQ-77777777-7777-4777-8777-777777777777',
  execution: 'TOOL-EXEC-88888888-8888-4888-8888-888888888888',
  identifier: 'TOOL-ID-99999999-9999-4999-8999-999999999999'
});
const CONTEXT = Object.freeze({ authoritative: true, tenantId: 'TENANT-A', userId: 'USER-A', correlationId: 'CORR-MOS138', capabilities: ['TOOLING_READ', 'TOOLING_WRITE', 'TOOLING_OPERATE'] });

function requirement(overrides = {}) {
  return { toolRequirementId: IDS.requirement, jobOperationId: 'JOB-OP-A', toolTypeId: IDS.type, expectedDiameter: 0.5, unitSystem: 'INCH', radialStockToLeave: 0.004, verifiedActualGeometryRequired: true, policy: { diameterToleranceMinus: 0.001, diameterTolerancePlus: 0.001, maxMeasurementAgeHours: 168 }, ...overrides };
}
function setup(overrides = {}) {
  const base = {
    assembly: { toolAssemblyId: IDS.assembly, holderId: IDS.holder, toolInstanceId: IDS.tool, status: 'ACTIVE', removedAt: null, verificationStatus: 'VERIFIED', verifiedMeasurementId: IDS.measurement },
    toolInstance: { toolInstanceId: IDS.tool, toolTypeId: IDS.type, condition: 'NEW', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
    toolType: { toolTypeId: IDS.type, nominalDiameter: 0.5, unitSystem: 'INCH', status: 'ACTIVE' },
    measurement: { toolMeasurementId: IDS.measurement, measuredDiameter: 0.5, measuredLength: 1.25, measuredAt: '2026-08-31T17:00:00.000Z', verificationStatus: 'VERIFIED' },
    assignment: null
  };
  return { ...base, ...overrides };
}

test('nominal geometry remains separate while the 8767-00 regrind is surfaced and blocked by policy', () => {
  const actual = setup({ toolInstance: { ...setup().toolInstance, condition: 'REGROUND' }, measurement: { ...setup().measurement, measuredDiameter: 0.4975 } });
  const result = evaluateToolingPreflight(requirement(), actual, { now: NOW });
  assert.equal(result.nominalDiameter, 0.5);
  assert.equal(result.actualDiameter, 0.4975);
  assert.equal(result.effectiveDiameter, 0.4975);
  assert.equal(result.diameterDelta, -0.0025);
  assert.equal(result.radialStockToLeave, 0.004);
  assert.equal(result.condition, 'REGROUND');
  assert.equal(result.state, 'BLOCKED');
  assert.ok(result.reasons.some(({ code }) => code === 'ACTUAL_DIAMETER_OUTSIDE_POLICY'));
});

test('preflight states are deterministic for normal, unverified, wrong, unsafe, missing and stale tools', () => {
  assert.equal(evaluateToolingPreflight(requirement(), setup(), { now: NOW }).state, 'READY');
  const unverified = setup({ toolInstance: { ...setup().toolInstance, condition: 'REGROUND' }, measurement: null, assembly: { ...setup().assembly, verificationStatus: 'UNVERIFIED', verifiedMeasurementId: null } });
  assert.equal(evaluateToolingPreflight(requirement(), unverified, { now: NOW }).state, 'UNVERIFIED');
  assert.equal(evaluateToolingPreflight(requirement(), setup({ toolInstance: { ...setup().toolInstance, toolTypeId: IDS.otherType } }), { now: NOW }).state, 'BLOCKED');
  for (const condition of ['DAMAGED', 'QUARANTINED', 'RETIRED']) assert.equal(evaluateToolingPreflight(requirement(), setup({ toolInstance: { ...setup().toolInstance, condition } }), { now: NOW }).state, 'BLOCKED');
  assert.equal(evaluateToolingPreflight(requirement(), null, { now: NOW }).state, 'NOT_ASSIGNED');
  const stale = setup({ measurement: { ...setup().measurement, measuredAt: '2026-08-01T00:00:00.000Z' } });
  assert.equal(evaluateToolingPreflight(requirement(), stale, { now: NOW }).state, 'STALE');
});

test('bounded policy supports warning behavior without one global tolerance', () => {
  const r = requirement({ policy: { diameterToleranceMinus: 0.001, diameterTolerancePlus: 0.001, diameterMismatchState: 'WARNING' } });
  const result = evaluateToolingPreflight(r, setup({ measurement: { ...setup().measurement, measuredDiameter: 0.4975 } }), { now: NOW });
  assert.equal(result.state, 'WARNING');
  assert.equal(result.ready, true);
});

test('service fails closed on capabilities, tenant authority and malformed canonical IDs', async () => {
  const service = new ToolingTraceabilityService({ repository: {}, clock: () => NOW });
  await assert.rejects(() => service.search({ ...CONTEXT, capabilities: [] }, 'mill'), (e) => e instanceof EdgeError && e.code === 'FORBIDDEN');
  await assert.rejects(() => service.search({ ...CONTEXT, authoritative: false }, 'mill'), (e) => e instanceof EdgeError && e.code === 'FORBIDDEN');
  await assert.rejects(() => service.history(CONTEXT, 'TOOL-not-canonical'), (e) => e instanceof EdgeError && e.code === 'INVALID_REQUEST');
  await assert.rejects(() => service.saveRequirement(CONTEXT, { toolRequirementId: IDS.requirement, jobOperationId: 'JOB-OP-A', toolTypeId: IDS.type, unitSystem: 'INCH', policy: { arbitraryRule: 1 } }), (e) => e.code === 'INVALID_REQUEST');
  await assert.rejects(() => service.recordMeasurement(CONTEXT, { toolMeasurementId: IDS.measurement, toolInstanceId: IDS.tool, unitSystem: 'INCH' }), (e) => e.code === 'INVALID_REQUEST');
});

test('QR issuance hashes the opaque token and authorized scans never query by plaintext', async () => {
  const calls = [];
  const repository = {
    createIdentifier: async (_s, input) => { calls.push(['create', input]); return { toolIdentifierId: input.toolIdentifierId }; },
    resolveIdentifier: async (_s, hash) => { calls.push(['resolve', hash]); return { resource_type: 'TOOL_INSTANCE', tool_instance_id: IDS.tool }; },
    getIdentifierProjection: async () => ({ resourceType: 'TOOL_INSTANCE', toolInstanceId: IDS.tool, state: 'STORED' })
  };
  const service = new ToolingTraceabilityService({ repository, clock: () => NOW });
  const token = 'opaque-mos138-token-value';
  await service.issueIdentifier(CONTEXT, { toolIdentifierId: IDS.identifier, resourceType: 'TOOL_INSTANCE', resourceId: IDS.tool, opaqueToken: token });
  await service.scan(CONTEXT, token);
  const expected = createHash('sha256').update(token).digest('hex');
  assert.equal(calls[0][1].tokenHash, expected);
  assert.equal(calls[1][1], expected);
  assert.ok(!JSON.stringify(calls).includes(token));
  await assert.rejects(() => service.scan({ ...CONTEXT, capabilities: [] }, token), (e) => e.code === 'FORBIDDEN');
});

test('execution captures immutable actual geometry, assembly, holder and condition snapshots', async () => {
  const captured = [];
  const current = setup({ toolInstance: { ...setup().toolInstance, condition: 'REGROUND' }, measurement: { ...setup().measurement, measuredDiameter: 0.4995 } });
  const repository = { getRequirement: async () => requirement(), getSetup: async () => current, recordExecution: async (_s, x) => { captured.push(structuredClone(x)); return x; } };
  const service = new ToolingTraceabilityService({ repository, clock: () => NOW });
  await service.recordExecution(CONTEXT, { toolExecutionId: IDS.execution, toolRequirementId: IDS.requirement, toolAssemblyId: IDS.assembly });
  current.measurement.measuredDiameter = 0.47;
  current.toolInstance.condition = 'RETIRED';
  assert.equal(captured[0].actualDiameterSnapshot, 0.4995);
  assert.equal(captured[0].nominalDiameterSnapshot, 0.5);
  assert.equal(captured[0].toolConditionSnapshot, 'REGROUND');
  assert.equal(captured[0].toolAssemblyId, IDS.assembly);
  assert.equal(captured[0].holderId, IDS.holder);
});

test('PostgreSQL adapter uses tenant-bounded fixed SQL, bounded limits and current-only holder resolution', async () => {
  const calls = [];
  const runtime = { query: async (sql, values, operation) => { calls.push({ sql, values, operation }); if (operation === 'HOLDER_ACTIVE_ASSEMBLY') return { rowCount: 0, rows: [] }; return { rowCount: 0, rows: [] }; }, withTransaction: async (_name, work) => work({ query: runtime.query }) };
  const repository = new PostgresToolingRepository({ runtime });
  await repository.search({ tenantId: 'TENANT-A' }, 'end mill', 25);
  const search = calls.at(-1);
  assert.match(search.sql, /tenant_id=\$1/);
  assert.match(search.sql, /LIMIT \$3/);
  assert.deepEqual(search.values, ['TENANT-A', '%end mill%', 25]);
  const projection = await repository.getIdentifierProjection({ tenantId: 'TENANT-A' }, { resource_type: 'HOLDER', holder_id: IDS.holder });
  assert.equal(projection.state, 'EMPTY');
  assert.match(calls.at(-1).sql, /status='ACTIVE'/);
  assert.match(calls.at(-1).sql, /LIMIT 2/);
  await repository.history({ tenantId: 'TENANT-A' }, IDS.tool, 25);
  assert.match(calls.at(-1).sql, /ASSEMBLY_INSTALLED/);
  assert.match(calls.at(-1).sql, /MACHINE_LOADED/);
  assert.match(calls.at(-1).sql, /LIMIT \$3/);
});
