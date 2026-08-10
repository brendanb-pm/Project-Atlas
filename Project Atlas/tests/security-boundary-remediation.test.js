const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.join(__dirname,'..','appscript','src');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const registry=read('Services/EndpointAuthorizationRegistry.gs');
const code=read('UI/Code.gs');

// Domain identity is selected from a server-owned table, never from a client capability.
assert.match(registry,/Quote:\{read:'RFQ_READ',write:'QUOTE_WRITE'\}/);
assert.match(registry,/Job:\{read:'OPERATIONS_READ',write:'OPERATIONS_WRITE'\}/);
assert.match(registry,/Invoice:\{read:'FINANCE_READ',write:'FINANCE_WRITE'\}/);
assert.match(code,/getMvpEntityCapability_\(entity,'write'\)/);
assert.match(code,/entity==='Quote'.*changes,'status'/);
assert.match(code,/function approveQuote.*QUOTE_APPROVE|approveQuote.*HIGH_RISK_WRITE/s);
assert.match(code,/function issueQuote.*QUOTE_ISSUE|issueQuote.*HIGH_RISK_WRITE/s);
assert.match(code,/caps\.indexOf\(getMvpEntityCapability_\(entity,'read'\)\)/);

// Attack the generic endpoint: Customer permission cannot be replayed against restricted domains.
let allowed=['CORE_RECORD_WRITE'],lastCapability='';
const endpointContext=vm.createContext({console,Object,Array,String,Date,JSON,Error,
  enforceAbuseControl_:()=>{},
  authorizedExecute_:(cap,name,operation)=>{lastCapability=cap;if(!allowed.includes(cap))throw Object.assign(new Error('denied'),{code:'AUTHORIZATION_ERROR'});return operation({userId:'U1',capabilities:allowed});},
  toClientError_:error=>({ok:false,error:{code:error.code}}),
  VmosValidationError:function(message){this.message=message;this.code='VALIDATION_ERROR';},
  VmosAuthorizationError:function(message){this.message=message;this.code='AUTHORIZATION_ERROR';},
  MvpService:function(entity){this.create=input=>({entity,input});this.update=(id,changes)=>({entity,id,changes});this.list=()=>[entity];},
  MvpLifecycleService:function(){},HtmlService:{},LockService:{getScriptLock:()=>({})}
});
vm.runInContext(registry,endpointContext);vm.runInContext(code,endpointContext);
assert.equal(endpointContext.createMvpRecord('Customer',{name:'ok'}).ok,true);
assert.equal(lastCapability,'CORE_RECORD_WRITE');
assert.equal(endpointContext.createMvpRecord('Invoice',{amount:10}).ok,false);assert.equal(lastCapability,'FINANCE_WRITE');
allowed=['QUOTE_WRITE'];assert.equal(endpointContext.updateMvpRecord('Quote','Q1',{status:'Issued'}).ok,false);
allowed=['CORE_RECORD_READ'];const bootstrap=endpointContext.getMvpBootstrap();assert.deepEqual(Object.keys(bootstrap.data),['Customer']);

// Public persistence initializers cannot bypass the universal boundary.
[['ConfigIdeas.gs','initializeIdeasPersistence'],['Utilities/OperationalPersistence.gs','initializeShopOperationalPersistence']].forEach(([file,name])=>{
  const source=read(file);
  assert.match(source,new RegExp('function '+name+'\\(\\) \\{\\s*return callable_\\(\\\''+name));
  assert.match(registry,new RegExp(name+":\\{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'"));
});

// Every UI callable is classified; any other direct sheet-creating public function is rejected.
const uiNames=Array.from(code.matchAll(/^function\s+([A-Za-z0-9_]+)\(/gm)).map(x=>x[1]).filter(x=>!['callable_'].includes(x));
uiNames.forEach(name=>assert.match(registry,new RegExp('(?:^|\\s)'+name+':\\{kind:')));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.gs')?[path.join(dir,e.name)]:[]);}
walk(root).forEach(file=>{
  const source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{([\s\S]*?)^\}/gm)){
    if(match[1].endsWith('_'))continue;
    if(/insertSheet\(|setValues\(/.test(match[2]))assert.ok(['initializeIdeasPersistence','initializeShopOperationalPersistence'].includes(match[1]),'Unclassified public persistence mutation: '+match[1]);
  }
});

// A durable PENDING audit record exists before mutation. Post-commit audit failure yields recovery state.
const context=vm.createContext({console,Date,Object,Array,String,JSON,Error,Utilities:{getUuid:()=> 'uuid'},VmosError:function(message,code){this.message=message;this.code=code;},SecurityAuditEventRepository:function(){}});
context.VmosError.prototype=Object.create(Error.prototype);
vm.runInContext(read('Services/IdentityAuthorizationService.gs'),context);
let records=[],updates=[],mutated=false;
const audit=new context.SecurityAuditService({repository:{create:r=>{records.push({...r});return r;},update:(id,c)=>{updates.push({id,c});throw new Error('audit unavailable');}},clock:()=>new Date('2026-08-10T00:00:00Z'),uuid:()=> '1'});
const ctx={tenantId:'T1',userId:'U1',principalType:'TEST',principalSubject:'subject',operation:'mutate',correlationId:'CORR',actorType:'USER',occurredAt:new Date('2026-08-10T00:00:00Z')};
const result=audit.execute(ctx,'CORE_RECORD_WRITE',()=>{mutated=true;return {id:'R1'};});
assert.equal(records[0].status,'PENDING');assert.equal(records[0].correlationId,'CORR');assert.equal(records[0].principalSubject,'subject');assert.equal(mutated,true);assert.equal(result.auditStatus,'RECOVERY_REQUIRED');
let uncertainRecords=[];
const failing=new context.SecurityAuditService({repository:{create:r=>uncertainRecords.push({...r}),update:()=>{}},uuid:()=> '2'});
assert.throws(()=>failing.execute(ctx,'CORE_RECORD_WRITE',()=>{throw new Error('after-write uncertainty');}),e=>e.code==='UNKNOWN_OUTCOME');

// The operator calendar payload exposes display/state fields, never provider credentials/cursors/IDs.
const workspace=read('Services/CalendarWorkspaceReadService.gs');
['credentialReference','syncCursor','subscriptionId','externalEventId','externalCalendarId','externalAccountId'].forEach(secret=>assert.doesNotMatch(workspace,new RegExp(secret+':c\\.'+secret+'|'+secret+':l\\.'+secret)));
assert.match(workspace,/hasExternalProjection:!!l\.externalEventId/);
assert.doesNotMatch(read('UI/CalendarFollowUps.html'),/item\.externalEventId/);

// Reassignment/closure and purchase approval use narrow mutation locks.
assert.match(read('Services/FollowUpCalendarService.gs'),/withMutationLock_/);
assert.match(read('Services/PurchaseApprovalService.gs'),/withMutationLock_/);
assert.match(code,/LockService\.getScriptLock\(\).*\.approve/);

console.log('MOS-121I adversarial security-boundary remediation tests passed');
