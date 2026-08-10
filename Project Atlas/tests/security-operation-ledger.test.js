const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const context=vm.createContext({console,Date,Object,Array,String,JSON,Error,Math,Utilities:{getUuid:()=>String(Math.random()).slice(2)},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},SecurityAuditEventRepository_:function(){}});
['Utilities/Errors.gs','Services/IdentityAuthorizationService.gs','Services/SecurityOperationRecoveryService.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context));

function memoryRepository(){const rows=[];return {rows,create(record){rows.push({...record});return rows[rows.length-1];},update(id,changes){const row=this.get(id);Object.assign(row,changes);return row;},get(id){const row=rows.find(item=>item.id===id);if(!row)throw new Error('missing');return row;},list(){return rows;},findByOperationIdentity(tenant,user,operation,key){return rows.find(row=>row.tenantId===tenant&&row.userId===user&&row.operation===operation&&row.idempotencyKey===key);}};}
function auditContext(tenant,user,correlation){return {tenantId:tenant,userId:user,principalType:'TEST',principalSubject:user+'@example.test',operation:'completeFollowUp',correlationId:correlation,actorType:'USER',occurredAt:new Date('2026-08-10T00:00:00Z'),capabilities:['FOLLOWUP_WRITE']};}
const lock={waitLock(){},releaseLock(){}};

// Completed replay returns a bounded prior result and never repeats canonical work.
const repository=memoryRepository(),ledger=new context.SecurityAuditService_({repository,lock,uuid:()=>String(repository.rows.length+1),clock:()=>new Date('2026-08-10T00:01:00Z')});
let executions=0;const options={idempotencyKey:'complete:F1:v1',resourceType:'FollowUp',resourceId:'F1',recoveryType:'FOLLOW_UP_DOMAIN_EVENT',recoveryContext:{eventType:'COMPLETED',expectedVersion:1}};
const first=ledger.execute(auditContext('T1','U1','C1'),'FOLLOWUP_WRITE',()=>{executions++;return {id:'F1',status:'COMPLETED',version:2,secret:'must-not-persist'};},options);
const replay=ledger.execute(auditContext('T1','U1','C2'),'FOLLOWUP_WRITE',()=>{executions++;throw new Error('must not run');},options);
assert.equal(executions,1);assert.equal(replay.replayed,true);assert.deepEqual(replay.value,{id:'F1',status:'COMPLETED',version:2});assert.doesNotMatch(repository.rows[0].resultJson,/must-not-persist|secret/);

// Tenant and user scope isolate otherwise identical operation keys.
ledger.execute(auditContext('T2','U1','C3'),'FOLLOWUP_WRITE',()=>{executions++;return {id:'F2'};},options);
ledger.execute(auditContext('T1','U2','C4'),'FOLLOWUP_WRITE',()=>{executions++;return {id:'F3'};},options);
assert.equal(executions,3);assert.equal(repository.rows.length,3);

// A concurrent delivery observes IN_PROGRESS and cannot enter the canonical operation.
const concurrentRepo=memoryRepository(),concurrentLedger=new context.SecurityAuditService_({repository:concurrentRepo,lock,uuid:()=> 'concurrent'});let concurrentExecutions=0,innerCode='';
concurrentLedger.execute(auditContext('T1','U1','CC'),'FOLLOWUP_WRITE',()=>{concurrentExecutions++;try{concurrentLedger.execute(auditContext('T1','U1','CC2'),'FOLLOWUP_WRITE',()=>{concurrentExecutions++;},options);}catch(error){innerCode=error.code;}return {id:'F1'};},options);
assert.equal(concurrentExecutions,1);assert.equal(innerCode,'OPERATION_IN_PROGRESS');

// Canonical success followed by domain-audit failure retains exact recovery context.
const recoveryRepo=memoryRepository(),recoveryLedger=new context.SecurityAuditService_({repository:recoveryRepo,lock,uuid:()=> 'recovery'}),followUp={id:'F9',status:'OPEN',version:1},recoveryOptions={idempotencyKey:'complete:F9:v1',resourceType:'FollowUp',resourceId:'F9',recoveryType:'FOLLOW_UP_DOMAIN_EVENT',recoveryContext:{eventType:'COMPLETED',expectedVersion:1}};let canonicalUpdates=0;
assert.throws(()=>recoveryLedger.execute(auditContext('T1','U9','RC'),'FOLLOWUP_WRITE',()=>{followUp.status='COMPLETED';followUp.version=2;canonicalUpdates++;throw new Error('domain event append failed');},recoveryOptions),error=>error.code==='UNKNOWN_OUTCOME');
const recoveryRecord=recoveryRepo.rows[0];assert.equal(recoveryRecord.status,'RECOVERY_REQUIRED');assert.equal(recoveryRecord.resourceType,'FollowUp');assert.equal(recoveryRecord.resourceId,'F9');assert.equal(recoveryRecord.recoveryType,'FOLLOW_UP_DOMAIN_EVENT');
const uncertainReplay=recoveryLedger.execute(auditContext('T1','U9','RC2'),'FOLLOWUP_WRITE',()=>{canonicalUpdates++;},recoveryOptions);assert.equal(canonicalUpdates,1);assert.equal(uncertainReplay.auditStatus,'RECOVERY_REQUIRED');

const domainEvents=[],followUpEvents={findByCorrelation:(id,correlation)=>domainEvents.find(event=>event.followUpId===id&&event.correlationId===correlation),append:event=>{domainEvents.push({...event});return event;}},recovery=new context.SecurityOperationRecoveryService_({securityEvents:recoveryRepo,followUps:{get:id=>{assert.equal(id,'F9');return {...followUp};}},followUpEvents,jobs:{},jobEvents:{},ledger:recoveryLedger,clock:()=>new Date('2026-08-10T00:02:00Z')});
recovery.recover(recoveryRecord.id);assert.equal(domainEvents.length,1);assert.equal(domainEvents[0].eventType,'COMPLETED');assert.equal(domainEvents[0].actor,'U9');assert.equal(recoveryRepo.get(recoveryRecord.id).status,'COMPLETED');
recovery.recover(recoveryRecord.id);assert.equal(domainEvents.length,1,'Repeated recovery must not append a second event.');

// Recovery failure remains explicitly recoverable.
const failedRepo=memoryRepository();failedRepo.rows.push({...recoveryRecord,id:'SAE-fail',status:'RECOVERY_REQUIRED',recoveryStatus:'PENDING'});const failedLedger=new context.SecurityAuditService_({repository:failedRepo,lock}),failedRecovery=new context.SecurityOperationRecoveryService_({securityEvents:failedRepo,followUps:{get:()=>{throw new Error('temporary repository failure');}},followUpEvents,jobs:{},jobEvents:{},ledger:failedLedger});
assert.throws(()=>failedRecovery.recover('SAE-fail'),/temporary repository failure/);assert.equal(failedRepo.get('SAE-fail').status,'RECOVERY_REQUIRED');assert.equal(failedRepo.get('SAE-fail').recoveryStatus,'FAILED');

// Operator surfaces must not present uncertain/replayed operations as clean success.
const callableSource=fs.readFileSync(path.join(base,'UI','Code.gs'),'utf8');
assert.match(callableSource,/auditStatus==='RECOVERY_REQUIRED'[\s\S]*ok:false[\s\S]*refreshRequired:true/);
assert.match(callableSource,/result\.replayed[\s\S]*ok:false[\s\S]*refreshRequired:true/);
['CalendarFollowUps.html','Ideas.html','Index.html','SalesActivity.html','ShopFloor.html'].forEach(file=>{
  assert.match(fs.readFileSync(path.join(base,'UI',file),'utf8'),/refreshRequired/,file+' must refresh authoritative state after an uncertain result.');
});

console.log('Atlas durable security operation ledger and recovery tests passed');
