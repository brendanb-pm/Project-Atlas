const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const codeSource=fs.readFileSync(path.join(base,'UI','Code.gs'),'utf8');
const registrySource=fs.readFileSync(path.join(base,'Services','EndpointAuthorizationRegistry.gs'),'utf8');
assert.match(codeSource,/createMvpRecord[\s\S]*?prepareSecurityResource_/,'MVP creates must prepare their canonical ID after authorization and before ledger begin.');
assert.match(codeSource,/createSalesActivity[\s\S]*?prepareSecurityResource_[\s\S]*?allocateId/,'SalesActivity creates must preallocate their canonical-format ID.');
assert.match(codeSource,/recordProcessTrial[\s\S]*?preallocateSecurityResourceId_\('PTR'\)/,'ProcessTrial creates must preallocate their canonical ID.');
assert.match(codeSource,/submitPurchaseRequest[\s\S]*?preallocateSecurityResourceId_\('PUR'\)/,'Purchase requests must preallocate their canonical ID.');
assert.match(codeSource,/recordCashReceipt[\s\S]*?receiptCommandId/,'Cash receipt recovery must retain its durable command identity.');
assert.match(registrySource,/approveQuote:'VERSIONED_EXISTING_RESOURCE_CHECKPOINT'/);
assert.match(registrySource,/depositCashReceipt:'VERSIONED_EXISTING_RESOURCE_CHECKPOINT'/);
function DummyRepository(){}
const context={console,Date,JSON,Object,Array,String,Number,Boolean,Math,Error,
  Utilities:{getUuid:()=> 'UUID'},getSecurityOperationLeaseSeconds_:()=>120,
  FollowUpRepository_:DummyRepository,FollowUpEventRepository_:DummyRepository,JobEventRepository_:DummyRepository,
  MvpService_:function(){},SecurityAuditEventRepository_:DummyRepository};
vm.createContext(context);
['Utilities/Errors.gs','Services/IdentityAuthorizationService.gs','Services/SecurityOperationRecoveryService.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context,{filename:file}));

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
const recovery=new context.SecurityOperationRecoveryService_({securityEvents:repository,ledger:recoveryAudit,lock:null,clock:()=>new Date('2026-08-10T12:03:00Z'),mvpFactory:()=>({get:id=>{assert.equal(id,'CUST-1');return{id,status:'Active'};}}),followUps:{},followUpEvents:{},jobs:{},jobEvents:{},qrTokens:{}});
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
assert.equal(stateProof.outcome,'COMPLETED','Matching durable post-state must prove a transition completed.');
console.log('Atlas universal durable mutation recovery tests passed');
