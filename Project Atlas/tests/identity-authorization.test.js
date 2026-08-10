const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const context=vm.createContext({console,Date,JSON,String,Number,Math,Object,Array,Error,Session:{getActiveUser:()=>({getEmail:()=>''}),getEffectiveUser:()=>({getEmail:()=> 'deployer@example.com'})}});
['Utilities/Errors.gs','ConfigIdentity.gs','Services/IdentityAuthorizationService.gs','Repository/IdentityRepositories.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context));

function fixture(overrides={}){
  const principal=overrides.principal===undefined?{type:'GOOGLE_WORKSPACE',subject:'operator@example.com',verified:true}:overrides.principal;
  const membership=overrides.membership===undefined?{id:'M-1',tenantId:'TENANT-A',userId:'USR-1',status:'ACTIVE',roles:'["SALES"]',capabilities:'[]'}:overrides.membership;
  return new context.AtlasAuthorizationService({
    config:{mode:overrides.mode||'ENFORCED',tenantId:overrides.tenantId===undefined?'TENANT-A':overrides.tenantId},
    principals:{resolve(){if(principal instanceof Error)throw principal;return principal;}},
    identities:{findActive(provider,subject){return provider==='GOOGLE_WORKSPACE'&&subject==='operator@example.com'?{userId:'USR-1'}:undefined;}},
    users:{get(id){return overrides.user===undefined?{id,status:'ACTIVE'}:overrides.user;}},
    memberships:{findActive(tenant,user){return membership&&membership.tenantId===tenant&&membership.userId===user&&membership.status==='ACTIVE'?membership:undefined;}},
    entitlements:overrides.entitlements||{assertAllowed(){}},clock:()=>new Date('2026-08-10T12:00:00Z'),uuid:()=> '1234'
  });
}

let received;
assert.equal(fixture().execute('SALES_WRITE','createSalesActivity',ctx=>{received=ctx;return 'ok';}),'ok');
assert.equal(received.userId,'USR-1'); assert.equal(received.tenantId,'TENANT-A'); assert.equal(received.authoritative,true); assert.equal(Object.isFrozen(received),true);
assert.throws(()=>fixture({principal:null}).execute('SALES_WRITE','x',()=>{}),e=>e.code==='AUTHORIZATION_ERROR');
assert.throws(()=>fixture({principal:new context.VmosAuthorizationError()}).execute('SALES_WRITE','x',()=>{}),e=>e.code==='AUTHORIZATION_ERROR');
assert.throws(()=>fixture({tenantId:''}).execute('SALES_WRITE','x',()=>{}),e=>e.code==='AUTHORIZATION_ERROR');
assert.throws(()=>fixture({user:{id:'USR-1',status:'INACTIVE'}}).execute('SALES_WRITE','x',()=>{}),e=>e.code==='AUTHORIZATION_ERROR');
assert.throws(()=>fixture({membership:null}).execute('SALES_WRITE','x',()=>{}),e=>e.code==='AUTHORIZATION_ERROR');
assert.throws(()=>fixture().execute('FINANCE_WRITE','x',()=>{}),e=>e.code==='AUTHORIZATION_ERROR');
assert.throws(()=>fixture({membership:{id:'M-X',tenantId:'TENANT-B',userId:'USR-1',status:'ACTIVE',roles:'["ADMIN"]'}}).execute('CORE_RECORD_READ','x',()=>{}),e=>e.code==='AUTHORIZATION_ERROR');
assert.throws(()=>fixture({entitlements:{assertAllowed(){throw new context.VmosAuthorizationError();}}}).execute('SALES_WRITE','x',()=>{}),e=>e.code==='AUTHORIZATION_ERROR');
const repositoryFailure=fixture(); repositoryFailure.users={get(){throw new Error('sheet detail');}};
assert.throws(()=>repositoryFailure.execute('SALES_WRITE','x',()=>{}),e=>e.code==='AUTHORIZATION_ERROR'&&!/sheet detail/.test(e.message));

const resolver=new context.GoogleAppsScriptPrincipalResolver({session:{getActiveUser:()=>({getEmail:()=>''}),getEffectiveUser:()=>({getEmail:()=> 'deployer@example.com'})}});
assert.throws(()=>resolver.resolve(),e=>e.code==='AUTHORIZATION_ERROR','EffectiveUser must never impersonate the operator.');
const finance=fixture({membership:{id:'M-2',tenantId:'TENANT-A',userId:'USR-1',status:'ACTIVE',roles:'["FINANCE"]'}});
assert.equal(finance.execute('FINANCE_WRITE','recordCashReceipt',()=>true),true);
assert.throws(()=>finance.execute('ADMIN_IDENTITY','admin',()=>true),e=>e.code==='AUTHORIZATION_ERROR');

const validation=fixture({mode:'VALIDATION',principal:null});
context.getVmosAuditUser_=()=> 'legacy@example.com';
let validationContext;
assert.equal(validation.execute('SALES_WRITE','legacy',ctx=>{validationContext=ctx;return true;}),true);
assert.equal(validationContext.authoritative,false);
const disabled=fixture({mode:'DISABLED_FOR_DEVELOPMENT'}); let disabledContext;
disabled.execute('ADMIN_IDENTITY','dev',ctx=>{disabledContext=ctx;}); assert.equal(disabledContext.authoritative,false);

assert.deepEqual(Array.from(context.ATLAS_DEFAULT_ROLE_CAPABILITIES.SHOP_OPERATOR),['CORE_RECORD_READ','OPERATIONS_READ','SHOP_FLOOR_OPERATE']);
assert.ok(context.ATLAS_DEFAULT_ROLE_CAPABILITIES.ADMIN.includes('ADMIN_IDENTITY'));
assert.throws(()=>context.createTrustedSystemAuditContext_('CALENDAR_RECONCILIATION','ADMIN_IDENTITY'),e=>e.code==='AUTHORIZATION_ERROR');
assert.equal(context.ATLAS_IDENTITY_MAPPINGS.AtlasUser.sheetName,'AtlasUsers');
assert.deepEqual(Array.from(context.ATLAS_IDENTITY_MAPPINGS.TenantMembership.fields.roles),['Roles JSON']);
const duplicateIdentities=Object.create(context.ExternalIdentityReferenceRepository.prototype);
duplicateIdentities.list=()=>[{provider:'GOOGLE_WORKSPACE',subject:'operator@example.com',status:'ACTIVE'},{provider:'GOOGLE_WORKSPACE',subject:'operator@example.com',status:'ACTIVE'}];
assert.throws(()=>duplicateIdentities.findActive('GOOGLE_WORKSPACE','operator@example.com'),e=>e.code==='AUTHORIZATION_ERROR');

const started=process.hrtime.bigint();
for(let index=0;index<1000;index+=1)fixture().execute('SALES_WRITE','performanceCheck',()=>true);
const elapsedMs=Number(process.hrtime.bigint()-started)/1e6;
assert.ok(elapsedMs<1000,'In-memory authorization characterization should remain lightweight.');

console.log('Atlas identity, membership, capability, fail-closed, and AuditContext tests passed; 1000-check characterization:',elapsedMs.toFixed(2),'ms');
