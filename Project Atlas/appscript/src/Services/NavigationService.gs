var ATLAS_ROUTE_REGISTRY=[
  {id:'home',group:'HOME',label:'Command Center',description:'Attention, blocked work, and operational exceptions.',href:'?route=home',capabilities:[]},
  {id:'customers',group:'CRM',label:'Customers',description:'Customer records and relationships.',href:'?route=customers',capabilities:['CORE_RECORD_READ']},
  {id:'sales-activity',group:'CRM',label:'Sales Activity',description:'Log customer activity and next actions.',href:'?route=sales-activity',capabilities:['SALES_READ']},
  {id:'follow-ups',group:'CRM',label:'Follow-Ups',description:'Due, upcoming, and scheduled follow-ups.',href:'?route=follow-ups',capabilities:['FOLLOWUP_READ']},
  {id:'rfqs',group:'COMMERCIAL',label:'RFQs',description:'Customer requests for quotation.',href:'?route=rfqs',capabilities:['RFQ_READ']},
  {id:'quotes',group:'COMMERCIAL',label:'Quotes',description:'Quote preparation and lifecycle.',href:'?route=quotes',capabilities:['RFQ_READ']},
  {id:'jobs',group:'OPERATIONS',label:'Jobs / Work Orders',description:'Current production jobs and work orders.',href:'?route=jobs',capabilities:['OPERATIONS_READ']},
  {id:'shop-floor',group:'OPERATIONS',label:'Shop Floor',description:'Current work and immediate operator actions.',href:'?route=shop-floor',capabilities:['OPERATIONS_READ']},
  {id:'operations-dashboard',group:'OPERATIONS',label:'Operations Dashboard',description:'Blocked work, workload, and shop attention.',href:'?route=operations-dashboard',capabilities:['OPERATIONS_READ']},
  {id:'floor-board',group:'OPERATIONS',label:'Floor Board',description:'Large-format current production state.',href:'?route=floor-board',capabilities:['OPERATIONS_READ']},
  {id:'invoices',group:'FINANCE',label:'Invoices',description:'Invoice records and status.',href:'?route=invoices',capabilities:['FINANCE_READ']},
  {id:'ideas',group:'HOME',label:'Ideas',description:'Future opportunities outside operational work.',href:'?route=ideas',capabilities:['CORE_RECORD_READ']}
];
var ATLAS_ROUTE_GROUPS=['HOME','CRM','COMMERCIAL','OPERATIONS','PURCHASING','FINANCE','DOCUMENTS','SPECIALTY MODULES','ADMIN / SETTINGS'];
var ATLAS_LEGACY_ROUTE_ALIASES={sales:'sales-activity',ideas:'ideas',dashboard:'operations-dashboard',shop:'shop-floor',calendar:'follow-ups',traveler:'traveler'};

function AtlasNavigationService_(dependencies){dependencies=dependencies||{};this.profile=dependencies.profile||getAtlasDeploymentProfile_();this.registry=dependencies.registry||ATLAS_ROUTE_REGISTRY;}
AtlasNavigationService_.prototype.getModel=function(context,currentRoute){
  var capabilities=(context&&context.capabilities)||[],routes=this.registry.filter(function(route){return !route.capabilities.length||route.capabilities.some(function(capability){return capabilities.indexOf(capability)!==-1;});});
  var groups=ATLAS_ROUTE_GROUPS.map(function(group){return {id:group,label:group,items:routes.filter(function(route){return route.group===group;}).map(atlasNavigationRoute_)};}).filter(function(group){return group.items.length;});
  return {profile:this.profile,currentRoute:normalizeAtlasRoute_(currentRoute),groups:groups,shortcuts:routes.filter(function(route){return ['sales-activity','follow-ups','jobs','shop-floor','operations-dashboard'].indexOf(route.id)!==-1;}).map(atlasNavigationRoute_),enabledModules:this.profile.enabledModules.slice(),accessState:capabilities.length?'READY':'LIMITED_ACCESS'};
};
function atlasNavigationRoute_(route){return {id:route.id,label:route.label,description:route.description,href:route.href};}
function normalizeAtlasRoute_(value){var route=String(value||'home').trim().toLowerCase();return ATLAS_LEGACY_ROUTE_ALIASES[route]||route||'home';}
function resolveAtlasRoute_(event){event=event||{};var parameters=event.parameter||{},route=normalizeAtlasRoute_(parameters.route);Object.keys(ATLAS_LEGACY_ROUTE_ALIASES).some(function(alias){if(String(parameters[alias]||'')==='1'||(alias==='traveler'&&parameters[alias])){route=ATLAS_LEGACY_ROUTE_ALIASES[alias];return true;}return false;});return route;}
function atlasRouteTemplate_(route){return {home:'Index',customers:'Index',rfqs:'Index',quotes:'Index',jobs:'Index',invoices:'Index','sales-activity':'SalesActivity','follow-ups':'CalendarFollowUps','shop-floor':'ShopFloor','operations-dashboard':'OperationsDashboard','floor-board':'FloorBoard',ideas:'Ideas',traveler:'Traveler'}[normalizeAtlasRoute_(route)]||'Index';}
function atlasRouteTitle_(route){var normalized=normalizeAtlasRoute_(route),found=ATLAS_ROUTE_REGISTRY.filter(function(item){return item.id===normalized;})[0];return (found?found.label:'Command Center')+' - Atlas';}
