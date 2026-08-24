const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..','appscript','src'),read=file=>fs.readFileSync(path.join(root,file),'utf8');

const shell=read('UI/NavigationFrame.html'),code=read('UI/Code.gs'),routeError=read('UI/RouteError.html');
assert.match(shell,/target="_top"/,'fallback navigation owns the top-level route');
assert.match(shell,/link\.target='_top'/,'server-resolved navigation owns the top-level route');
assert.match(shell,/atlasShowRouteState\('Opening /,'a visible state is established synchronously on navigation');
assert.match(shell,/taking longer than expected/,'delayed navigation has a bounded visible state');
assert.match(shell,/withFailureHandler\(function\(\)\{atlasApplyProfile[\s\S]*Navigation unavailable/,'navigation failure is visible');
assert.match(shell,/unhandledrejection/,'unhandled asynchronous failures reach the shared recovery boundary');
assert.match(shell,/window\.addEventListener\('error'/,'client initialization failures reach the shared recovery boundary');
assert.match(shell,/popstate[\s\S]*Restoring workspace/,'history navigation establishes a visible state before reload');
assert.match(shell,/min-width:44px;min-height:44px/,'shared retry meets the touch-target contract');
assert.match(shell,/aria-live="polite"/,'shared status is announced');
assert.doesNotMatch(shell,/getMvpBootstrap|setInterval/,'the shared route boundary adds no giant bootstrap or polling');

assert.match(code,/try \{[\s\S]*view\.evaluate\(\)[\s\S]*catch \(ignored\)/,'template evaluation has a safe server boundary');
assert.match(code,/createTemplateFromFile\('UI\/RouteError'\)/,'template failures select the recovery template');
['Workspace unavailable','Retry','Mission Control','role="alert"','min-height:44px'].forEach(value=>assert(routeError.includes(value),value));
assert.doesNotMatch(routeError,/stack|TenantID|UserID|MembershipID|capabilit(y|ies)|session ID/i,'recovery page exposes no protected diagnostics');

const exposedTemplates=['Index','Ideas','MyWork','CommercialWorkflow','SalesActivity','CalendarFollowUps','QuoteBuilder','DailyProductionBoard','ShopFloor','OperationsDashboard','FloorBoard','PurchasingWorkspace','VendorWorkspace','FirearmsWorkspace','AdminSettings','PlatformCommercial'];
exposedTemplates.forEach(template=>{const html=read('UI/'+template+'.html');assert.match(html,/<(?:main|body)\b/i,template+' establishes visible document content synchronously');assert.match(html,/<h1\b|Loading|Unavailable|not available/i,template+' has an initial visible state');});
const routeMap=read('Services/NavigationService.gs');exposedTemplates.forEach(template=>assert(routeMap.includes("'"+template+"'")||routeMap.includes(":"+template),template+' is represented in route resolution'));

const lifecycle={
  'UI/CommercialWorkflow.html':['Loading records','workflowFailure','Directory unavailable','Retry','loadGeneration','sessionExpired'],
  'UI/AdminSettings.html':['Loading tenant administration','adminFailure','Administration unavailable','Retry','sessionExpired'],
  'UI/DailyProductionBoard.html':['Loading committed Work Orders','boardUnavailable','Board unavailable','Retry','sessionExpired'],
  'UI/OperationsDashboard.html':['Loading…','dashboardFailure','Operations unavailable','Retry','sessionExpired'],
  'UI/FloorBoard.html':['Loading current state','Floor Board unavailable','Retry','last known board'],
  'UI/PurchasingWorkspace.html':['Loading purchasing','Purchasing unavailable','Retry','sessionExpired'],
  'UI/JobCanvas.html':['Loading Work Order context','rootFailure','Work Order unavailable','Retry','SESSION_EXPIRED'],
  'UI/MyWork.html':['Loading your work','Retry','sessionExpired','generation']
};
Object.keys(lifecycle).forEach(file=>{const html=read(file);lifecycle[file].forEach(value=>assert(html.includes(value),file+' includes '+value));});
['UI/NavigationFrame.html'].concat(Object.keys(lifecycle)).forEach(file=>{const html=read(file),scripts=Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g));assert(scripts.length,file+' has executable client script');scripts.forEach(script=>assert.doesNotThrow(()=>new Function(script[1]),file+' client script parses'));});
assert.match(read('UI/SalesActivity.html'),/<base target="_top">/,'Sales Activity no longer depends on iframe-default routing');
assert.match(read('UI/UnsupportedRoute.html'),/not available|unavailable|unsupported/i,'unsupported routes remain visible');
assert.match(read('UI/AccessUnavailable.html'),/access|unavailable/i,'access denial remains visible');

// Prove template evaluation failure returns a safe Atlas page without changing
// the strict entry decision or exposing the thrown server detail.
let calls=[];
const context=vm.createContext({
  Object,Array,String,Number,Math,Date,JSON,Error,console,
  AtlasEntryRoutingService_:function(){this.resolve=()=>({state:'AUTHORIZED',route:'customers',returnRoute:'home'});},
  resolveAtlasRoute_:()=> 'customers',getAtlasDeploymentProfile_:()=>({enabledModules:[]}),
  atlasRouteAvailability_:()=>({state:'AVAILABLE',message:''}),atlasRouteTemplate_:()=> 'CommercialWorkflow',
  resolveAtlasCommercialRecordId_:()=> '',atlasRouteTitle_:()=> 'Customers',
  HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createTemplateFromFile(name){calls.push(name);return {evaluate(){if(name==='UI/CommercialWorkflow')throw new Error('Sensitive template detail');return {setTitle(){return this;},setXFrameOptionsMode(){return this;}};}};}}
});
vm.runInContext(code,context,{filename:'Code.gs'});
context.doGet({parameter:{route:'customers'}});
assert.deepEqual(calls,['UI/CommercialWorkflow','UI/RouteError']);

console.log('ACTIVATION-V1-R6 route recovery and blank-page prevention tests passed');
