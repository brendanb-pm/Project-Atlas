import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createPostgresRuntimeConfig, PostgresRuntime } from '../src/postgres-runtime.js';
import { FOUNDATION_MIGRATIONS, PostgresMigrationRunner } from '../src/migrations.js';
import { PostgresToolingRepository, ToolingTraceabilityService } from '../src/tooling-traceability.js';

const TYPE = 'TOOL-TYPE-13810000-0000-4000-8000-000000000001';
const TOOL = 'TOOL-13810000-0000-4000-8000-000000000002';
const OTHER_TOOL = 'TOOL-13810000-0000-4000-8000-000000000003';
const EVIDENCE = 'ATTACH-13810000-0000-4000-8000-000000000004';
const OTHER_EVIDENCE = 'ATTACH-13810000-0000-4000-8000-000000000005';
const CONTEXT = Object.freeze({ authoritative: true, tenantId: 'TENANT-A', userId: 'USER-A', correlationId: 'CORR-MOS138-R1', capabilities: ['TOOLING_READ', 'TOOLING_WRITE'] });

async function fixture() {
  const db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  const secretProvider = { getSecret: async () => 'test' };
  const base = { environment: 'test', host: 'localhost', database: 'atlas_tooling_r1', user: 'atlas', passwordSecretRef: 'test', tls: { required: false } };
  const app = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'APPLICATION' }, { secretProvider }), { PoolCtor: Pool });
  const migration = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'MIGRATION' }, { secretProvider }), { PoolCtor: Pool });
  await new PostgresMigrationRunner({ runtime: migration, migrations: FOUNDATION_MIGRATIONS, lock: { acquire: async () => async () => {} } }).apply();
  for (const tenant of ['TENANT-A', 'TENANT-B']) await app.query('INSERT INTO atlas_installation(installation_id,tenant_id) VALUES($1,$2)', [`INSTALL-${tenant}`, tenant]);
  await app.query("INSERT INTO atlas_users(user_id,display_name) VALUES('USER-A','Operator A'),('USER-B','Operator B')");
  await app.query("INSERT INTO atlas_tool_types(tenant_id,tool_type_id,description,tool_class,nominal_diameter,unit_system,created_by_user_id) VALUES('TENANT-A',$1,'1/2 inch carbide end mill','END_MILL',0.5000,'INCH','USER-A')", [TYPE]);
  await app.query("INSERT INTO atlas_tool_instances(tenant_id,tool_instance_id,tool_type_id,serial_lot_identifier,condition,storage_location,created_by_user_id) VALUES('TENANT-A',$1,$2,'LOT-8767','USED','TOOL CRIB A','USER-A'),('TENANT-A',$3,$2,'LOT-OTHER','USED','GRIND OUT','USER-A')", [TOOL, TYPE, OTHER_TOOL]);
  for (const [attachmentId, toolId] of [[EVIDENCE, TOOL], [OTHER_EVIDENCE, OTHER_TOOL]]) await app.query("INSERT INTO atlas_contextual_attachments(tenant_id,attachment_id,parent_type,parent_id,tool_instance_id,file_name,media_type,byte_size,category,storage_provider,storage_reference,upload_status,idempotency_key_hash,uploaded_by_user_id) VALUES('TENANT-A',$1,'TOOL_INSTANCE',$2,$2,'regrind.pdf','application/pdf',12,'INSPECTION','TEST',$1,'AVAILABLE',$3,'USER-A')", [attachmentId, toolId, attachmentId.endsWith('4') ? 'a'.repeat(64) : 'b'.repeat(64)]);
  let sequence = 10;
  const service = new ToolingTraceabilityService({ repository: new PostgresToolingRepository({ runtime: app }), uuid: () => `13810000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`, clock: () => new Date('2026-09-07T18:00:00Z') });
  return { app, migration, service };
}

test('manual regrind atomically preserves nominal geometry, verified actual geometry, actor, reason, and evidence', async () => {
  const f = await fixture();
  const result = await f.service.recordRegrind(CONTEXT, { toolInstanceId: TOOL, expectedVersion: 1, measuredDiameter: 0.4975, unitSystem: 'INCH', reason: 'Returned from regrind vendor', evidenceAttachmentId: EVIDENCE });
  assert.equal(result.condition, 'REGROUND');
  assert.equal(result.actualMeasuredDiameter, 0.4975);
  assert.equal(result.version, 2);
  const current = await f.service.get(CONTEXT, TOOL);
  assert.equal(current.nominalDiameter, 0.5);
  assert.equal(current.currentMeasurement.measuredDiameter, 0.4975);
  assert.equal(current.currentMeasurement.evidenceAttachmentId, EVIDENCE);
  assert.equal(current.condition, 'REGROUND');
  const history = await f.service.history(CONTEXT, TOOL, 25);
  assert.ok(history.some((event) => event.event_type === 'REGRIND_MEASUREMENT' && event.actor_user_id === 'USER-A' && event.details.evidenceAttachmentId === EVIDENCE));
  assert.ok(history.some((event) => event.event_type === 'CONDITION' && event.details.to === 'REGROUND' && event.details.reason === 'Returned from regrind vendor'));
  assert.ok(history.some((event) => event.event_type === 'MANUAL_ENTRY' && event.details.source === 'MANUAL_REGRIND'));
  assert.ok(history.some((event) => event.event_type === 'EVIDENCE' && event.reference_id === EVIDENCE));
  await f.app.close(); await f.migration.close();
});

