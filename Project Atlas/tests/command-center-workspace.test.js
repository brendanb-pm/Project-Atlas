const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.join(__dirname,'..','appscript','src');
const context={Date,Object,Array,String,Number,JSON,dailyProductionBucket_:()=> 'OVERDUE',getAtlasBusinessTimeZone_:()=> 'America/Los_Angeles'};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'Services','CommandCenterWorkspaceService.gs'),'utf8'),context);
const list=(rows,tracker,name)=>({list(){tracker.push(name);return rows;}});
const now=new Date('2026-08-10T12:00:00');
const reads=[];
const service=new context.CommandCenterWorkspaceService_({
  followUps:list([
    {id:'FU-OVER',title:'Call Alpha',dueAt:'2026-08-09T09:00:00',ownerUserId:'USER-1',status:'OPEN'},
    {id:'FU-TODAY',title:'Send sample update',dueAt:'2026-08-10T15:00:00',ownerUserId:'USER-1',status:'OPEN'},
    {id:'FU-OTHER',title:'Other owner',dueAt:'2026-08-10T16:00:00',ownerUserId:'USER-2',status:'OPEN'}
  ],reads,'followups'),
  jobs:list([{id:'JOB-1',status:'BLOCKED',partId:'PART-LONG',operator:'USER-1'},{id:'JOB-2',status:'ACTIVE',operator:'USER-2'},{id:'JOB-DONE',status:'COMPLETED',dueDate:'2026-08-01',operator:'USER-1'}],reads,'jobs'),
  rfqs:list([{id:'RFQ-1',status:'REVIEW',description:'Pricing review'}],reads,'rfqs'),
  quotes:list([{id:'Q-1',status:'DRAFT'}],reads,'quotes'),
  customers:list([{id:'C-1'},{id:'C-2'}],reads,'customers'),
  invoices:list([{id:'INV-1',status:'OPEN',jobId:'JOB-1'}],reads,'invoices'),
  purchases:list([{id:'PUR-1',status:'PENDING_APPROVAL',description:'Tooling'}],reads,'purchases'),
  calendarRequests:list([{id:'ECR-1',followUpId:'FU-3',status:'PENDING_REVIEW',changeType:'CONFLICT'}],reads,'calendar'),
  clock:()=>now
});
const adminCaps=['CORE_RECORD_READ','FOLLOWUP_READ','OPERATIONS_READ','RFQ_READ','FINANCE_READ','PURCHASE_APPROVE','CALENDAR_RECONCILE','ADMIN_CONFIG'];
const model=service.get({userId:'USER-1',tenantId:'TENANT-1',capabilities:adminCaps});
assert.equal(model.accessState,'READY');
assert.equal(model.attention[0].severity,'CRITICAL_BLOCKING','blocking work sorts first');
assert(model.attention.some(item=>item.category==='FOLLOWUP_OVERDUE'));
assert(model.attention.some(item=>item.category==='PURCHASE_APPROVAL'));
assert(model.attention.some(item=>item.category==='CALENDAR_REVIEW'));
assert(!model.attention.some(item=>item.resourceId==='JOB-DONE'),'completed Work Orders never surface as production due attention');
assert.deepEqual(Array.from(model.today).map(item=>item.id),['FU-TODAY','FU-OTHER']);
assert(model.myWork.some(item=>item.id==='FU-TODAY')&&model.myWork.some(item=>item.id==='JOB-1'));
assert.equal(model.metrics.length,5);
assert.equal(model.recent.RFQ.length,1);
assert(reads.length<=8,'workspace uses one bounded orchestration call without N+1 reads');
assert(Buffer.byteLength(JSON.stringify(model),'utf8')<12000,'representative workspace payload remains compact');

const limited=new context.CommandCenterWorkspaceService_({followUps:list([],[],'followups'),jobs:list([],[],'jobs'),rfqs:list([],[],'rfqs'),quotes:list([],[],'quotes'),customers:list([],[],'customers'),invoices:list([],[],'invoices'),purchases:list([],[],'purchases'),calendarRequests:list([],[],'calendar'),clock:()=>now}).get({userId:'USER-2',tenantId:'TENANT-1',capabilities:['FOLLOWUP_READ']});
assert.equal(limited.metrics.length,0,'unauthorized reference data is not returned');
assert.equal(limited.capabilities.finance,false);

