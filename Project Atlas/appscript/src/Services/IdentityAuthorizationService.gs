var ATLAS_CAPABILITIES = {
  CORE_RECORD_READ:'CORE_RECORD_READ', CORE_RECORD_WRITE:'CORE_RECORD_WRITE', SALES_READ:'SALES_READ', SALES_WRITE:'SALES_WRITE',
  FOLLOWUP_READ:'FOLLOWUP_READ', FOLLOWUP_WRITE:'FOLLOWUP_WRITE', FOLLOWUP_REASSIGN:'FOLLOWUP_REASSIGN', OPERATIONS_READ:'OPERATIONS_READ',
  OPERATIONS_WRITE:'OPERATIONS_WRITE', SHOP_FLOOR_OPERATE:'SHOP_FLOOR_OPERATE', RFQ_READ:'RFQ_READ', RFQ_WRITE:'RFQ_WRITE',
  QUOTE_WRITE:'QUOTE_WRITE', QUOTE_APPROVE:'QUOTE_APPROVE', QUOTE_ISSUE:'QUOTE_ISSUE', PURCHASE_REQUEST:'PURCHASE_REQUEST',
  PURCHASE_APPROVE:'PURCHASE_APPROVE', FINANCE_READ:'FINANCE_READ', FINANCE_WRITE:'FINANCE_WRITE', CALENDAR_USE:'CALENDAR_USE',
  CALENDAR_RECONCILE:'CALENDAR_RECONCILE', ADMIN_CONFIG:'ADMIN_CONFIG', ADMIN_IDENTITY:'ADMIN_IDENTITY'
};
var ATLAS_DEFAULT_ROLE_CAPABILITIES = {
  SHOP_OPERATOR:['CORE_RECORD_READ','OPERATIONS_READ','SHOP_FLOOR_OPERATE'],
  SALES:['CORE_RECORD_READ','CORE_RECORD_WRITE','SALES_READ','SALES_WRITE','FOLLOWUP_READ','FOLLOWUP_WRITE','RFQ_READ','RFQ_WRITE','QUOTE_WRITE','CALENDAR_USE'],
  MANAGER:['CORE_RECORD_READ','CORE_RECORD_WRITE','SALES_READ','SALES_WRITE','FOLLOWUP_READ','FOLLOWUP_WRITE','FOLLOWUP_REASSIGN','OPERATIONS_READ','OPERATIONS_WRITE','SHOP_FLOOR_OPERATE','RFQ_READ','RFQ_WRITE','QUOTE_WRITE','QUOTE_APPROVE','QUOTE_ISSUE','PURCHASE_REQUEST','PURCHASE_APPROVE','FINANCE_READ','CALENDAR_USE','CALENDAR_RECONCILE'],
  FINANCE:['CORE_RECORD_READ','FINANCE_READ','FINANCE_WRITE','PURCHASE_REQUEST'],
  ADMIN:Object.keys(ATLAS_CAPABILITIES)
};

function VmosAuthorizationError(message) { VmosError.call(this, message || 'Authorization failed.', 'AUTHORIZATION_ERROR'); this.name = 'VmosAuthorizationError'; }
VmosAuthorizationError.prototype = Object.create(VmosError.prototype);

function GoogleAppsScriptPrincipalResolver(dependencies) { dependencies=dependencies||{}; this.session=dependencies.session||Session; }
GoogleAppsScriptPrincipalResolver.prototype.resolve = function () {
  var active=this.session.getActiveUser&&this.session.getActiveUser(), email=active&&active.getEmail&&String(active.getEmail()||'').trim().toLowerCase();
  if (!email) throw new VmosAuthorizationError('Authenticated identity could not be resolved.');
  return Object.freeze({ type:'GOOGLE_WORKSPACE', subject:email, verified:true });
};

