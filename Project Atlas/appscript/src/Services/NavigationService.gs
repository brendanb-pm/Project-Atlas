var ATLAS_ROUTE_REGISTRY=[
  {id:'home',group:'HOME',label:'Mission Control',description:'Attention, blocked work, and operational exceptions.',href:'?route=home',capabilities:[],icon:'MC'},
  {id:'ideas',group:'HOME',label:'Ideas',description:'Future opportunities outside operational work.',href:'?route=ideas',capabilities:['CORE_RECORD_READ'],secondary:true,icon:'ID'},
  {id:'my-work',group:'WORK',label:'My Work',description:'Your assigned, due, blocked, and approval work.',href:'?route=my-work',capabilities:['FOLLOWUP_READ','OPERATIONS_READ','PURCHASE_APPROVE','FINANCE_READ','RFQ_READ'],icon:'MW'},
  {id:'customers',group:'CUSTOMERS',label:'Customers',description:'Customer records and relationships.',href:'?route=customers',capabilities:['CORE_RECORD_READ'],icon:'CU'},
  {id:'sales-activity',group:'CUSTOMERS',label:'Sales Activity',description:'Log customer activity and next actions.',href:'?route=sales-activity',capabilities:['SALES_READ'],icon:'SA'},
  {id:'follow-ups',group:'CUSTOMERS',label:'Follow-Ups',description:'Due, upcoming, and scheduled follow-ups.',href:'?route=follow-ups',capabilities:['FOLLOWUP_READ'],icon:'FU'},
  {id:'rfqs',group:'COMMERCIAL',label:'RFQs',description:'Customer requests for quotation.',href:'?route=rfqs',capabilities:['RFQ_READ']},
  {id:'quotes',group:'COMMERCIAL',label:'Quotes',description:'Quote preparation and lifecycle.',href:'?route=quotes',capabilities:['RFQ_READ']},
  {id:'quote-builder',group:'COMMERCIAL',label:'Quote Builder',description:'Customer pricing, internal costing, suppliers, and lifecycle.',href:'?route=quote-builder',capabilities:['QUOTE_WRITE']},
  {id:'jobs',group:'PRODUCTION',label:'Jobs / Work Orders',description:'Current production jobs and work orders.',href:'?route=jobs',capabilities:['OPERATIONS_READ'],icon:'WO'},
  {id:'job',group:'PRODUCTION',label:'Work Order Canvas',description:'Contextual Work Order workspace.',href:'?route=jobs',capabilities:['OPERATIONS_READ'],hidden:true,icon:'WO'},
  {id:'daily-production',group:'PRODUCTION',label:'Daily Production',description:'Committed Work Orders by due date, ownership, readiness, and blocker.',href:'?route=daily-production',capabilities:['OPERATIONS_READ'],icon:'DP'},
  {id:'shop-floor',group:'PRODUCTION',label:'Shop Floor',description:'Current work and immediate operator actions.',href:'?route=shop-floor',capabilities:['OPERATIONS_READ'],icon:'SF'},
  {id:'operations-dashboard',group:'PRODUCTION',label:'Operations Dashboard',description:'Blocked work, workload, and shop attention.',href:'?route=operations-dashboard',capabilities:['OPERATIONS_READ'],icon:'OD'},
  {id:'floor-board',group:'PRODUCTION',label:'Floor Board',description:'Large-format current production state.',href:'?route=floor-board',capabilities:['OPERATIONS_READ'],icon:'FB'},
  {id:'invoices',group:'FINANCE',label:'Invoices',description:'Invoice records and status.',href:'?route=invoices',capabilities:['FINANCE_READ']},
  {id:'purchasing',group:'PURCHASING',label:'Purchasing',description:'Purchase requests, approvals, and receipts.',href:'?route=purchasing',capabilities:['PURCHASE_REQUEST','PURCHASE_APPROVE']},
  {id:'vendors',group:'PURCHASING',label:'Vendors',description:'Supplier and service-provider directory.',href:'?route=vendors',capabilities:['QUOTE_COST_READ']},
  {id:'firearms',group:'FIREARMS',label:'Firearms',description:'Serialized-item intake, custody, work, disposition, and reconciliation.',href:'?route=firearms',capabilities:['FIREARMS_READ'],module:'FIREARMS',icon:'FA'},
  {id:'admin',group:'ADMINISTRATION',label:'Tenant Administration',description:'Tenant configuration, access, integrations, and health.',href:'?route=admin',capabilities:['ADMIN_CONFIG','ADMIN_IDENTITY'],icon:'AD'},
  {id:'platform-commercial',group:'ADMINISTRATION',label:'Platform Administration',description:'Cross-tenant subscription, seat, module, and billing attention.',href:'?route=platform-commercial',capabilities:['PLATFORM_TENANT_READ'],icon:'PA'}
];
var ATLAS_ROUTE_GROUPS=['HOME','WORK','CUSTOMERS','COMMERCIAL','PRODUCTION','PURCHASING','FINANCE','FIREARMS','ADMINISTRATION'];
var ATLAS_LEGACY_ROUTE_ALIASES={sales:'sales-activity',ideas:'ideas',dashboard:'operations-dashboard',shop:'shop-floor',calendar:'follow-ups',traveler:'traveler'};