const zeroCapability=new context.CommandCenterWorkspaceService_({clock:()=>now}).get({userId:'USER-3',tenantId:'TENANT-1',authoritative:true,capabilities:[]});
assert.equal(zeroCapability.accessState,'NO_APPLICABLE_CAPABILITIES');
assert.deepEqual(Array.from(zeroCapability.attention),[],'zero capability is a valid, explicit payload rather than a transport failure');
const validationContext=new context.CommandCenterWorkspaceService_({clock:()=>now}).get({userId:'legacy',tenantId:'TENANT-1',authoritative:false,capabilities:[]});
assert.equal(validationContext.accessState,'IDENTITY_VALIDATION_REQUIRED');
let disabledCalendarReads=0;
const calendarDisabled=new context.CommandCenterWorkspaceService_({calendarState:()=> 'DISABLED',calendarRequests:{list(){disabledCalendarReads++;return[];}},clock:()=>now}).get({userId:'USER-1',tenantId:'TENANT-1',authoritative:true,capabilities:['CALENDAR_RECONCILE']});
assert.equal(calendarDisabled.sourceStates.calendarReview,'DISABLED');
assert.equal(disabledCalendarReads,0,'disabled calendar does not probe its reconciliation store');
assert.equal(calendarDisabled.unavailable.length,0,'disabled calendar is not reported as a runtime failure');

const partial=new context.CommandCenterWorkspaceService_({followUps:{list(){throw new Error('sheet details');}},jobs:list([],[],'jobs'),rfqs:list([],[],'rfqs'),quotes:list([],[],'quotes'),customers:list([],[],'customers'),invoices:list([],[],'invoices'),purchases:list([],[],'purchases'),calendarRequests:list([],[],'calendar'),clock:()=>now}).get({userId:'USER-1',tenantId:'TENANT-1',capabilities:['FOLLOWUP_READ']});
assert.equal(partial.unavailable[0].section,'Follow-Ups');
assert.equal(partial.unavailable[0].message,'This section is temporarily unavailable.');
assert.equal(partial.attention.length,0,'one source failure leaves the workspace usable');

const diagnostics=[],unavailableSource={list(){throw Object.assign(new Error('private sheet detail'),{code:'CONFIGURATION_ERROR'});}};
const allUnavailable=new context.CommandCenterWorkspaceService_({followUps:unavailableSource,jobs:unavailableSource,rfqs:unavailableSource,quotes:unavailableSource,customers:unavailableSource,invoices:unavailableSource,purchases:unavailableSource,calendarRequests:unavailableSource,clock:()=>now,diagnostic:item=>diagnostics.push(item)}).get({userId:'USER-1',tenantId:'TENANT-1',authoritative:true,correlationId:'AUTH-SAFE-1',capabilities:adminCaps});
assert.equal(allUnavailable.accessState,'READY');
assert.equal(allUnavailable.unavailable.length,8,'all optional sources degrade independently');
assert(diagnostics.every(item=>item.correlationId==='AUTH-SAFE-1'&&!JSON.stringify(item).includes('private sheet detail')),'diagnostics retain safe correlation and source category without raw repository details');

const index=fs.readFileSync(path.join(root,'UI','Index.html'),'utf8');
const code=fs.readFileSync(path.join(root,'UI','Code.gs'),'utf8');
const registry=fs.readFileSync(path.join(root,'Services','EndpointAuthorizationRegistry.gs'),'utf8');
assert.match(code,/function getCommandCenterWorkspace/);
assert.match(code,/serializeVmosValue_\(new CommandCenterWorkspaceService_\(\)\.get\(context\)\)/,'workspace is serialized before google.script.run transport');
assert.match(registry,/getCommandCenterWorkspace:\{kind:'READ',capability:null\}/);
assert.match(index,/getCommandCenterWorkspace\(\)/);
assert.match(index,/Attention now/);
assert.match(index,/No urgent items need your attention/);
assert.match(index,/workspace-grid/);
assert.match(index,/@media\(max-width:600px\)/);
assert.match(index,/aria-labelledby="attention-title"/);
assert.match(index,/state\.active==='CommandCenter'\)refreshWorkspace\(\)/,'Command Center no longer loads bootstrap on entry');
assert.match(index,/function validWorkspacePayload/);
assert.match(index,/NO_APPLICABLE_CAPABILITIES/);
assert.match(index,/IDENTITY_VALIDATION_REQUIRED/);
assert.equal((index.match(/\.getMvpBootstrap\(\)/g)||[]).length,1,'entity bootstrap remains a separate single call');
assert.doesNotMatch(index,/Firearms|Coatings|Vitality|Asana/i);
console.log('Command Center bounded workspace, attention, failure isolation, security presentation, accessibility, and responsive contracts passed');
