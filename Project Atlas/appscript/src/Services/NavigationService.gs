var ATLAS_ROUTE_REGISTRY=[
  {id:'home',group:'HOME',label:'Command Center',description:'Attention, blocked work, and operational exceptions.',href:'?route=home',capabilities:[]},
  {id:'customers',group:'CRM',label:'Customers',description:'Customer records and relationships.',href:'?route=customers',capabilities:['CORE_RECORD_READ']},
  {id:'sales-activity',group:'CRM',label:'Sales Activity',description:'Log customer activity and next actions.',href:'?route=sales-activity',capabilities:['SALES_READ']},
  {id:'follow-ups',group:'CRM',label:'Follow-Ups',description:'Due, upcoming, and scheduled follow-ups.',href:'?route=follow-ups',capabilities:['FOLLOWUP_READ']},
  {id:'rfqs',group:'COMMERCIAL',label:'RFQs',description:'Customer requests for quotation.',href:'?route=rfqs',capabilities:['RFQ_READ']},
  {id:'quotes',group:'COMMERCIAL',label:'Quotes',description:'Quote preparation and lifecycle.',href:'?route=quotes',capabilities:['RFQ_READ']},
  {id:'quote-builder',group:'COMMERCIAL',label:'Quote Builder',description:'Customer pricing, internal costing, suppliers, and lifecycle.',href:'?route=quote-builder',capabilities:['QUOTE_WRITE']},
  {id:'jobs',group:'OPERATIONS',label:'Jobs / Work Orders',description:'Current production jobs and work orders.',href:'?route=jobs',capabilities:['OPERATIONS_READ']},
  {id:'daily-production',group:'OPERATIONS',label:'Daily Production',description:'Committed Work Orders by due date, ownership, readiness, and blocker.',href:'?route=daily-production',capabilities:['OPERATIONS_READ']},
  {id:'shop-floor',group:'OPERATIONS',label:'Shop Floor',description:'Current work and immediate operator actions.',href:'?route=shop-floor',capabilities:['OPERATIONS_READ']},
  {id:'operations-dashboard',group:'OPERATIONS',label:'Operations Dashboard',description:'Blocked work, workload, and shop attention.',href:'?route=operations-dashboard',capabilities:['OPERATIONS_READ']},
  {id:'floor-board',group:'OPERATIONS',label:'Floor Board',description:'Large-format current production state.',href:'?route=floor-board',capabilities:['OPERATIONS_READ']},
  {id:'invoices',group:'FINANCE',label:'Invoices',description:'Invoice records and status.',href:'?route=invoices',capabilities:['FINANCE_READ']},
  {id:'purchasing',group:'PURCHASING',label:'Purchasing',description:'Purchase requests, approvals, and receipts.',href:'?route=purchasing',capabilities:['PURCHASE_REQUEST','PURCHASE_APPROVE']},
  {id:'vendors',group:'PURCHASING',label:'Vendors',description:'Supplier and service-provider directory.',href:'?route=vendors',capabilities:['QUOTE_COST_READ']},
  {id:'firearms',group:'SPECIALTY MODULES',label:'Serialized Firearms',description:'Serialized-item intake, custody, work, disposition, and reconciliation.',href:'?route=firearms',capabilities:['FIREARMS_READ'],module:'FIREARMS'},
  {id:'ideas',group:'HOME',label:'Ideas',description:'Future opportunities outside operational work.',href:'?route=ideas',capabilities:['CORE_RECORD_READ']}
  ,{id:'admin',group:'ADMIN / SETTINGS',label:'Admin / Settings',description:'Tenant configuration, access, integrations, and health.',href:'?route=admin',capabilities:['ADMIN_CONFIG','ADMIN_IDENTITY']}
  ,{id:'platform-commercial',group:'ADMIN / SETTINGS',label:'Platform Administration',description:'Cross-tenant subscription, seat, module, and billing attention.',href:'?route=platform-commercial',capabilities:['PLATFORM_TENANT_READ']}
];
var ATLAS_ROUTE_GROUPS=['HOME','CRM','COMMERCIAL','OPERATIONS','PURCHASING','FINANCE','DOCUMENTS','SPECIALTY MODULES','ADMIN / SETTINGS'];
var ATLAS_LEGACY_ROUTE_ALIASES={sales:'sales-activity',ideas:'ideas',dashboard:'operations-dashboard',shop:'shop-floor',calendar:'follow-ups',traveler:'traveler'};

