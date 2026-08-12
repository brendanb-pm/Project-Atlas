const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const stores={Customer:[],RFQ:[],Quote:[],Job:[],Invoice:[]};
function Authorization(message){this.message=message;}function Missing(message){this.message=message;}
function service(type){return {list:()=>stores[type].slice(),get:id=>{const row=stores[type].find(item=>item.id===id);if(!row)throw new Missing('Record was not found.');return row;},listByField:(field,value,limit)=>stores[type].filter(item=>item[field]===value).slice(0,limit),findFirstByField:(field,value)=>stores[type].find(item=>item[field]===value)||null};}
const context=vm.createContext({Math,Number,String,Object,Array,JSON,VmosAuthorizationError_:Authorization,VmosNotFoundError_:Missing,serializeVmosValue_:value=>JSON.parse(JSON.stringify(value)),MvpService_:function(){}});
vm.runInContext(fs.readFileSync(path.join(base,'Services','CommercialWorkflowService.gs'),'utf8'),context);
const tenantA={tenantId:'TENANT-A',userId:'USER-A',capabilities:[]};
['Customer','RFQ','Quote','Job','Invoice'].forEach((type,index)=>{
  stores[type].push({id:type+'-A',name:'Tenant A',customerId:'Customer-A',rfqId:'RFQ-A',quoteId:'Quote-A',jobId:'Job-A',securityTenantId:'TENANT-A'});
  stores[type].push({id:type+'-B',name:'Tenant B',customerId:'Customer-A',rfqId:'RFQ-A',quoteId:'Quote-A',jobId:'Job-A',securityTenantId:'TENANT-B'});
  stores[type].push({id:type+'-LEGACY',name:'Unscoped legacy',customerId:'Customer-A',rfqId:'RFQ-A',quoteId:'Quote-A',jobId:'Job-A'});
});
const deps={customers:service('Customer'),rfqs:service('RFQ'),quotes:service('Quote'),jobs:service('Job'),invoices:service('Invoice'),limit:50};
const workflow=new context.CommercialWorkflowService_(deps);
const routes={Customer:'customers',RFQ:'rfqs',Quote:'quotes',Job:'jobs',Invoice:'invoices'};
Object.keys(routes).forEach(type=>{
  const result=workflow.get({route:routes[type],tenantId:'TENANT-B'},tenantA);
  assert.deepEqual(result.directory.items.map(item=>item.id),[type+'-A'],type+' directory is scoped by trusted context');
  assert.throws(()=>workflow.get({route:routes[type],id:type+'-B'},tenantA),error=>/unavailable/.test(error.message),type+' foreign selection is denied');
  assert.throws(()=>workflow.get({route:routes[type],id:type+'-LEGACY'},tenantA),error=>/unavailable/.test(error.message),type+' unscoped legacy selection is denied');
});
const customer=workflow.get({route:'customers',id:'Customer-A'},tenantA);
['rfqs','quotes','jobs','invoices'].forEach(key=>assert.deepEqual(customer.related[key].map(item=>item.id),[{rfqs:'RFQ',quotes:'Quote',jobs:'Job',invoices:'Invoice'}[key]+'-A'],key+' related rows are tenant scoped'));

const index=fs.readFileSync(path.join(base,'UI','Index.html'),'utf8');
assert.match(index,/const routeSections=\{home:'CommandCenter'\}/,'commercial routes are not intercepted by the legacy shell');
['customers','rfqs','quotes','jobs','invoices'].forEach(route=>assert.match(index,new RegExp("'"+route+"'"),'commercial route '+route+' is handled contextually'));
assert.match(index,/window\.location\.href='\?route='/,'commercial clicks perform canonical route navigation');
assert.match(index,/function openWorkspaceRoute\(route\)\{window\.location\.href=/,'Command Center attention links use routed workspaces');
assert.equal((index.match(/\.getMvpBootstrap\(\)/g)||[]).length,1,'legacy compatibility remains but normal commercial navigation does not call it');
assert.match(index,/\.menu-toggle\{min-width:44px;min-height:44px/,'mobile menu has a real 44 by 44 CSS pixel target');
const selectSource=(index.match(/function selectSection[\s\S]*?(?=\nfunction loadNavigation)/)||[])[0];
['customers','rfqs','quotes','jobs','invoices'].forEach(route=>{const clickContext=vm.createContext({window:{location:{href:''}}});vm.runInContext(selectSource,clickContext);clickContext.selectSection('LegacyEntity',route);assert.equal(clickContext.window.location.href,'?route='+route,route+' click navigates to the contextual route before any legacy-shell work');});

const adminHtml=fs.readFileSync(path.join(base,'UI','AdminSettings.html'),'utf8');
assert.doesNotMatch(adminHtml,/prompt\(/,'normal membership role changes do not require typed role names');
assert.match(adminHtml,/type="checkbox" name="tenant-role"/,'configured roles render as accessible native selectors');
assert.match(adminHtml,/<fieldset class="role-fieldset"/);assert.match(adminHtml,/<legend>Assigned tenant roles<\/legend>/);
assert.match(adminHtml,/ops\.approvedRoles\.map/);assert.match(adminHtml,/input\[name=tenant-role\]:checked/);

const adminContext=vm.createContext({Date,Math,Number,String,Object,Array,JSON,Utilities:{getUuid:()=> 'UUID'},VmosValidationError_:function(message){this.message=message;},VmosAuthorizationError_:Authorization,VmosNotFoundError_:Missing,parseIdentityList_:value=>Array.isArray(value)?value:JSON.parse(value||'[]'),ATLAS_DEFAULT_ROLE_CAPABILITIES:{ADMIN:[],SALES:[],PLATFORM_OWNER:[]},serializeVmosValue_:value=>JSON.parse(JSON.stringify(value))});
vm.runInContext(fs.readFileSync(path.join(base,'Services','TenantOperationalAdminService.gs'),'utf8'),adminContext);
const rows={users:[{id:'U-1',displayName:'Admin'}],memberships:[{id:'M-1',tenantId:'TENANT-A',userId:'U-1',roles:'["ADMIN"]'}]};
const repo=list=>({list:()=>list,get:id=>list.find(row=>row.id===id),update:(id,changes)=>Object.assign(list.find(row=>row.id===id),changes)});
const admin=new adminContext.TenantOperationalAdminService_({users:repo(rows.users),memberships:repo(rows.memberships),invitations:{listForTenant:()=>[]}});
assert.deepEqual(admin.workspace(tenantA).approvedRoles,['ADMIN','SALES'],'PLATFORM roles are not offered');
assert.throws(()=>admin.updateMembership('M-1',{roles:['PLATFORM_OWNER']},tenantA),error=>/approved tenant roles/.test(error.message),'manual role injection remains denied server-side');
console.log('MOS-122H-R tenant isolation, contextual routing, role selector, and mobile touch regressions passed');
