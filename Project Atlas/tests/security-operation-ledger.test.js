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

// A canonical checkpoint survives a required-event failure with deterministic identity and attribution.
const checkpointRepo=memoryRepository(),checkpointLedger=new context.SecurityAuditService_({repository:checkpointRepo,lock,uuid:()=> 'checkpoint',clock:()=>new Date('2026-08-10T00:01:00Z')}),checkpointOptions={idempotencyKey:'create:F10',resourceType:'FollowUp',resourceId:'F10',recoveryType:'FOLLOW_UP_DOMAIN_EVENT',recoveryContext:{eventType:'CREATED',expectedVersion:0}};let creates=0;
assert.throws(()=>checkpointLedger.execute(auditContext('T1','U10','CREATE10'),'FOLLOWUP_WRITE',operationContext=>{creates++;operationContext.checkpoint({id:'F10',status:'OPEN',version:1});throw new Error('required event append failed');},checkpointOptions),error=>error.code==='UNKNOWN_OUTCOME');
const checkpointRecord=checkpointRepo.rows[0];assert.equal(checkpointRecord.resourceId,'F10');assert.equal(checkpointRecord.recoveryType,'FOLLOW_UP_DOMAIN_EVENT');assert.equal(checkpointRecord.mutationState,'CANONICAL_COMPLETED');assert.equal(JSON.parse(checkpointRecord.resultJson).id,'F10');assert.equal(checkpointRecord.userId,'U10');
const checkpointEvents=[],checkpointRecovery=new context.SecurityOperationRecoveryService_({securityEvents:checkpointRepo,followUps:{get:()=>({id:'F10',status:'OPEN',version:1})},followUpEvents:{findByCorrelation:()=>null,append:event=>{checkpointEvents.push(event);return event;}},ideas:{},ideaEvents:{},jobs:{},jobEvents:{},ledger:checkpointLedger,lock,clock:()=>new Date('2026-08-10T00:03:00Z')});
checkpointRecovery.reconcile(checkpointRecord.id,{tenantId:'T1',actor:'SYSTEM:SECURITY_OPERATION_RECOVERY',correlationId:'REC10'});checkpointRecovery.reconcile(checkpointRecord.id,{tenantId:'T1',actor:'SYSTEM:SECURITY_OPERATION_RECOVERY',correlationId:'REC11'});assert.equal(creates,1);assert.equal(checkpointEvents.length,1);assert.equal(checkpointEvents[0].actor,'U10');assert.equal(checkpointRepo.get(checkpointRecord.id).recoveryActor,'SYSTEM:SECURITY_OPERATION_RECOVERY');
assert.throws(()=>checkpointRecovery.reconcile(checkpointRecord.id,{tenantId:'OTHER',actor:'SYSTEM'}),error=>error.code==='AUTHORIZATION_ERROR');

// Ideas use the same deterministic create/event recovery contract.
const ideaRepo=memoryRepository(),ideaLedger=new context.SecurityAuditService_({repository:ideaRepo,lock,uuid:()=> 'idea-recovery',clock:()=>new Date('2026-08-10T00:01:00Z')}),ideaOptions={idempotencyKey:'capture:IDEA-10',resourceType:'Idea',resourceId:'IDEA-10',recoveryType:'IDEA_DOMAIN_EVENT',recoveryContext:{eventType:'IDEA_CAPTURED',note:'Captured'}};let ideaCreates=0;
assert.throws(()=>ideaLedger.execute({...auditContext('T1','U10','IDEA-C'),operation:'captureIdea'},'CORE_RECORD_WRITE',operationContext=>{ideaCreates++;operationContext.checkpoint({id:'IDEA-10',status:'IDEA'});throw new Error('idea event failed');},ideaOptions),error=>error.code==='UNKNOWN_OUTCOME');
const ideaEvents=[],ideaRecovery=new context.SecurityOperationRecoveryService_({securityEvents:ideaRepo,followUps:{},followUpEvents:{},ideas:{findById:id=>({id,title:'Idea'})},ideaEvents:{listByIdeaId:()=>ideaEvents,append:event=>{ideaEvents.push(event);return event;}},jobs:{},jobEvents:{},ledger:ideaLedger,lock});
ideaRecovery.reconcile(ideaRepo.rows[0].id,{tenantId:'T1',actor:'SYSTEM:SECURITY_OPERATION_RECOVERY',correlationId:'IDEA-R'});ideaRecovery.reconcile(ideaRepo.rows[0].id,{tenantId:'T1',actor:'SYSTEM:SECURITY_OPERATION_RECOVERY',correlationId:'IDEA-R2'});assert.equal(ideaCreates,1);assert.equal(ideaEvents.length,1);assert.equal(ideaEvents[0].ideaId,'IDEA-10');assert.equal(ideaEvents[0].actor,'U10');

