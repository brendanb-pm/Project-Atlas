const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..','appscript','src'),read=file=>fs.readFileSync(path.join(root,file),'utf8');

function scenario(overrides){
  overrides=overrides||{};
  let createdView;
  const context=vm.createContext({
    console,Object,Array,String,Number,Math,Date,JSON,Error,
    VmosAuthorizationError_:function(message){this.message=message;this.code='AUTHORIZATION_ERROR';},
    VmosConfigurationError_:Error,
    getAtlasIdentityConfig_:()=>({mode:'VALIDATION',tenantId:'T1'}),
    getAtlasDeploymentProfile_:()=>({enabledModules:[],organizationName:'Tenant One'}),
    GoogleAppsScriptPrincipalResolver_:function(){this.resolve=()=>{if(overrides.missingPrincipal)throw new Error('missing');return {type:'GOOGLE_WORKSPACE',subject:'operator@example.com',verified:true};};},
    ExternalIdentityReferenceRepository_:function(){this.findActive=()=>{if(overrides.repositoryFailure)throw new Error('Sensitive worksheet detail');return overrides.unmapped?null:{userId:'U1'};};},
    AtlasUserRepository_:function(){this.get=()=>overrides.inactiveUser?{id:'U1',status:'INACTIVE'}:{id:'U1',status:'ACTIVE'};},
    TenantMembershipRepository_:function(){this.findActive=()=>overrides.noMembership?null:{tenantId:'T1',userId:'U1',status:'ACTIVE',roles:'["MANAGER"]',capabilities:'[]'};},
    CommercialEntitlementService_:function(){this.assertAllowed=()=>{if(overrides.entitlementDenied)throw new Error('denied');};},
    AtlasAuthorizationService_:function(){this.capabilitiesFor_=()=>Object.prototype.hasOwnProperty.call(overrides,'capabilities')?overrides.capabilities:['CORE_RECORD_READ','SALES_READ','RFQ_READ','OPERATIONS_READ','FINANCE_READ','ADMIN_CONFIG'];},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
    HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createTemplateFromFile(name){createdView={name,evaluate(){return {setTitle(){return this;},setXFrameOptionsMode(){return this;}};}};return createdView;}}
  });
  ['ConfigNavigation.gs','Services/NavigationService.gs','UI/Code.gs'].forEach(file=>vm.runInContext(read(file),context,{filename:file}));
  return {context,get view(){return createdView;}};
}

function open(overrides,route,id){const fixture=scenario(overrides);fixture.context.doGet({parameter:{route:route||'home',id:id||''}});return fixture.view;}

assert.equal(open({missingPrincipal:true},'home').name,'UI/SignIn','unauthenticated root never selects Mission Control');
['customers','quotes','invoices','jobs','my-work','admin'].forEach(route=>{
  const view=open({missingPrincipal:true},route,'FOREIGN-RECORD');
  assert.equal(view.name,'UI/SignIn',route+' is protected');
  assert.equal(view.atlasIntendedRoute,route,'safe route is retained');
  assert.equal(view.atlasRequestedRecordId,'','record identifiers are discarded before authorization');
});
assert.equal(open({unmapped:true},'home').name,'UI/AccessUnavailable');
assert.equal(open({inactiveUser:true},'home').name,'UI/AccessUnavailable');
assert.equal(open({noMembership:true},'home').name,'UI/AccessUnavailable');
assert.equal(open({entitlementDenied:true},'home').name,'UI/AccessUnavailable');
assert.equal(open({repositoryFailure:true},'home').name,'UI/AccessUnavailable','identity storage failure remains fail-closed and operator-safe');
assert.equal(open({capabilities:[]},'home').name,'UI/AccessUnavailable','zero-capability user receives limited-access guidance');
assert.equal(open({capabilities:['CORE_RECORD_READ']},'admin').name,'UI/AccessUnavailable','capability-limited user is not treated as anonymous');
assert.equal(open({},'customers').name,'UI/CommercialWorkflow','mapped active Workspace principal reaches an authorized route in VALIDATION');
assert.equal(open({},'home').name,'UI/Index','owner/manager lands on Mission Control');
assert.equal(open({capabilities:['OPERATIONS_READ','SHOP_FLOOR_OPERATE']},'home').name,'UI/ShopFloor','persona landing remains capability-derived');
assert.equal(open({missingPrincipal:true},'sign-in').name,'UI/SignIn','Sign In remains public');
assert.equal(open({missingPrincipal:true},'auth-callback').name,'UI/AuthCallback','OIDC callback remains public');

