const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
function E(message,code){this.message=message;this.code=code;} E.prototype=Object.create(Error.prototype);
const context=vm.createContext({Date,Math,Number,String,Object,Array,JSON,
  VmosValidationError_:function(m){return new E(m,'VALIDATION_ERROR')},VmosAuthorizationError_:function(m){return new E(m||'Denied','AUTHORIZATION_ERROR')},VmosNotFoundError_:function(m){return new E(m,'NOT_FOUND')},VmosConfigurationError_:function(m){return new E(m,'CONFIGURATION_ERROR')},VmosConflictError:function(m){return new E(m,'CONFLICT')}
});
vm.runInContext(fs.readFileSync(path.join(base,'Services','SerializedFirearmService.gs'),'utf8'),context);
function fixture(options={}){
  const records=[],events=[],customers=[{id:'C-1',tenantId:'T-1',name:'Casey Customer'}],jobs=[{id:'J-1',tenantId:'T-1',partId:'Slide work'}],ffls=[{id:'F-1',tenantId:'T-1',displayName:'Partner FFL'}];
  const recordRepo={list:()=>records.map(x=>({...x})),get:id=>{const r=records.find(x=>x.id===id);if(!r)throw new E('missing','NOT_FOUND');return {...r}},create:r=>{if(records.some(x=>x.id===r.id))throw new E('duplicate','CONFLICT');records.push({...r});return {...r}},update:(id,changes)=>{const i=records.findIndex(x=>x.id===id);if(i<0)throw new E('missing','NOT_FOUND');records[i]={...records[i],...changes};return {...records[i]}},findDuplicate:(tenant,maker,importer,serial)=>records.find(r=>r.tenantId===tenant&&r.manufacturer.toUpperCase()===String(maker).toUpperCase()&&r.importer.toUpperCase()===String(importer).toUpperCase()&&r.serialNormalized===serial)};
  let failAppend=!!options.failAppend;
  const eventRepo={listByFirearm:(tenant,id)=>events.filter(e=>e.tenantId===tenant&&e.firearmId===id).map(x=>({...x})),get:id=>{const e=events.find(x=>x.id===id);if(!e)throw new E('missing','NOT_FOUND');return {...e}},append:e=>{if(failAppend)throw new E('event unavailable','INTERNAL');if(events.some(x=>x.id===e.id))return {...events.find(x=>x.id===e.id)};events.push({...e});return {...e}}};
  const listRepo=rows=>({list:()=>rows,get:id=>{const r=rows.find(x=>x.id===id);if(!r)throw new E('missing','NOT_FOUND');return r}});
  let tick=0;const service=new context.SerializedFirearmService_({records:recordRepo,events:eventRepo,customers:listRepo(customers),jobs:listRepo(jobs),ffls:listRepo(ffls),clock:()=>new Date(Date.UTC(2026,7,12,12,0,tick++)),uuid:()=>String(tick).padStart(8,'0')});
  return {service,records,events,setFail:value=>failAppend=value};
}
const actor={tenantId:'T-1',userId:'USER-A',operationId:'OP-1',correlationId:'CORR-1',requestFingerprint:'FP-1'};
const intake={manufacturer:'Acme Arms',importer:'',model:'M1',serialNumber:'ab-12 3',caliberGauge:'9mm',classification:'Pistol',acquisitionDate:'2026-08-12',acquisitionSourceType:'CUSTOMER',acquisitionSourceName:'Casey Customer',customerId:'C-1',custodyLocation:'Intake safe'};

