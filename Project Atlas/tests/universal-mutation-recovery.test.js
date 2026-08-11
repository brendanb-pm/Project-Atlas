const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const codeSource=fs.readFileSync(path.join(base,'UI','Code.gs'),'utf8');
const registrySource=fs.readFileSync(path.join(base,'Services','EndpointAuthorizationRegistry.gs'),'utf8');
const sheetsSource=fs.readFileSync(path.join(base,'Repository','SheetsRepository.gs'),'utf8');
assert.match(codeSource,/createMvpRecord[\s\S]*?prepareSecurityResource_/,'MVP creates must prepare their canonical ID after authorization and before ledger begin.');
assert.match(codeSource,/createSalesActivity[\s\S]*?prepareSecurityResource_[\s\S]*?allocateId/,'SalesActivity creates must preallocate their canonical-format ID.');
assert.match(codeSource,/recordProcessTrial[\s\S]*?preallocateSecurityResourceId_\('PTR'\)/,'ProcessTrial creates must preallocate their canonical ID.');
assert.match(codeSource,/submitPurchaseRequest[\s\S]*?preallocateSecurityResourceId_\('PUR'\)/,'Purchase requests must preallocate their canonical ID.');
assert.match(codeSource,/recordCashReceipt[\s\S]*?receiptCommandId/,'Cash receipt recovery must retain its durable command identity.');
assert.match(sheetsSource,/insertUnique[\s\S]*?waitLock[\s\S]*?findById[\s\S]*?insert/,'Sequential creates must claim and insert an ID in one short critical section.');
assert.match(registrySource,/approveQuote:'EXPLICIT_REVIEW'/);
assert.match(registrySource,/depositCashReceipt:'EXPLICIT_REVIEW'/);
function DummyRepository(){}
const context={console,Date,JSON,Object,Array,String,Number,Boolean,Math,Error,
  Utilities:{getUuid:()=> 'UUID'},getSecurityOperationLeaseSeconds_:()=>120,
  VmosConflictError:function(message){this.message=message;this.code='CONFLICT';},
  LockService:{getDocumentLock:()=>({waitLock(){},releaseLock(){}}),getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  FollowUpRepository_:DummyRepository,FollowUpEventRepository_:DummyRepository,JobEventRepository_:DummyRepository,
  MvpService_:function(){},SecurityAuditEventRepository_:DummyRepository};
vm.createContext(context);
['Utilities/Errors.gs','Services/IdentityAuthorizationService.gs','Services/SecurityOperationRecoveryService.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context,{filename:file}));
vm.runInContext(sheetsSource,context,{filename:'Repository/SheetsRepository.gs'});
const claimed=[];
const uniqueRepo=Object.create(context.SheetsRepository_.prototype);
uniqueRepo.findById=id=>{const found=claimed.find(row=>row.id===id);if(found)return found;const error=new Error('missing');error.code='NOT_FOUND';throw error;};
uniqueRepo.insert=record=>{claimed.push(record);return record;};
uniqueRepo.insertUnique({id:'CUST-26-0001',securityOperationId:'OP-A'});
assert.throws(()=>uniqueRepo.insertUnique({id:'CUST-26-0001',securityOperationId:'OP-B'}),error=>error&&error.code==='CONFLICT','Two operations cannot claim the same sequential identity.');

let row=null,updateCount=0,failFinalization=true,canonicalCreates=0;
const repository={
  create(value){row={...value};return row;},
  findByOperationIdentity(){return null;},
  get(){return row;},
  update(id,changes){updateCount++;if(failFinalization&&updateCount>=2)throw new Error('LEDGER_WRITE_FAILED');row={...row,...changes};return row;}
};
const at=new Date('2026-08-10T12:00:00Z');
const audit=new context.SecurityAuditService_({repository,lock:null,uuid:()=> '1',clock:()=>at,leaseSeconds:120});
const actor={userId:'USER-1',tenantId:'TENANT-1',principalType:'TEST',principalSubject:'principal',operation:'createMvpRecord',correlationId:'CORR-1',occurredAt:at,actorType:'HUMAN',authoritative:true,capabilities:['CORE_RECORD_WRITE']};
const result=audit.execute(actor,'CORE_RECORD_WRITE',()=>{canonicalCreates++;return{id:'CUST-1',status:'Active'};},{idempotencyKey:'REQ-1',resourceType:'Customer',resourceId:'CUST-1',requestFingerprint:'fp',recoveryType:'UNIVERSAL_RESOURCE_PROOF',recoveryContext:{strategy:'PREALLOCATED_RESOURCE_ID',resourceId:'CUST-1'}});
assert.equal(result.auditStatus,'RECOVERY_REQUIRED');
assert.equal(canonicalCreates,1);
assert.equal(row.status,'IN_PROGRESS');
assert.equal(row.resourceId,'CUST-1','Initial durable intent must retain the canonical ID despite two failed finalization writes.');
assert.equal(row.recoveryType,'UNIVERSAL_RESOURCE_PROOF');
assert.equal(JSON.parse(row.recoveryJson).strategy,'PREALLOCATED_RESOURCE_ID');

failFinalization=false;
const recoveryAudit=new context.SecurityAuditService_({repository,lock:null,clock:()=>new Date('2026-08-10T12:03:00Z')});
const recovery=new context.SecurityOperationRecoveryService_({securityEvents:repository,ledger:recoveryAudit,lock:null,clock:()=>new Date('2026-08-10T12:03:00Z'),mvpFactory:()=>({get:id=>{assert.equal(id,'CUST-1');return{id,status:'Active',securityOperationId:row.id,securityOperationFingerprint:row.requestFingerprint,securityTenantId:row.tenantId,securityActorId:row.userId};}}),followUps:{},followUpEvents:{},jobs:{},jobEvents:{},qrTokens:{}});
const foreignProbe=new context.SecurityOperationRecoveryService_({mvpFactory:()=>({get:()=>({id:'CUST-1',securityOperationId:'FOREIGN',securityOperationFingerprint:'OTHER',securityTenantId:'TENANT-1',securityActorId:'USER-2'})})});
assert.equal(foreignProbe.probePreallocated_(row).outcome,'UNCERTAIN','An existing resource owned by another operation must not be adopted.');
const recovered=recovery.reconcile(row.id,{tenantId:'TENANT-1',actor:'SYSTEM:SECURITY_OPERATION_RECOVERY',correlationId:'REC-1'});
assert.equal(recovered.outcome,'COMPLETED');
assert.equal(canonicalCreates,1,'Recovery must never repeat canonical creation.');
assert.equal(row.status,'COMPLETED');
assert.equal(row.resourceId,'CUST-1');
assert.equal(row.recoveryActor,'SYSTEM:SECURITY_OPERATION_RECOVERY');
assert.equal(recovery.reconcile(row.id,{tenantId:'TENANT-1'}).outcome,'COMPLETED','Repeated recovery must be idempotent.');

const absent={...row,id:'SAE-2',status:'RECOVERY_REQUIRED',resourceId:'CUST-2',resultJson:'',recoveryStatus:'PENDING'};
row=absent;
const notCompleted=new context.SecurityOperationRecoveryService_({securityEvents:repository,ledger:recoveryAudit,lock:null,clock:()=>new Date('2026-08-10T12:03:00Z'),mvpFactory:()=>({get:()=>{const error=new context.VmosError_('missing','NOT_FOUND');throw error;}}),followUps:{},followUpEvents:{},jobs:{},jobEvents:{},qrTokens:{}}).reconcile(row.id,{tenantId:'TENANT-1'});
assert.equal(notCompleted.outcome,'NOT_COMPLETED');
assert.equal(notCompleted.proof,true);

row={...absent,id:'SAE-3',resourceId:'CUST-3',recoveryJson:JSON.stringify({strategy:'EXPLICIT_REVIEW'})};
const uncertain=recovery.reconcile(row.id,{tenantId:'TENANT-1',actor:'SYSTEM:SECURITY_OPERATION_RECOVERY'});
assert.equal(uncertain.outcome,'UNCERTAIN');
assert.equal(row.status,'RECOVERY_REQUIRED');
assert.equal(row.recoveryStatus,'REVIEW_REQUIRED');

row={...absent,id:'SAE-4',resourceType:'CashReceipt',resourceId:'RCPT-1',recoveryJson:JSON.stringify({strategy:'VERSIONED_EXISTING_RESOURCE_CHECKPOINT',expectedState:{depositStatus:'DEPOSITED',depositCommandId:'DEP-1'}})};
const stateProof=new context.SecurityOperationRecoveryService_({securityEvents:repository,ledger:recoveryAudit,lock:null,clock:()=>new Date('2026-08-10T12:03:00Z'),cashReceipts:{findById:()=>({id:'RCPT-1',depositStatus:'DEPOSITED',depositCommandId:'DEP-1'})},followUps:{},followUpEvents:{},jobs:{},jobEvents:{},qrTokens:{}}).reconcile(row.id,{tenantId:'TENANT-1'});
assert.equal(stateProof.outcome,'UNCERTAIN','Matching state without operation ownership proof must require review.');
console.log('Atlas universal durable mutation recovery tests passed');
