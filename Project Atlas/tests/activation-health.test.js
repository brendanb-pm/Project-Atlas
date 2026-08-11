const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const context=vm.createContext({console,Date,Object,Array,String,Number,Boolean,JSON,VmosAuthorizationError_:function(message){this.message=message;this.code='AUTHORIZATION_ERROR';},serializeVmosValue_:value=>JSON.parse(JSON.stringify(value)),parseIdentityList_:value=>JSON.parse(value||'[]'),ATLAS_DEFAULT_ROLE_CAPABILITIES:{ADMIN:['ADMIN_CONFIG'],MANAGER:['OPERATIONS_READ']}});
['Services/NavigationService.gs','Services/AtlasActivationHealthService.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context,{filename:file}));
const profile={enabledModules:[]};
const navigation=new context.AtlasNavigationService_({profile});
const rows=value=>({list:()=>value});
const member={tenantId:'TENANT-A',userId:'USER-A',status:'ACTIVE',roles:'["ADMIN","UNKNOWN"]'};
const diagnostics=[];
const service=new context.AtlasActivationHealthService_({
  identityConfig:()=>({mode:'ENFORCED',tenantId:'TENANT-A'}),memberships:{findActive:(tenant,user)=>tenant==='TENANT-A'&&user==='USER-A'?member:undefined},navigation,
  followUps:rows([{id:'FU-1'}]),purchases:rows([]),calendarRequests:rows([]),calendarConfig:()=>({enabled:false,provider:'',calendarId:''}),diagnostic:item=>diagnostics.push(item)
});
const adminCaps=['ADMIN_CONFIG','CORE_RECORD_READ','SALES_READ','FOLLOWUP_READ','RFQ_READ','OPERATIONS_READ','FINANCE_READ','PURCHASE_REQUEST','CALENDAR_RECONCILE'];
const health=service.get({authoritative:true,userId:'USER-A',tenantId:'TENANT-A',correlationId:'AUTH-1',capabilities:adminCaps});
assert.equal(health.enforcementMode,'ENFORCED');
assert.equal(health.principalResolved,true);assert.equal(health.activeMembership,true);
assert.deepEqual(health.recognizedRoles,['ADMIN']);assert.equal(health.unrecognizedRoleCount,1);
assert.equal(health.sources.followUps,'READY');assert.equal(health.sources.purchasing,'EMPTY');assert.equal(health.sources.calendarReview,'DISABLED');
assert(health.navigationItemCount>1);
assert.throws(()=>service.get({authoritative:false,capabilities:adminCaps}),error=>error.code==='AUTHORIZATION_ERROR');
assert.throws(()=>service.get({authoritative:true,userId:'OTHER',tenantId:'TENANT-A',capabilities:adminCaps}),error=>error.code==='AUTHORIZATION_ERROR');

const failed=new context.AtlasActivationHealthService_({identityConfig:()=>({mode:'ENFORCED'}),memberships:{findActive:()=>member},navigation,followUps:{list(){throw Object.assign(new Error('secret worksheet'),{code:'CONFIGURATION_ERROR'});}},purchases:rows([]),calendarConfig:()=>({enabled:true,provider:'GOOGLE_CALENDAR',calendarId:'configured'}),calendarRequests:rows([]),diagnostic:item=>diagnostics.push(item)}).get({authoritative:true,userId:'USER-A',tenantId:'TENANT-A',correlationId:'AUTH-2',capabilities:adminCaps});
assert.equal(failed.sources.followUps,'SOURCE_UNAVAILABLE');assert.equal(failed.sources.calendarReview,'EMPTY');
assert(diagnostics.every(item=>!JSON.stringify(item).includes('secret worksheet')),'safe diagnostics do not leak repository details');

const registry=fs.readFileSync(path.join(base,'Services','EndpointAuthorizationRegistry.gs'),'utf8');
const code=fs.readFileSync(path.join(base,'UI','Code.gs'),'utf8');
assert.match(registry,/getAtlasActivationHealth:\{kind:'READ',capability:'ADMIN_CONFIG'\}/);
assert.match(code,/function getAtlasActivationHealth\(\).*AtlasActivationHealthService_/);
assert.doesNotMatch(code,/getAtlasActivationHealth\([^)]*(role|capabilit|user|tenant)/i,'client cannot inject diagnostic identity or capability');
assert.doesNotMatch(fs.readFileSync(path.join(base,'Services','AtlasActivationHealthService.gs'),'utf8'),/credential|token|spreadsheetId|scriptPropert/i);

const calendarContext=vm.createContext({Array,Object,String,CalendarProviderRegistry_:function(){this.list=()=>[];},getConfiguredCalendarProviderKeys_:()=>[]});
vm.runInContext(fs.readFileSync(path.join(base,'Services','CalendarWorkspaceReadService.gs'),'utf8'),calendarContext);
const forbidden={list(){throw new Error('calendar store should not be read');},listByUserId(){throw new Error('calendar store should not be read');}};
const basicWorkspace=new calendarContext.CalendarWorkspaceReadService_({calendarConfig:()=>({enabled:false}),connections:forbidden,links:forbidden,requests:forbidden,followUps:rows([{id:'FU-1'}]),customers:rows([]),registry:{list:()=>[]}}).get('USER-A');
assert.equal(basicWorkspace.calendarIntegrationEnabled,false);
assert.equal(basicWorkspace.followUps.length,1,'basic Follow-Ups remain available without calendar stores');
assert.deepEqual(Array.from(basicWorkspace.connections),[]);assert.deepEqual(Array.from(basicWorkspace.links),[]);assert.deepEqual(Array.from(basicWorkspace.requests),[]);
console.log('Atlas ADMIN-only activation health, source-state, and diagnostic safety tests passed');