function AtlasNavigationService_(dependencies){dependencies=dependencies||{};this.profile=dependencies.profile||getAtlasDeploymentProfile_();this.registry=dependencies.registry||ATLAS_ROUTE_REGISTRY;}
AtlasNavigationService_.prototype.getModel=function(context,currentRoute){
  var capabilities=(context&&context.capabilities)||[],enabled=this.profile.enabledModules||[],routes=this.registry.filter(function(route){if(route.hidden)return false;if(route.module&&enabled.indexOf(route.module)===-1)return false;return !route.capabilities.length||route.capabilities.some(function(capability){return capabilities.indexOf(capability)!==-1;});});
  var groups=ATLAS_ROUTE_GROUPS.map(function(group){return {id:group,label:group,items:routes.filter(function(route){return route.group===group;}).map(atlasNavigationRoute_)};}).filter(function(group){return group.items.length;});
  var persona=atlasPresentationPersona_(capabilities),defaultRoute=persona==='SHOP_OPERATOR'?'shop-floor':persona==='TENANT_ADMIN'?'admin':['SALES_PM','PURCHASING','FINANCE'].indexOf(persona)!==-1?'my-work':'home';
  return {profile:this.profile,currentRoute:normalizeAtlasRoute_(currentRoute)==='job'?'jobs':normalizeAtlasRoute_(currentRoute),groups:groups,shortcuts:routes.filter(function(route){return ['sales-activity','follow-ups','jobs','shop-floor','operations-dashboard'].indexOf(route.id)!==-1;}).map(atlasNavigationRoute_),enabledModules:this.profile.enabledModules.slice(),accessState:capabilities.length?'READY':'LIMITED_ACCESS',persona:persona,defaultRoute:routes.some(function(route){return route.id===defaultRoute;})?defaultRoute:'home',session:{userLabel:'Signed-in Atlas user',tenantLabel:this.profile.organizationName||this.profile.deploymentDisplayName||'Current tenant'}};
};
function atlasPresentationPersona_(capabilities){function has(value){return capabilities.indexOf(value)!==-1;}if(has('SHOP_FLOOR_OPERATE')&&!has('ADMIN_CONFIG')&&!has('SALES_READ')&&!has('FINANCE_READ'))return 'SHOP_OPERATOR';if((has('ADMIN_CONFIG')||has('ADMIN_IDENTITY'))&&!has('SALES_READ')&&!has('OPERATIONS_READ'))return 'TENANT_ADMIN';if(has('PLATFORM_TENANT_READ')||has('ADMIN_CONFIG')&&has('OPERATIONS_READ'))return 'OWNER_MANAGER';if(has('SALES_READ')||has('RFQ_READ'))return 'SALES_PM';if(has('FINANCE_READ')||has('FINANCE_WRITE'))return 'FINANCE';if(has('PURCHASE_APPROVE')||has('PURCHASE_REQUEST'))return 'PURCHASING';return 'NEUTRAL';}
function atlasNavigationRoute_(route){return {id:route.id,label:route.label,description:route.description,href:route.href,icon:route.icon||route.label.slice(0,2).toUpperCase(),secondary:route.secondary===true};}
function normalizeAtlasRoute_(value){var route=String(value||'home').trim().toLowerCase();return ATLAS_LEGACY_ROUTE_ALIASES[route]||route||'home';}
function atlasRouteDefinition_(route){var normalized=normalizeAtlasRoute_(route);return ATLAS_ROUTE_REGISTRY.filter(function(item){return item.id===normalized;})[0]||({'sign-in':{id:'sign-in'},'auth-callback':{id:'auth-callback'},traveler:{id:'traveler'}}[normalized]||null);}
function atlasRouteAvailability_(route,profile){var definition=atlasRouteDefinition_(route);if(!definition)return {state:'UNKNOWN',message:'This Atlas page is not available.'};if(definition.module&&(profile.enabledModules||[]).indexOf(definition.module)===-1)return {state:'MODULE_DISABLED',message:'This module is not enabled for this Atlas deployment.'};return {state:'AVAILABLE',message:''};}
function resolveAtlasRoute_(event){event=event||{};var parameters=event.parameter||{},route=normalizeAtlasRoute_(parameters.route);Object.keys(ATLAS_LEGACY_ROUTE_ALIASES).some(function(alias){if(String(parameters[alias]||'')==='1'||(alias==='traveler'&&parameters[alias])){route=ATLAS_LEGACY_ROUTE_ALIASES[alias];return true;}return false;});return route;}
function resolveAtlasCommercialRecordId_(event,route){var normalized=normalizeAtlasRoute_(route),commercial=['customers','rfqs','quotes','jobs','invoices'];if(commercial.indexOf(normalized)===-1)return '';var value=String(event&&event.parameter&&event.parameter.id||'').trim();return value&&value.length<=128&&/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)?value:'';}
function atlasRouteTemplate_(route){return {home:'Index','my-work':'MyWork','sign-in':'SignIn','auth-callback':'AuthCallback',customers:'CommercialWorkflow',rfqs:'CommercialWorkflow',quotes:'CommercialWorkflow','quote-builder':'QuoteBuilder',jobs:'CommercialWorkflow',job:'JobCanvas','daily-production':'DailyProductionBoard',invoices:'CommercialWorkflow',purchasing:'PurchasingWorkspace',vendors:'VendorWorkspace',firearms:'FirearmsWorkspace','sales-activity':'SalesActivity','follow-ups':'CalendarFollowUps','shop-floor':'ShopFloor','operations-dashboard':'OperationsDashboard','floor-board':'FloorBoard',ideas:'Ideas',admin:'AdminSettings','platform-commercial':'PlatformCommercial',traveler:'Traveler'}[normalizeAtlasRoute_(route)]||'UnsupportedRoute';}
function atlasRouteTitle_(route){var normalized=normalizeAtlasRoute_(route),authTitle={'sign-in':'Sign in','auth-callback':'Completing sign in','access-unavailable':'Access unavailable'}[normalized],found=ATLAS_ROUTE_REGISTRY.filter(function(item){return item.id===normalized;})[0];return (authTitle||(found?found.label:'Page not available'))+' - Atlas';}