function AtlasAuthorizationService(dependencies) {
  dependencies=dependencies||{}; this.config=dependencies.config||getAtlasIdentityConfig_(); this.principals=dependencies.principals||new GoogleAppsScriptPrincipalResolver();
  this.users=dependencies.users||new AtlasUserRepository(); this.memberships=dependencies.memberships||new TenantMembershipRepository();
  this.identities=dependencies.identities||new ExternalIdentityReferenceRepository(); this.clock=dependencies.clock||function(){return new Date();};
  this.uuid=dependencies.uuid||function(){return Utilities.getUuid();}; this.entitlements=dependencies.entitlements||{assertAllowed:function(){return true;}};
}
AtlasAuthorizationService.prototype.execute = function (requiredCapability, operationName, operation) {
  if (typeof operation!=='function') throw new VmosAuthorizationError('Authorized operation is unavailable.');
  if (this.config.mode==='DISABLED_FOR_DEVELOPMENT') return operation(this.legacyContext_(operationName));
  var context;
  try { context=this.authorize_(requiredCapability,operationName); }
  catch(error) {
    if (this.config.mode==='VALIDATION') { this.logValidation_(error,operationName); return operation(this.legacyContext_(operationName,'VALIDATION_UNENFORCED')); }
    throw error;
  }
  return operation(context);
};
AtlasAuthorizationService.prototype.authorize_ = function (requiredCapability, operationName) {
  try { return this.authorizeResolved_(requiredCapability,operationName); }
  catch(error) { if(error&&error.code==='AUTHORIZATION_ERROR')throw error; throw new VmosAuthorizationError('Identity or authorization could not be verified.'); }
};
AtlasAuthorizationService.prototype.authorizeResolved_ = function (requiredCapability, operationName) {
  if (!this.config.tenantId) throw new VmosAuthorizationError('Tenant context could not be resolved.');
  var principal=this.principals.resolve();
  if (!principal||principal.verified!==true||!principal.type||!principal.subject) throw new VmosAuthorizationError('Authenticated identity could not be resolved.');
  var reference=this.identities.findActive(principal.type,principal.subject);
  if (!reference) throw new VmosAuthorizationError('Active Atlas identity mapping is required.');
  var user=this.users.get(reference.userId);
  if (!user||String(user.status).toUpperCase()!=='ACTIVE') throw new VmosAuthorizationError('Active Atlas user is required.');
  var membership=this.memberships.findActive(this.config.tenantId,user.id);
  if (!membership) throw new VmosAuthorizationError('Active tenant membership is required.');
  this.entitlements.assertAllowed({tenantId:this.config.tenantId,userId:user.id,operation:operationName});
  var capabilities=this.capabilitiesFor_(membership);
  if (requiredCapability&&capabilities.indexOf(requiredCapability)===-1) throw new VmosAuthorizationError('Required capability is unavailable.');
  return this.context_({userId:user.id,tenantId:this.config.tenantId,principal:principal,operationName:operationName,authoritative:true,kind:'USER'});
};
AtlasAuthorizationService.prototype.capabilitiesFor_ = function (membership) {
  var values=[], roles=parseIdentityList_(membership.roles), explicit=parseIdentityList_(membership.capabilities);
  roles.forEach(function(role){(ATLAS_DEFAULT_ROLE_CAPABILITIES[role]||[]).forEach(function(capability){if(values.indexOf(capability)===-1)values.push(capability);});});
  explicit.forEach(function(capability){if(values.indexOf(capability)===-1)values.push(capability);}); return values;
};
AtlasAuthorizationService.prototype.context_ = function (values) {
  return Object.freeze({userId:values.userId,tenantId:values.tenantId,principalType:values.principal.type,principalSubject:values.principal.subject,
    operation:values.operationName,correlationId:'AUTH-'+this.uuid(),occurredAt:this.clock(),actorType:values.kind,authoritative:values.authoritative===true});
};
AtlasAuthorizationService.prototype.legacyContext_ = function (operationName,kind) {
  var actor=getVmosAuditUser_(); return this.context_({userId:actor,tenantId:this.config.tenantId||'DEVELOPMENT_UNSCOPED',principal:{type:'LEGACY_DEVELOPMENT',subject:actor},operationName:operationName,authoritative:false,kind:kind||'DEVELOPMENT_UNENFORCED'});
};
AtlasAuthorizationService.prototype.logValidation_ = function (error,operationName) { try{console.warn(JSON.stringify({event:'IDENTITY_VALIDATION_WOULD_DENY',operation:operationName,reason:error.code||'AUTHORIZATION_ERROR'}));}catch(ignored){} };

function parseIdentityList_(value) { if(Array.isArray(value))return value.map(function(v){return String(v).trim().toUpperCase();}).filter(Boolean);if(!value)return [];try{var parsed=JSON.parse(value);if(Array.isArray(parsed))return parseIdentityList_(parsed);}catch(ignored){}return String(value).split(',').map(function(v){return v.trim().toUpperCase();}).filter(Boolean); }

function getAtlasAuthorizationService_() { return new AtlasAuthorizationService(); }
function authorizedExecute_(requiredCapability,operationName,operation) { return getAtlasAuthorizationService_().execute(requiredCapability,operationName,operation); }

var ATLAS_SYSTEM_OPERATION_CAPABILITIES = { CALENDAR_RECONCILIATION:['CALENDAR_RECONCILE'], RFQ_INTAKE:['RFQ_WRITE'] };
function createTrustedSystemAuditContext_(operationName,requiredCapability) {
  var allowed=ATLAS_SYSTEM_OPERATION_CAPABILITIES[operationName]||[];
  if(allowed.indexOf(requiredCapability)===-1)throw new VmosAuthorizationError('System operation is not authorized for this capability.');
  var config=getAtlasIdentityConfig_(); if(!config.tenantId)throw new VmosAuthorizationError('Tenant context could not be resolved.');
  return Object.freeze({userId:'SYSTEM:'+operationName,tenantId:config.tenantId,principalType:'ATLAS_SYSTEM',principalSubject:operationName,operation:operationName,
    correlationId:'SYS-'+Utilities.getUuid(),occurredAt:new Date(),actorType:'SYSTEM',authoritative:true});
}
