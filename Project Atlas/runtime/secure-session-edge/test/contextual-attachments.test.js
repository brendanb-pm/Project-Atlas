import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { ContextualAttachmentService, InMemoryObjectStorageAdapter, ObjectStorageRouter, PostgresContextualAttachmentRepository, S3ObjectStorageAdapter, AzureBlobObjectStorageAdapter } from '../src/contextual-attachments.js';
import { createPostgresRuntimeConfig, PostgresRuntime } from '../src/postgres-runtime.js';
import { FOUNDATION_MIGRATIONS, PostgresMigrationRunner } from '../src/migrations.js';
import { PostgresToolingRepository, ToolingTraceabilityService } from '../src/tooling-traceability.js';

const TOOL_TYPE='TOOL-TYPE-140a0000-0000-4000-8000-000000000001';
const TOOL='TOOL-140a0000-0000-4000-8000-000000000002';
const CONTEXT={authoritative:true,tenantId:'TENANT-A',userId:'USER-A',correlationId:'CORR-140A',capabilities:['ATTACHMENT_READ','ATTACHMENT_WRITE']};
let sequence=10;
const uuid=()=>`140a0000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`;

async function fixture(){
  const db=newDb({autoCreateForeignKeyIndices:true,noAstCoverageCheck:true});
  const {Pool}=db.adapters.createPg();
  const secrets={getSecret:async()=> 'test'};
  const base={environment:'test',host:'localhost',database:'atlas_attachments',user:'atlas',passwordSecretRef:'x',tls:{required:false}};
  const app=new PostgresRuntime(await createPostgresRuntimeConfig({...base,role:'APPLICATION'},{secretProvider:secrets}),{PoolCtor:Pool});
  const migration=new PostgresRuntime(await createPostgresRuntimeConfig({...base,role:'MIGRATION'},{secretProvider:secrets}),{PoolCtor:Pool});
  await new PostgresMigrationRunner({runtime:migration,migrations:FOUNDATION_MIGRATIONS,lock:{acquire:async()=>async()=>{}}}).apply();
  for(const tenant of ['TENANT-A','TENANT-B']) await app.query('INSERT INTO atlas_installation(installation_id,tenant_id) VALUES($1,$2)',[`INSTALL-${tenant}`,tenant]);
  for(const user of ['USER-A','USER-B']) await app.query('INSERT INTO atlas_users(user_id,display_name) VALUES($1,$2)',[user,user]);
  await app.query('INSERT INTO atlas_tool_types(tenant_id,tool_type_id,description,tool_class,unit_system,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6)',['TENANT-A',TOOL_TYPE,'Manual tool','END_MILL','INCH','USER-A']);
  await app.query('INSERT INTO atlas_tool_instances(tenant_id,tool_instance_id,tool_type_id,condition,created_by_user_id) VALUES($1,$2,$3,$4,$5)',['TENANT-A',TOOL,TOOL_TYPE,'NEW','USER-A']);
  const adapter=new InMemoryObjectStorageAdapter(),storage=new ObjectStorageRouter({provider:'TEST',adapters:{TEST:adapter}}),repository=new PostgresContextualAttachmentRepository({runtime:app});
  return {app,migration,adapter,repository,service:new ContextualAttachmentService({repository,storage,uuid,clock:()=>new Date('2026-09-03T12:00:00Z')})};
}

test('manual contextual upload stores only metadata, appends audit events and is idempotent',async()=>{
  const f=await fixture(),body=Buffer.from('inspection photo bytes'),input={parentType:'TOOL_INSTANCE',parentId:TOOL,fileName:'flute.jpg',mediaType:'image/jpeg',byteSize:body.length,category:'INSPECTION',description:'Flute condition',idempotencyKey:'mobile-1',body};
  const first=await f.service.upload(CONTEXT,input),again=await f.service.upload(CONTEXT,input);
  assert.equal(first.attachment_id,again.attachment_id);assert.equal(first.upload_status,'AVAILABLE');assert.equal(f.adapter.objects.size,1);
  const row=(await f.app.query('SELECT * FROM atlas_contextual_attachments WHERE tenant_id=$1',[CONTEXT.tenantId])).rows[0];
  assert.equal(row.parent_id,TOOL);assert.equal(row.tool_instance_id,TOOL);assert.equal(row.description,'Flute condition');
  assert.ok(!Object.keys(row).some((name)=>/blob|binary|body|content_bytes/.test(name)));
  assert.equal((await f.app.query('SELECT count(*)::int count FROM atlas_contextual_attachment_events WHERE tenant_id=$1',[CONTEXT.tenantId])).rows[0].count,2);
  await assert.rejects(()=>f.service.upload(CONTEXT,{...input,body:Buffer.from('different content!!!'),byteSize:20}),e=>e.code==='CONFLICT');
  const listed=await f.service.list(CONTEXT,{parentType:'TOOL_INSTANCE',parentId:TOOL,limit:1});assert.equal(listed.items.length,1);
  await f.app.close();await f.migration.close();
});