test('regrind rejects stale versions, wrong-parent evidence, forged tenant authority, and unit mismatch without partial writes', async () => {
  const f = await fixture();
  const input = { toolInstanceId: TOOL, expectedVersion: 2, measuredDiameter: 0.4975, unitSystem: 'INCH', reason: 'Reground', evidenceAttachmentId: EVIDENCE };
  await assert.rejects(() => f.service.recordRegrind(CONTEXT, input), (error) => error.code === 'CONFLICT');
  await assert.rejects(() => f.service.recordRegrind(CONTEXT, { ...input, expectedVersion: 1, evidenceAttachmentId: OTHER_EVIDENCE }), (error) => error.code === 'NOT_FOUND');
  await assert.rejects(() => f.service.recordRegrind({ ...CONTEXT, authoritative: false }, { ...input, expectedVersion: 1 }), (error) => error.code === 'FORBIDDEN');
  await assert.rejects(() => f.service.recordRegrind(CONTEXT, { ...input, expectedVersion: 1, unitSystem: 'MILLIMETER' }), (error) => error.code === 'INVALID_REQUEST');
  const counts = await f.app.query("SELECT (SELECT count(*)::int FROM atlas_tool_measurements WHERE tool_instance_id=$1) measurements,(SELECT count(*)::int FROM atlas_tool_condition_events WHERE tool_instance_id=$1) conditions", [TOOL]);
  assert.equal(Number([counts.rows[0].measurements].flat()[0]), 0);
  assert.equal(Number([counts.rows[0].conditions].flat()[0]), 0);
  await f.app.close(); await f.migration.close();
});

test('bounded retrieval searches ID, condition, location, nominal and actual geometry without cross-tenant authority', async () => {
  const f = await fixture();
  await f.service.recordRegrind(CONTEXT, { toolInstanceId: TOOL, expectedVersion: 1, measuredDiameter: 0.4975, unitSystem: 'INCH', reason: 'Reground' });
  assert.equal((await f.service.search(CONTEXT, 'REGROUND', 25))[0].toolInstanceId, TOOL);
  assert.equal((await f.service.search(CONTEXT, 'TOOL CRIB', 25))[0].toolInstanceId, TOOL);
  assert.equal((await f.service.search(CONTEXT, '0.5', 25))[0].nominalDiameter, 0.5);
  assert.equal((await f.service.search(CONTEXT, '0.4975', 25))[0].actualMeasuredDiameter, 0.4975);
  await assert.rejects(() => f.service.get({ ...CONTEXT, tenantId: 'TENANT-B' }, TOOL), (error) => error.code === 'NOT_FOUND');
  await assert.rejects(() => f.service.search(CONTEXT, 'x', 25), (error) => error.code === 'INVALID_REQUEST');
  await f.app.close(); await f.migration.close();
});

test('server-generated physical identifier rotation revokes the old locator and neither token grants authority', async () => {
  const f = await fixture();
  const first = await f.service.replacePhysicalIdentifier(CONTEXT, TOOL);
  const second = await f.service.replacePhysicalIdentifier(CONTEXT, TOOL);
  assert.notEqual(first.opaqueToken, second.opaqueToken);
  await assert.rejects(() => f.service.scan(CONTEXT, first.opaqueToken), (error) => error.code === 'NOT_FOUND');
  const located = await f.service.scan(CONTEXT, second.opaqueToken);
  assert.equal(located.toolInstanceId, TOOL);
  await assert.rejects(() => f.service.scan({ ...CONTEXT, capabilities: [] }, second.opaqueToken), (error) => error.code === 'FORBIDDEN');
  const stored = await f.app.query('SELECT token_hash,status,issued_by_user_id,revoked_by_user_id FROM atlas_tool_identifiers WHERE tenant_id=$1 ORDER BY issued_at,tool_identifier_id', ['TENANT-A']);
  assert.ok(stored.rows.every((row) => ![first.opaqueToken, second.opaqueToken].includes(row.token_hash)));
  assert.equal(stored.rows.filter((row) => row.status === 'ACTIVE').length, 1);
  assert.equal(stored.rows.find((row) => row.status === 'REVOKED').revoked_by_user_id, 'USER-A');
  await f.app.close(); await f.migration.close();
});