/**
 * Strict server-side entry resolution. Unlike AtlasAuthorizationService_.execute,
 * this path never applies the VALIDATION-mode legacy fallback: protected HTML is
 * selected only after a verified principal maps to an active Atlas user and the
 * configured tenant membership.
 */
function AtlasEntryRoutingService_(dependencies){
  dependencies=dependencies||{};
  this.config=dependencies.config||getAtlasIdentityConfig_();
  this.principals=dependencies.principals||new GoogleAppsScriptPrincipalResolver_();
  this.identities=dependencies.identities||new ExternalIdentityReferenceRepository_();
  this.users=dependencies.users||new AtlasUserRepository_();
  this.memberships=dependencies.memberships||new TenantMembershipRepository_();
  this.entitlements=dependencies.entitlements||(typeof CommercialEntitlementService_!=='undefined'?new CommercialEntitlementService_():{assertAllowed:function(){throw new VmosAuthorizationError_('Commercial access is unavailable.');}});
  this.navigation=dependencies.navigation||new AtlasNavigationService_();
}
AtlasEntryRoutingService_.prototype.resolve=function(requestedRoute){
  var route=normalizeAtlasRoute_(requestedRoute);
  if(route==='sign-in'||route==='auth-callback')return {state:'PUBLIC',route:route};
  var principal;
  try{principal=this.principals.resolve();}catch(error){return {state:'SIGN_IN',route:'sign-in',returnRoute:this.safeReturn_(route),reason:'signed_out'};}
  if(!principal||principal.verified!==true||!principal.type||!principal.subject)return {state:'SIGN_IN',route:'sign-in',returnRoute:this.safeReturn_(route),reason:'signed_out'};
  var reference,user,membership;
  try{
    reference=principal.provider&&principal.issuer&&this.identities.findActiveIdentity?this.identities.findActiveIdentity(principal.provider,principal.issuer,principal.subject):this.identities.findActive(principal.type,principal.subject);
    user=reference&&this.users.get(reference.userId);
    membership=user&&this.config.tenantId&&this.memberships.findActive(this.config.tenantId,user.id);
  }catch(error){return {state:'ACCESS_UNAVAILABLE',route:'access-unavailable',reason:'account'};}
  if(!user||String(user.status||'').toUpperCase()!=='ACTIVE')return {state:'ACCESS_UNAVAILABLE',route:'access-unavailable',reason:'account'};
  if(!membership)return {state:'ACCESS_UNAVAILABLE',route:'access-unavailable',reason:'membership'};
  try{this.entitlements.assertAllowed({tenantId:this.config.tenantId,userId:user.id,operation:'ATLAS_ENTRY'});}catch(error){return {state:'ACCESS_UNAVAILABLE',route:'access-unavailable',reason:'commercial'};}
  var capabilities=new AtlasAuthorizationService_({config:this.config}).capabilitiesFor_(membership),definition=atlasRouteDefinition_(route);
  if(!capabilities.length)return {state:'ACCESS_UNAVAILABLE',route:'access-unavailable',reason:'capability'};
  if(!definition)return {state:'AUTHORIZED',route:route,capabilities:capabilities};
  if(definition.capabilities&&definition.capabilities.length&&!definition.capabilities.some(function(capability){return capabilities.indexOf(capability)!==-1;}))return {state:'ACCESS_UNAVAILABLE',route:'access-unavailable',reason:'capability'};
  if(route==='home')route=this.navigation.getModel({capabilities:capabilities},route).defaultRoute;
  return {state:'AUTHORIZED',route:route,capabilities:capabilities,userId:user.id,tenantId:this.config.tenantId};
};
AtlasEntryRoutingService_.prototype.safeReturn_=function(route){var definition=atlasRouteDefinition_(route);return definition&&route!=='sign-in'&&route!=='auth-callback'?route:'home';};