function AtlasNavigationService_(dependencies){dependencies=dependencies||{};this.profile=dependencies.profile||getAtlasDeploymentProfile_();this.registry=dependencies.registry||ATLAS_ROUTE_REGISTRY;}
AtlasNavigationService_.prototype.getModel=function(context,currentRoute){
  var capabilities=(context&&context.capabilities)||[],enabled=this.profile.enabledModules||[],routes=this.registry.filter(function(route){if(route.module&&enabled.indexOf(route.module)===-1)return false;return !route.capabilities.length||route.capabilities.some(function(capability){return capabilities.indexOf(capability)!==-1;});});
  var groups=ATLAS_ROUTE_GROUPS.map(function(group){return {id:group,label:group,items:routes.filter(function(route){return route.group===group;}).map(atlasNavigationRoute_)};}).filter(function(group){return group.items.length;});
  return {profile:this.profile,currentRoute:normalizeAtlasRoute_(currentRoute),groups:groups,shortcuts:routes.filter(function(route){return ['sales-activity','follow-ups','jobs','shop-floor','operations-dashboard'].indexOf(route.id)!==-1;}).map(atlasNavigationRoute_),enabledModules:this.profile.enabledModules.slice(),accessState:capabilities.length?'READY':'LIMITED_ACCESS'};
};
function atlasNavigationRoute_(route){return {id:route.id,label:route.label,description:route.description,href:route.href};}
function normalizeAtlasRoute_(value){var route=String(value||'home').trim().toLowerCase();return ATLAS_LEGACY_ROUTE_ALIASES[route]||route||'home';}
function atlasRouteDefinition_(route){var normalized=normalizeAtlasRoute_(route);return ATLAS_ROUTE_REGISTRY.filter(function(item){return item.id===normalized;})[0]||({'sign-in':{id:'sign-in'},'auth-callback':{id:'auth-callback'},traveler:{id:'traveler'}}[normalized]||null);}
function atlasRouteAvailability_(route,profile){var definition=atlasRouteDefinition_(route);if(!definition)return {state:'UNKNOWN',message:'This Atlas page is not available.'};if(definition.module&&(profile.enabledModules||[]).indexOf(definition.module)===-1)return {state:'MODULE_DISABLED',message:'This module is not enabled for this Atlas deployment.'};return {state:'AVAILABLE',message:''};}
function resolveAtlasRoute_(event){event=event||{};var parameters=event.parameter||{},route=normalizeAtlasRoute_(parameters.route);Object.keys(ATLAS_LEGACY_ROUTE_ALIASES).some(function(alias){if(String(parameters[alias]||'')==='1'||(alias==='traveler'&&parameters[alias])){route=ATLAS_LEGACY_ROUTE_ALIASES[alias];return true;}return false;});return route;}
function atlasRouteTemplate_(route){return {home:'Index','sign-in':'SignIn','auth-callback':'AuthCallback',customers:'CommercialWorkflow',rfqs:'CommercialWorkflow',quotes:'CommercialWorkflow','quote-builder':'QuoteBuilder',jobs:'CommercialWorkflow','daily-production':'DailyProductionBoard',invoices:'CommercialWorkflow',purchasing:'PurchasingWorkspace',vendors:'VendorWorkspace',firearms:'FirearmsWorkspace','sales-activity':'SalesActivity','follow-ups':'CalendarFollowUps','shop-floor':'ShopFloor','operations-dashboard':'OperationsDashboard','floor-board':'FloorBoard',ideas:'Ideas',admin:'AdminSettings','platform-commercial':'PlatformCommercial',traveler:'Traveler'}[normalizeAtlasRoute_(route)]||'UnsupportedRoute';}
function atlasRouteTitle_(route){var normalized=normalizeAtlasRoute_(route),authTitle={'sign-in':'Sign in','auth-callback':'Completing sign in'}[normalized],found=ATLAS_ROUTE_REGISTRY.filter(function(item){return item.id===normalized;})[0];return (authTitle||(found?found.label:'Page not available'))+' - Atlas';}