// Active leases reject replay; expired leases reconcile without blindly repeating canonical work.
const activeRepo=memoryRepository(),activeLedger=new context.SecurityAuditService_({repository:activeRepo,lock,uuid:()=> 'lease',leaseSeconds:120,clock:()=>new Date('2026-08-10T00:00:30Z')});
activeRepo.rows.push({id:'SAE-lease',tenantId:'T1',userId:'U1',operation:'completeFollowUp',idempotencyKey:'lease-key',status:'IN_PROGRESS',leaseSeconds:120,leaseExpiresAt:new Date('2026-08-10T00:02:00Z'),resultJson:''});
assert.throws(()=>activeLedger.execute(auditContext('T1','U1','LEASE'),'FOLLOWUP_WRITE',()=>{throw new Error('must not execute');},{idempotencyKey:'lease-key'}),error=>error.code==='OPERATION_IN_PROGRESS');
let staleCanonicalRuns=0,reconciles=0;const staleLedger=new context.SecurityAuditService_({repository:activeRepo,lock,leaseSeconds:120,clock:()=>new Date('2026-08-10T00:03:00Z'),staleReconciler:record=>{reconciles++;activeRepo.update(record.id,{status:'COMPLETED',resultJson:JSON.stringify({id:'F-stale'})});return {outcome:'COMPLETED'};}});
const staleResult=staleLedger.execute(auditContext('T1','U1','LEASE2'),'FOLLOWUP_WRITE',()=>{staleCanonicalRuns++;},{idempotencyKey:'lease-key'});assert.equal(reconciles,1);assert.equal(staleCanonicalRuns,0);assert.equal(staleResult.replayed,true);assert.equal(staleResult.value.id,'F-stale');

// Uncertain stale work becomes explicit review state and is no longer permanently IN_PROGRESS.
const uncertainRepo=memoryRepository();uncertainRepo.rows.push({id:'SAE-uncertain',tenantId:'T1',userId:'U1',operation:'completeFollowUp',idempotencyKey:'uncertain-key',status:'IN_PROGRESS',leaseSeconds:30,leaseExpiresAt:new Date('2026-08-10T00:00:30Z'),resultJson:''});
const uncertainLedger=new context.SecurityAuditService_({repository:uncertainRepo,lock,clock:()=>new Date('2026-08-10T00:03:00Z'),staleReconciler:()=>({outcome:'UNCERTAIN'})});
const uncertainResult=uncertainLedger.execute(auditContext('T1','U1','UNCERTAIN'),'FOLLOWUP_WRITE',()=>{throw new Error('must not execute');},{idempotencyKey:'uncertain-key'});assert.equal(uncertainResult.auditStatus,'RECOVERY_REQUIRED');assert.equal(uncertainRepo.rows[0].status,'RECOVERY_REQUIRED');assert.equal(uncertainRepo.rows[0].recoveryStatus,'REVIEW_REQUIRED');

// Only an explicit, positively proven non-completion permits the original operation to run.
const retryRepo=memoryRepository();retryRepo.rows.push({id:'SAE-retry',tenantId:'T1',userId:'U1',operation:'completeFollowUp',idempotencyKey:'retry-key',status:'IN_PROGRESS',leaseSeconds:30,leaseExpiresAt:new Date('2026-08-10T00:00:30Z'),resultJson:''});let safeRetries=0;
const retryLedger=new context.SecurityAuditService_({repository:retryRepo,lock,clock:()=>new Date('2026-08-10T00:03:00Z'),staleReconciler:()=>({outcome:'NOT_COMPLETED',proof:true})});retryLedger.execute(auditContext('T1','U1','RETRY'),'FOLLOWUP_WRITE',()=>{safeRetries++;return {id:'F-retried'};},{idempotencyKey:'retry-key'});assert.equal(safeRetries,1);assert.equal(retryRepo.rows[0].status,'COMPLETED');

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
const followUpSource=fs.readFileSync(path.join(base,'Services','FollowUpCalendarService.gs'),'utf8'),ideaSource=fs.readFileSync(path.join(base,'Services','IdeasService.gs'),'utf8');
assert.match(followUpSource,/repository\.create\(record\);this\.checkpoint\(record\);this\.event_/,'FollowUp create must checkpoint before its required event.');
assert.match(ideaSource,/ideas\.append\(idea\);\s*this\.checkpoint[\s\S]*appendEvent_/,'Idea capture must checkpoint before its required event.');

console.log('Atlas durable security operation ledger and recovery tests passed');