const code=read('UI/Code.gs'),navigation=read('Services/NavigationService.gs'),signIn=read('UI/SignIn.html'),unavailable=read('UI/AccessUnavailable.html');
assert.match(code,/new AtlasEntryRoutingService_\(\)\.resolve/);
assert.doesNotMatch(navigation,/VALIDATION_UNENFORCED|\.execute\(/,'entry resolver cannot invoke permissive VALIDATION execution');
assert.match(signIn,/serverReturnRoute/);
assert.match(signIn,/\^\[a-z0-9-\]\+\$/,'intended route remains a bounded route token');
assert.doesNotMatch(unavailable,/TenantID|capabilit(y|ies)|membership resolver|issuer|subject|AtlasAuthSession/,'public unavailable state hides security internals');

// Browser callables must remain strict after entry. VALIDATION still supports
// explicit non-callable diagnostics, but cannot downgrade a read or mutation to
// legacy identity when membership/session authority disappears mid-request.
const authorizationContext=vm.createContext({console,Date,JSON,String,Number,Math,Object,Array,Error,Utilities:{getUuid:()=> 'UUID'},VmosError_:function(message,code){this.message=message;this.code=code;},getAtlasIdentityConfig_:()=>({mode:'VALIDATION',tenantId:'T1'}),AtlasUserRepository_:function(){},TenantMembershipRepository_:function(){},ExternalIdentityReferenceRepository_:function(){},GoogleAppsScriptPrincipalResolver_:function(){},CommercialEntitlementService_:function(){},getVmosAuditUser_:()=> 'legacy'});
authorizationContext.VmosError_.prototype=Object.create(Error.prototype);
vm.runInContext(read('Services/IdentityAuthorizationService.gs'),authorizationContext,{filename:'IdentityAuthorizationService.gs'});
function deniedService(){return new authorizationContext.AtlasAuthorizationService_({config:{mode:'VALIDATION',tenantId:'T1'},principals:{resolve(){throw new authorizationContext.VmosAuthorizationError_('expired');}},users:{},memberships:{},identities:{},entitlements:{},uuid:()=> 'UUID'});}
['protectedRead','protectedMutation'].forEach((operation,index)=>{let ran=false;assert.throws(()=>deniedService().execute('CORE_RECORD_READ',operation,()=>{ran=true;},{strictAuthorization:true,auditRequired:index===1}),error=>error.code==='AUTHORIZATION_ERROR');assert.equal(ran,false,operation+' must not run with legacy context');});
const allowedService=new authorizationContext.AtlasAuthorizationService_({config:{mode:'VALIDATION',tenantId:'T1'},principals:{resolve:()=>({type:'GOOGLE_WORKSPACE',subject:'operator@example.com',verified:true})},identities:{findActive:()=>({userId:'U1'})},users:{get:()=>({id:'U1',status:'ACTIVE'})},memberships:{findActive:()=>({tenantId:'T1',userId:'U1',status:'ACTIVE',roles:'[]',capabilities:'["CORE_RECORD_READ"]'})},entitlements:{assertAllowed(){}},uuid:()=> 'UUID'});
assert.equal(allowedService.execute('CORE_RECORD_READ','protectedRead',context=>context.authoritative,{strictAuthorization:true}),true,'mapped Workspace validation principal remains authoritative');
const endpointRegistry=read('Services/EndpointAuthorizationRegistry.gs');
assert.match(endpointRegistry,/operationOptions\.strictAuthorization=true/,'every classified browser callable requests strict authorization');
console.log('ACTIVATION-V1-R5 strict entry-routing tests passed');
