const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
let profileValue='';
function VmosConfigurationError_(message){this.message=message;}
const context={Object,Array,String,JSON,VmosConfigurationError_,PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='ATLAS_DEPLOYMENT_PROFILE'?profileValue:''})}};
vm.createContext(context);
['ConfigNavigation.gs','Services/NavigationService.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context,{filename:file}));

let profile=context.getAtlasDeploymentProfile_();
assert.equal(profile.productDisplayName,'Atlas');
assert.equal(profile.organizationName,'');
assert.deepEqual(Array.from(profile.enabledModules),[]);

profileValue=JSON.stringify({productDisplayName:'VMOS',organizationName:'Vitality Manufacturing',deploymentDisplayName:'Production',enabledModules:['firearms']});
profile=context.getAtlasDeploymentProfile_();
assert.equal(profile.productDisplayName,'VMOS');
assert.equal(profile.organizationName,'Vitality Manufacturing');
assert.deepEqual(Array.from(profile.enabledModules),['FIREARMS']);

const service=new context.AtlasNavigationService_({profile});
const sales=service.getModel({capabilities:['CORE_RECORD_READ','SALES_READ','FOLLOWUP_READ','RFQ_READ']},'sales');
const salesIds=Array.from(sales.groups).flatMap(group=>Array.from(group.items).map(item=>item.id));
assert(salesIds.includes('customers'));
assert(salesIds.includes('sales-activity'));
assert(salesIds.includes('follow-ups'));
assert(!salesIds.includes('jobs'));
assert(!salesIds.includes('invoices'));
assert.equal(sales.currentRoute,'sales-activity');
assert(!salesIds.some(id=>/firearms|coatings/i.test(id)),'Enabled modules must not invent unsupported production routes.');

const operator=service.getModel({capabilities:['OPERATIONS_READ','SHOP_FLOOR_OPERATE']},'shop');
const operatorIds=Array.from(operator.groups).flatMap(group=>Array.from(group.items).map(item=>item.id));
assert(operatorIds.includes('jobs')&&operatorIds.includes('shop-floor')&&operatorIds.includes('operations-dashboard'));
assert(!operatorIds.includes('customers'));

const financeModel=service.getModel({capabilities:['CORE_RECORD_READ','FINANCE_READ','FINANCE_WRITE','PURCHASE_REQUEST']},'home');
const financeIds=Array.from(financeModel.groups).flatMap(group=>Array.from(group.items).map(item=>item.id));
assert(financeIds.includes('customers')&&financeIds.includes('invoices'));
assert(!financeIds.includes('sales-activity')&&!financeIds.includes('shop-floor'));

const admin=service.getModel({capabilities:['CORE_RECORD_READ','SALES_READ','FOLLOWUP_READ','RFQ_READ','OPERATIONS_READ','FINANCE_READ','ADMIN_CONFIG']},'home');
const adminIds=Array.from(admin.groups).flatMap(group=>Array.from(group.items).map(item=>item.id));
['customers','sales-activity','follow-ups','rfqs','quotes','jobs','shop-floor','operations-dashboard','invoices','ideas'].forEach(id=>assert(adminIds.includes(id),'authorized Owner/Admin navigation includes '+id));
assert.equal(admin.accessState,'READY');
const noCapabilities=service.getModel({capabilities:[]},'home');
assert.deepEqual(Array.from(noCapabilities.groups).flatMap(group=>Array.from(group.items).map(item=>item.id)),['home']);
assert.equal(noCapabilities.accessState,'LIMITED_ACCESS','empty trusted capability context is explained, not elevated');

assert.equal(context.resolveAtlasRoute_({parameter:{sales:'1'}}),'sales-activity');
assert.equal(context.resolveAtlasRoute_({parameter:{calendar:'1'}}),'follow-ups');
assert.equal(context.resolveAtlasRoute_({parameter:{route:'jobs'}}),'jobs');
assert.equal(context.atlasRouteTemplate_('customers'),'CommercialWorkflow');
assert.equal(context.atlasRouteTemplate_('rfqs'),'CommercialWorkflow');
assert.equal(context.atlasRouteTemplate_('quotes'),'CommercialWorkflow');
assert.equal(context.atlasRouteTemplate_('jobs'),'CommercialWorkflow');
assert.equal(context.atlasRouteTemplate_('invoices'),'CommercialWorkflow');
assert.equal(context.atlasRouteTemplate_('follow-ups'),'CalendarFollowUps');
assert.equal(context.atlasRouteTemplate_('unknown'),'UnsupportedRoute');
assert.equal(context.atlasRouteAvailability_('unknown',{enabledModules:[]}).state,'UNKNOWN');
assert.equal(context.atlasRouteAvailability_('firearms',{enabledModules:[]}).state,'MODULE_DISABLED');

const code=fs.readFileSync(path.join(base,'UI','Code.gs'),'utf8');
const frame=fs.readFileSync(path.join(base,'UI','NavigationFrame.html'),'utf8');
const index=fs.readFileSync(path.join(base,'UI','Index.html'),'utf8');
const registry=fs.readFileSync(path.join(base,'Services','EndpointAuthorizationRegistry.gs'),'utf8');
assert.match(code,/resolveAtlasRoute_\(e\)/);
assert.match(code,/function getAtlasNavigation/);
assert.match(registry,/getAtlasNavigation:\{kind:'READ',capability:null\}/);
assert.doesNotMatch(frame,/getMvpBootstrap/,'Navigation must not load business data.');
assert.match(frame,/@media\(max-width:600px\)/);
assert.match(frame,/:focus-visible/);
assert.match(frame,/min-height:44px/);
assert.match(frame,/aria-current/);
assert.match(frame,/popstate/);
assert.match(frame,/location\.reload\(\)/,'History restoration reloads the bounded route and revalidates authorization.');
assert.match(index,/aria-expanded/);
assert.match(index,/getAtlasNavigation\(requestedRoute\)/);
assert.doesNotMatch(index,/VITALITY MANUFACTURING OPERATING SYSTEM/);
console.log('Atlas information architecture and navigation tests passed');
