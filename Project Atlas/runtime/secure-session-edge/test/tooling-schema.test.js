import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createPostgresRuntimeConfig, PostgresRuntime } from '../src/postgres-runtime.js';
import { FOUNDATION_MIGRATIONS, PostgresMigrationRunner } from '../src/migrations.js';
import { DOMAIN_MIGRATIONS } from '../src/domain-migrations.js';

const UUID = Object.freeze({
  type: 'TOOL-TYPE-11111111-1111-4111-8111-111111111111',
  tool: 'TOOL-22222222-2222-4222-8222-222222222222',
  measurement: 'TOOL-MEAS-33333333-3333-4333-8333-333333333333',
  holder: 'HOLDER-44444444-4444-4444-8444-444444444444',
  assembly: 'TOOL-ASM-55555555-5555-4555-8555-555555555555',
  assignment: 'TOOL-ASGN-66666666-6666-4666-8666-666666666666',
  requirement: 'TOOL-REQ-77777777-7777-4777-8777-777777777777',
  execution: 'TOOL-EXEC-88888888-8888-4888-8888-888888888888',
  identifier: 'TOOL-ID-99999999-9999-4999-8999-999999999999'
});

async function fixture() {
  const db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  const secretProvider = { getSecret: async () => 'test-only' };
  const base = { environment: 'test', host: 'localhost', database: 'atlas_tooling_test', user: 'atlas_app', passwordSecretRef: 'test', tls: { required: false } };
  const app = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'APPLICATION' }, { secretProvider }), { PoolCtor: Pool });
  const migration = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'MIGRATION' }, { secretProvider }), { PoolCtor: Pool });
  const runner = new PostgresMigrationRunner({ runtime: migration, migrations: FOUNDATION_MIGRATIONS, lock: { acquire: async () => async () => {} } });
  await runner.apply();
  return { app, migration };
}
async function reject(promise) { await assert.rejects(promise); }
async function seed(f, tenant = 'TENANT-A') {
  await f.app.query('INSERT INTO atlas_installation(installation_id,tenant_id) VALUES($1,$2)', [`INSTALL-${tenant}`, tenant]);
  await f.app.query('INSERT INTO atlas_users(user_id,display_name) VALUES($1,$2)', [`USER-${tenant}`, `Operator ${tenant}`]);
}