test('tenant authority, capabilities, MIME, size, stale updates and relational stitching fail closed',async()=>{
  const f=await fixture(),body=Buffer.from('x'),input={parentType:'TOOL_INSTANCE',parentId:TOOL,fileName:'x.jpg',mediaType:'image/jpeg',byteSize:1,idempotencyKey:'x',body};
  await assert.rejects(()=>f.service.upload({...CONTEXT,authoritative:false},input),e=>e.code==='FORBIDDEN');
  await assert.rejects(()=>f.service.upload({...CONTEXT,capabilities:[]},input),e=>e.code==='FORBIDDEN');
  await assert.rejects(()=>f.service.upload(CONTEXT,{...input,mediaType:'text/html'}),e=>e.code==='INVALID_REQUEST');
  await assert.rejects(()=>f.service.upload(CONTEXT,{...input,byteSize:2}),e=>e.code==='INVALID_REQUEST');
  const saved=await f.service.upload(CONTEXT,input);
  await assert.rejects(()=>f.service.updateMetadata(CONTEXT,{attachmentId:saved.attachment_id,expectedVersion:1,category:'PHOTO'}),e=>e.code==='CONFLICT');
  await assert.rejects(()=>f.app.query("INSERT INTO atlas_contextual_attachments(tenant_id,attachment_id,parent_type,parent_id,tool_instance_id,file_name,media_type,byte_size,storage_provider,storage_reference,idempotency_key_hash,uploaded_by_user_id) VALUES('TENANT-B','ATTACH-140a0000-0000-4000-8000-000000000099','TOOL_INSTANCE',$1,$1,'x.jpg','image/jpeg',1,'TEST','x',repeat('a',64),'USER-B')",[TOOL]));
  await f.app.close();await f.migration.close();
});

test('storage failure is explicit and retry reuses the same metadata identity',async()=>{
  const f=await fixture(),body=Buffer.from('retry'),good=f.service.storage,bad={provider:'TEST',put:async()=>{throw new Error('down');},remove:async()=>{}};f.service.storage=bad;
  const input={parentType:'TOOL_INSTANCE',parentId:TOOL,fileName:'retry.pdf',mediaType:'application/pdf',byteSize:body.length,idempotencyKey:'retry-1',body};
  await assert.rejects(()=>f.service.upload(CONTEXT,input),e=>e.code==='PERSISTENCE_UNAVAILABLE');
  const failed=(await f.app.query("SELECT * FROM atlas_contextual_attachments WHERE idempotency_key_hash IS NOT NULL")).rows[0];assert.equal(failed.upload_status,'FAILED');assert.equal(failed.failure_code,'OBJECT_STORAGE_WRITE_FAILED');
  f.service.storage=good;const completed=await f.service.upload(CONTEXT,input);assert.equal(completed.attachment_id,failed.attachment_id);assert.equal(completed.upload_status,'AVAILABLE');
  await f.app.close();await f.migration.close();
});

test('S3 and Azure adapters pass opaque keys through injected server gateways without URLs or credentials',async()=>{
  const calls=[];const s3=new S3ObjectStorageAdapter({bucket:'atlas-private',gateway:{putObject:async x=>calls.push(x),deleteObject:async x=>calls.push(x)}});const az=new AzureBlobObjectStorageAdapter({container:'atlas-private',gateway:{upload:async x=>calls.push(x),delete:async x=>calls.push(x)}});
  await s3.put({storageReference:'tenant/ATTACH-1',body:Buffer.from('a'),mediaType:'image/jpeg',checksumSha256:'h'});await az.put({storageReference:'tenant/ATTACH-2',body:Buffer.from('b'),mediaType:'application/pdf',checksumSha256:'h'});
  assert.deepEqual(calls.map(x=>x.key||x.blobName),['tenant/ATTACH-1','tenant/ATTACH-2']);assert.doesNotMatch(JSON.stringify(calls),/https?:\/\/|secret|credential|password/i);
});

test('MOS-138 pilot supports audited direct manual create and optimistic edit with no AI dependency',async()=>{
  const f=await fixture(),manualTool='TOOL-140a0000-0000-4000-8000-000000000077';
  const tooling=new ToolingTraceabilityService({repository:new PostgresToolingRepository({runtime:f.app}),uuid,clock:()=>new Date('2026-09-03T12:00:00Z')});
  const context={...CONTEXT,capabilities:['TOOLING_WRITE']};
  const created=await tooling.registerToolInstance(context,{toolInstanceId:manualTool,toolTypeId:TOOL_TYPE,condition:'USED',serialLotIdentifier:'LOT-140A',storageLocation:'CRIB-A',notes:'Entered by operator'});
  assert.equal(created.version,1);
  const updated=await tooling.updateToolInstance(context,{toolInstanceId:manualTool,expectedVersion:1,condition:'REGROUND',serialLotIdentifier:'LOT-140A',storageLocation:'GRIND-OUT',notes:'Awaiting verification'});
  assert.equal(updated.version,2);assert.equal(updated.condition,'REGROUND');assert.equal(updated.verification_status,'STALE');
  await assert.rejects(()=>tooling.updateToolInstance(context,{toolInstanceId:manualTool,expectedVersion:1,condition:'USED'}),e=>e.code==='CONFLICT');
  const events=(await f.app.query('SELECT event_type,previous_version,new_version FROM atlas_tool_manual_entry_events WHERE tenant_id=$1 AND tool_instance_id=$2 ORDER BY new_version',[CONTEXT.tenantId,manualTool])).rows;
  assert.deepEqual(events.map(x=>x.event_type),['CREATED','UPDATED']);assert.equal(events[1].previous_version,1);assert.equal(events[1].new_version,2);
  await f.app.close();await f.migration.close();
});