{
  const f=fixture(),created=f.service.intake(intake,actor,'FIREARM-1');
  assert.equal(created.id,'FIREARM-1');assert.equal(created.serialNormalized,'AB123');assert.equal(created.lifecycleStatus,'ACQUIRED');assert.equal(f.events.length,1);assert.equal(f.events[0].actorUserId,'USER-A');
  assert.throws(()=>f.service.intake(intake,{...actor,operationId:'OP-2'},'FIREARM-2'),e=>e.code==='CONFLICT');
  let assigned=f.service.assignJob(created.id,'J-1',created.version,{...actor,operationId:'OP-3'});assert.equal(assigned.jobId,'J-1');
  let moved=f.service.moveCustody(created.id,'Bench 2','IN_WORK',assigned.version,{...actor,operationId:'OP-4'});assert.equal(moved.custodyLocation,'Bench 2');
  let corrected=f.service.correct(created.id,{model:'M1A'},'Source document correction','',moved.version,{...actor,operationId:'OP-5'});assert.equal(corrected.model,'M1A');assert.equal(JSON.parse(f.events.at(-1).previousJson).model,'M1');
  let disposed=f.service.dispose(created.id,{recipientType:'CUSTOMER',customerId:'C-1',recipientName:'Casey Customer',dispositionDate:'2026-08-13'},corrected.version,{...actor,operationId:'OP-6'});assert.equal(disposed.lifecycleStatus,'DISPOSED');
  assert.throws(()=>f.service.correct(created.id,{lifecycleStatus:'ACQUIRED'},'rewrite', '',disposed.version,actor),e=>e.code==='VALIDATION_ERROR');
  assert.match(f.service.exportCsv({},actor),/FIREARM-1/);
}
{
  const f=fixture({failAppend:true});assert.throws(()=>f.service.intake(intake,actor,'FIREARM-RECOVER'));
  assert.equal(f.records.length,1,'canonical intake occurs once');assert.equal(f.records[0].reconciliationStatus,'EVENT_PENDING');assert.equal(f.records[0].pendingEventType,'ACQUIRED');assert.match(f.records[0].pendingEventJson,/USER-A/);
  f.setFail(false);const recovered=f.service.reconcile('FIREARM-RECOVER',{...actor,userId:'SECURITY-RECOVER',operationId:'REC-1'});
  assert.equal(recovered.originalActor,'USER-A');assert.equal(recovered.recoveryActor,'SECURITY-RECOVER');assert.equal(f.records.length,1);assert.equal(f.events.length,1);
  assert.equal(f.service.reconcile('FIREARM-RECOVER',{...actor,userId:'SECURITY-RECOVER'}).status,'CURRENT');assert.equal(f.events.length,1,'repeated recovery is idempotent');
  assert.throws(()=>f.service.get('FIREARM-RECOVER',{...actor,tenantId:'T-2'}),e=>e.code==='NOT_FOUND');
}
{
  const f=fixture({failAppend:true});assert.throws(()=>f.service.intake(intake,actor,'FIREARM-TAMPER'));f.setFail(false);
  f.records[0].pendingEventJson=JSON.stringify({...JSON.parse(f.records[0].pendingEventJson),tenantId:'T-2'});
  assert.throws(()=>f.service.reconcile('FIREARM-TAMPER',{...actor,userId:'SECURITY-RECOVER'}),e=>e.code==='AUTHORIZATION_ERROR');assert.equal(f.events.length,0);
}
const registry=fs.readFileSync(path.join(base,'Services','EndpointAuthorizationRegistry.gs'),'utf8');
['FIREARMS_READ','FIREARMS_WRITE','FIREARMS_CUSTODY','FIREARMS_DISPOSE','FIREARMS_CORRECT','FIREARMS_RECONCILE'].forEach(cap=>assert(registry.includes(cap)));
assert.match(registry,/intakeSerializedFirearm:'PREALLOCATED_RESOURCE_ID'/);assert.match(registry,/disposeSerializedFirearm:'EXPLICIT_REVIEW'/);
const nav=fs.readFileSync(path.join(base,'Services','NavigationService.gs'),'utf8'),ui=fs.readFileSync(path.join(base,'UI','FirearmsWorkspace.html'),'utf8');
assert.match(nav,/module:'FIREARMS'/);assert.match(ui,/LEGAL\/COMPLIANCE REVIEW REQUIRED/);assert.doesNotMatch(ui,/VMOS|Vitality/);
const config=fs.readFileSync(path.join(base,'ConfigFirearms.gs'),'utf8');['SerializedFirearms','FirearmRegulatoryEvents','ExternalFFLs','Premises Address','Pending Event JSON','Security Operation Fingerprint'].forEach(value=>assert(config.includes(value),value));assert.match(config,/No initializer is invoked automatically/);
console.log('Atlas MOS-124 serialized-firearm lifecycle, recovery, tenancy, audit, and UI contracts passed');