test('ordered migration creates the canonical MOS-138 domain and required indexes', async () => {
  const f = await fixture();
  const tables = (await f.app.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map((x) => x.table_name);
  for (const name of ['atlas_tool_types','atlas_tool_instances','atlas_tool_measurements','atlas_tool_condition_events','atlas_holders','atlas_tool_assemblies','atlas_tool_machine_assignments','atlas_operation_tool_requirements','atlas_operation_tool_executions','atlas_tool_identifiers']) assert.ok(tables.includes(name), name);
  const migrationSql = DOMAIN_MIGRATIONS.at(-1).sql;
  for (const name of ['atlas_tool_instances_lookup_idx','atlas_tool_assemblies_active_holder_idx','atlas_tool_assemblies_active_tool_idx','atlas_tool_assignments_machine_idx','atlas_tool_executions_operation_idx','atlas_tool_identifiers_resource_idx']) assert.match(migrationSql, new RegExp(`CREATE (?:UNIQUE )?INDEX ${name}`), name);
  await f.app.close(); await f.migration.close();
});

test('nominal, measured and execution geometry coexist while tenant stitching and duplicate active assemblies fail closed', async () => {
  const f = await fixture(); await seed(f, 'TENANT-A'); await seed(f, 'TENANT-B');
  const user = 'USER-TENANT-A';
  await f.app.query('INSERT INTO atlas_tool_types(tenant_id,tool_type_id,description,tool_class,nominal_diameter,unit_system,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)', ['TENANT-A',UUID.type,'1/2 in end mill','END_MILL',0.5,'INCH',user]);
  await f.app.query('INSERT INTO atlas_tool_instances(tenant_id,tool_instance_id,tool_type_id,condition,created_by_user_id) VALUES($1,$2,$3,$4,$5)', ['TENANT-A',UUID.tool,UUID.type,'REGROUND',user]);
  await f.app.query('INSERT INTO atlas_tool_measurements(tenant_id,tool_measurement_id,tool_instance_id,measured_diameter,unit_system,measured_at,measured_by_user_id,verification_status,verified_at,verified_by_user_id) VALUES($1,$2,$3,$4,$5,NOW(),$6,$7,NOW(),$6)', ['TENANT-A',UUID.measurement,UUID.tool,0.4975,'INCH',user,'VERIFIED']);
  await f.app.query("UPDATE atlas_tool_instances SET current_measurement_id=$1,verification_status='VERIFIED' WHERE tenant_id=$2 AND tool_instance_id=$3", [UUID.measurement,'TENANT-A',UUID.tool]);
  await f.app.query('INSERT INTO atlas_holders(tenant_id,holder_id,description,holder_type,created_by_user_id) VALUES($1,$2,$3,$4,$5)', ['TENANT-A',UUID.holder,'CAT40 holder','END_MILL_HOLDER',user]);
  await f.app.query("INSERT INTO atlas_tool_assemblies(tenant_id,tool_assembly_id,holder_id,tool_instance_id,installed_by_user_id,installed_at,verification_status,verified_measurement_id,actual_diameter_snapshot,unit_system,last_verified_at) VALUES($1,$2,$3,$4,$5,NOW(),'VERIFIED',$6,$7,'INCH',NOW())", ['TENANT-A',UUID.assembly,UUID.holder,UUID.tool,user,UUID.measurement,0.4975]);
  const geometry = (await f.app.query('SELECT t.nominal_diameter AS nominal,m.measured_diameter AS actual,a.actual_diameter_snapshot AS assembly_actual FROM atlas_tool_instances i JOIN atlas_tool_types t ON t.tenant_id=i.tenant_id AND t.tool_type_id=i.tool_type_id JOIN atlas_tool_measurements m ON m.tenant_id=i.tenant_id AND m.tool_measurement_id=i.current_measurement_id JOIN atlas_tool_assemblies a ON a.tenant_id=i.tenant_id AND a.tool_instance_id=i.tool_instance_id WHERE i.tenant_id=$1', ['TENANT-A'])).rows[0];
  assert.deepEqual(Object.fromEntries(Object.entries(geometry).map(([key,value]) => [key, Number(value)])), { nominal: 0.5, actual: 0.4975, assembly_actual: 0.4975 });
  await reject(f.app.query('INSERT INTO atlas_tool_instances(tenant_id,tool_instance_id,tool_type_id,condition,created_by_user_id) VALUES($1,$2,$3,$4,$5)', ['TENANT-B','TOOL-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',UUID.type,'NEW','USER-TENANT-B']));
  await reject(f.app.query("INSERT INTO atlas_tool_assemblies(tenant_id,tool_assembly_id,holder_id,tool_instance_id,installed_by_user_id,installed_at,verification_status) VALUES($1,$2,$3,$4,$5,NOW(),'UNVERIFIED')", ['TENANT-A','TOOL-ASM-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',UUID.holder,UUID.tool,user]));
  await reject(f.app.query('INSERT INTO atlas_tool_instances(tenant_id,tool_instance_id,tool_type_id,condition,created_by_user_id) VALUES($1,$2,$3,$4,$5)', ['TENANT-A','TOOL-not-canonical',UUID.type,'NEW',user]));
  await f.app.query("UPDATE atlas_tool_assemblies SET status='REMOVED',removed_at=NOW(),removed_by_user_id=$1 WHERE tenant_id=$2 AND tool_assembly_id=$3", [user,'TENANT-A',UUID.assembly]);
  const secondHolder='HOLDER-cccccccc-cccc-4ccc-8ccc-cccccccccccc', secondAssembly='TOOL-ASM-dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await f.app.query('INSERT INTO atlas_holders(tenant_id,holder_id,description,holder_type,created_by_user_id) VALUES($1,$2,$3,$4,$5)', ['TENANT-A',secondHolder,'Second CAT40 holder','END_MILL_HOLDER',user]);
  await f.app.query("INSERT INTO atlas_tool_assemblies(tenant_id,tool_assembly_id,holder_id,tool_instance_id,installed_by_user_id,installed_at,verification_status,verified_measurement_id,actual_diameter_snapshot,unit_system,last_verified_at) VALUES($1,$2,$3,$4,$5,NOW(),'VERIFIED',$6,$7,'INCH',NOW())", ['TENANT-A',secondAssembly,secondHolder,UUID.tool,user,UUID.measurement,0.4975]);
  const movement=(await f.app.query('SELECT tool_assembly_id,status,actual_diameter_snapshot FROM atlas_tool_assemblies WHERE tenant_id=$1 AND tool_instance_id=$2 ORDER BY installed_at,tool_assembly_id',['TENANT-A',UUID.tool])).rows;
  assert.equal(movement.length,2);
  assert.equal(movement.filter((x)=>x.status==='ACTIVE').length,1);
  assert.equal(movement.find((x)=>x.status==='ACTIVE').tool_assembly_id,secondAssembly);
  await f.app.close(); await f.migration.close();
});

test('assignment, requirement and execution foreign keys preserve the operation and asset identity chain', async () => {
  const f = await fixture(); await seed(f); const t='TENANT-A', user='USER-TENANT-A';
  await f.app.query('INSERT INTO atlas_tool_types(tenant_id,tool_type_id,description,tool_class,nominal_diameter,unit_system,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[t,UUID.type,'1/2 in end mill','END_MILL',0.5,'INCH',user]);
  await f.app.query('INSERT INTO atlas_tool_instances(tenant_id,tool_instance_id,tool_type_id,condition,created_by_user_id) VALUES($1,$2,$3,$4,$5)',[t,UUID.tool,UUID.type,'REGROUND',user]);
  await f.app.query('INSERT INTO atlas_tool_measurements(tenant_id,tool_measurement_id,tool_instance_id,measured_diameter,unit_system,measured_at,measured_by_user_id,verification_status,verified_at,verified_by_user_id) VALUES($1,$2,$3,$4,$5,NOW(),$6,$7,NOW(),$6)',[t,UUID.measurement,UUID.tool,0.4975,'INCH',user,'VERIFIED']);
  await f.app.query('INSERT INTO atlas_holders(tenant_id,holder_id,description,holder_type,created_by_user_id) VALUES($1,$2,$3,$4,$5)',[t,UUID.holder,'CAT40 holder','END_MILL_HOLDER',user]);
  await f.app.query("INSERT INTO atlas_tool_assemblies(tenant_id,tool_assembly_id,holder_id,tool_instance_id,installed_by_user_id,installed_at,verification_status,verified_measurement_id,actual_diameter_snapshot,unit_system,last_verified_at) VALUES($1,$2,$3,$4,$5,NOW(),'VERIFIED',$6,$7,'INCH',NOW())",[t,UUID.assembly,UUID.holder,UUID.tool,user,UUID.measurement,0.4975]);
  const asset='ASSET-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await f.app.query('INSERT INTO atlas_assets(tenant_id,asset_id,asset_code,asset_name,category) VALUES($1,$2,$3,$4,$5)',[t,asset,'MILL-04','Haas VF-4','MACHINE']);
  await f.app.query("INSERT INTO atlas_tool_machine_assignments(tenant_id,tool_assignment_id,tool_assembly_id,machine_asset_id,pocket_reference,loaded_at,loaded_by_user_id,verification_status) VALUES($1,$2,$3,$4,$5,NOW(),$6,'VERIFIED')",[t,UUID.assignment,UUID.assembly,asset,'T12',user]);
  await f.app.query("INSERT INTO atlas_jobs(tenant_id,job_id,work_classification,internal_work_type,title,status) VALUES($1,$2,'INTERNAL','FIXTURE_TOOLING',$3,'PLANNED')",[t,'JOB-MOS138','MOS-138 fixture']);
  await f.app.query('INSERT INTO atlas_job_operations(tenant_id,job_operation_id,job_id,sequence_number,operation_code) VALUES($1,$2,$3,$4,$5)',[t,'JOB-OP-8767','JOB-MOS138',20,'OP2']);
  await f.app.query('INSERT INTO atlas_operation_tool_requirements(tenant_id,tool_requirement_id,job_operation_id,tool_type_id,expected_diameter,unit_system,radial_stock_to_leave,verified_actual_geometry_required,policy_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',[t,UUID.requirement,'JOB-OP-8767',UUID.type,0.5,'INCH',0.004,true,JSON.stringify({diameterToleranceMinus:0.001})]);
  await f.app.query("INSERT INTO atlas_operation_tool_executions(tenant_id,tool_execution_id,job_operation_id,tool_requirement_id,tool_instance_id,tool_assembly_id,holder_id,machine_asset_id,pocket_reference,verified_measurement_id,actual_diameter_snapshot,nominal_diameter_snapshot,unit_system,tool_condition_snapshot,preflight_state,executed_at,operator_user_id,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'INCH','REGROUND','WARNING',NOW(),$13,$14)",[t,UUID.execution,'JOB-OP-8767',UUID.requirement,UUID.tool,UUID.assembly,UUID.holder,asset,'T12',UUID.measurement,0.4975,0.5,user,'CORR-MOS138']);
  await f.app.query("UPDATE atlas_tool_assemblies SET status='REMOVED',removed_at=NOW(),removed_by_user_id=$1 WHERE tenant_id=$2 AND tool_assembly_id=$3",[user,t,UUID.assembly]);
  await f.app.query("UPDATE atlas_tool_instances SET condition='RETIRED' WHERE tenant_id=$1 AND tool_instance_id=$2",[t,UUID.tool]);
  const historical=(await f.app.query('SELECT actual_diameter_snapshot AS actual,tool_condition_snapshot,tool_assembly_id,machine_asset_id,pocket_reference FROM atlas_operation_tool_executions WHERE tenant_id=$1 AND tool_execution_id=$2',[t,UUID.execution])).rows[0];
  assert.deepEqual({...historical,actual:Number(historical.actual)},{actual:0.4975,tool_condition_snapshot:'REGROUND',tool_assembly_id:UUID.assembly,machine_asset_id:asset,pocket_reference:'T12'});
  await f.app.close(); await f.migration.close();
});
