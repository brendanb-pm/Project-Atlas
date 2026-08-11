var ATLAS_CAPABILITIES = {
  CORE_RECORD_READ:'CORE_RECORD_READ', CORE_RECORD_WRITE:'CORE_RECORD_WRITE', SALES_READ:'SALES_READ', SALES_WRITE:'SALES_WRITE',
  FOLLOWUP_READ:'FOLLOWUP_READ', FOLLOWUP_WRITE:'FOLLOWUP_WRITE', FOLLOWUP_REASSIGN:'FOLLOWUP_REASSIGN', OPERATIONS_READ:'OPERATIONS_READ',
  OPERATIONS_WRITE:'OPERATIONS_WRITE', SHOP_FLOOR_OPERATE:'SHOP_FLOOR_OPERATE', RFQ_READ:'RFQ_READ', RFQ_WRITE:'RFQ_WRITE',
  QUOTE_WRITE:'QUOTE_WRITE', QUOTE_APPROVE:'QUOTE_APPROVE', QUOTE_ISSUE:'QUOTE_ISSUE', PURCHASE_REQUEST:'PURCHASE_REQUEST',
  PURCHASE_APPROVE:'PURCHASE_APPROVE', FINANCE_READ:'FINANCE_READ', FINANCE_WRITE:'FINANCE_WRITE', CALENDAR_USE:'CALENDAR_USE',
  CALENDAR_RECONCILE:'CALENDAR_RECONCILE', SECURITY_RECOVER:'SECURITY_RECOVER', ADMIN_CONFIG:'ADMIN_CONFIG', ADMIN_IDENTITY:'ADMIN_IDENTITY'
};
var ATLAS_DEFAULT_ROLE_CAPABILITIES = {
  SHOP_OPERATOR:['CORE_RECORD_READ','OPERATIONS_READ','SHOP_FLOOR_OPERATE'],
  SALES:['CORE_RECORD_READ','CORE_RECORD_WRITE','SALES_READ','SALES_WRITE','FOLLOWUP_READ','FOLLOWUP_WRITE','RFQ_READ','RFQ_WRITE','QUOTE_WRITE','CALENDAR_USE'],
  MANAGER:['CORE_RECORD_READ','CORE_RECORD_WRITE','SALES_READ','SALES_WRITE','FOLLOWUP_READ','FOLLOWUP_WRITE','FOLLOWUP_REASSIGN','OPERATIONS_READ','OPERATIONS_WRITE','SHOP_FLOOR_OPERATE','RFQ_READ','RFQ_WRITE','QUOTE_WRITE','QUOTE_APPROVE','QUOTE_ISSUE','PURCHASE_REQUEST','PURCHASE_APPROVE','FINANCE_READ','CALENDAR_USE','CALENDAR_RECONCILE'],
  FINANCE:['CORE_RECORD_READ','FINANCE_READ','FINANCE_WRITE','PURCHASE_REQUEST'],
  ADMIN:Object.keys(ATLAS_CAPABILITIES)
};

function VmosAuthorizationError_(message) { VmosError_.call(this, message || 'Authorization failed.', 'AUTHORIZATION_ERROR'); this.name = 'VmosAuthorizationError_'; }
VmosAuthorizationError_.prototype = Object.create(VmosError_.prototype);

function GoogleAppsScriptPrincipalResolver_(dependencies) { dependencies=dependencies||{}; this.session=dependencies.session||Session; }
GoogleAppsScriptPrincipalResolver_.prototype.resolve = function () {
  var active=this.session.getActiveUser&&this.session.getActiveUser(), email=active&&active.getEmail&&String(active.getEmail()||'').trim().toLowerCase();
  if (!email) throw new VmosAuthorizationError_('Authenticated identity could not be resolved.');
  return Object.freeze({ type:'GOOGLE_WORKSPACE', subject:email, verified:true });
};

function AtlasAuthorizationService_(dependencies) {
  dependencies=dependencies||{}; this.config=dependencies.config||getAtlasIdentityConfig_(); this.principals=dependencies.principals||new GoogleAppsScriptPrincipalResolver_();
  this.users=dependencies.users||new AtlasUserRepository_(); this.memberships=dependencies.memberships||new TenantMembershipRepository_();
  this.identities=dependencies.identities||new ExternalIdentityReferenceRepository_(); this.clock=dependencies.clock||function(){return new Date();};
  this.uuid=dependencies.uuid||function(){return Utilities.getUuid();}; this.entitlements=dependencies.entitlements||{assertAllowed:function(){return true;}};
  this.securityAudit=dependencies.securityAudit||null;this.securityAuditRepository=dependencies.securityAuditRepository;
}
AtlasAuthorizationService_.prototype.execute = function (requiredCapability, operationName, operation, options) {
  options=options||{};
  if (typeof operation!=='function') throw new VmosAuthorizationError_('Authorized operation is unavailable.');
  if (this.config.mode==='DISABLED_FOR_DEVELOPMENT') return operation(this.legacyContext_(operationName));
  var context;
  try { context=this.authorize_(requiredCapability,operationName); }
  catch(error) {
    if (this.config.mode==='VALIDATION') { this.logValidation_(error,operationName); return operation(this.legacyContext_(operationName,'VALIDATION_UNENFORCED')); }
    throw error;
  }
  if(!options.auditRequired)return operation(context);
  if(typeof options.prepare==='function'){
    var prepared=options.prepare(context)||{};
    ['resourceId','resourceType','recoveryType','recoveryContext'].forEach(function(key){if(prepared[key]!==undefined)options[key]=prepared[key];});
  }
  return (this.securityAudit||new SecurityAuditService_({repository:this.securityAuditRepository})).execute(context,requiredCapability,operation,options);
};
AtlasAuthorizationService_.prototype.authorize_ = function (requiredCapability, operationName) {
  try { return this.authorizeResolved_(requiredCapability,operationName); }
  catch(error) { if(error&&error.code==='AUTHORIZATION_ERROR')throw error; throw new VmosAuthorizationError_('Identity or authorization could not be verified.'); }
};
AtlasAuthorizationService_.prototype.authorizeResolved_ = function (requiredCapability, operationName) {
  if (!this.config.tenantId) throw new VmosAuthorizationError_('Tenant context could not be resolved.');
  var principal=this.principals.resolve();
  if (!principal||principal.verified!==true||!principal.type||!principal.subject) throw new VmosAuthorizationError_('Authenticated identity could not be resolved.');
  var reference=this.identities.findActive(principal.type,principal.subject);
  if (!reference) throw new VmosAuthorizationError_('Active Atlas identity mapping is required.');
  var user=this.users.get(reference.userId);
  if (!user||String(user.status).toUpperCase()!=='ACTIVE') throw new VmosAuthorizationError_('Active Atlas user is required.');
  var membership=this.memberships.findActive(this.config.tenantId,user.id);
  if (!membership) throw new VmosAuthorizationError_('Active tenant membership is required.');
  this.entitlements.assertAllowed({tenantId:this.config.tenantId,userId:user.id,operation:operationName});
  var capabilities=this.capabilitiesFor_(membership);
  if (requiredCapability&&capabilities.indexOf(requiredCapability)===-1) throw new VmosAuthorizationError_('Required capability is unavailable.');
  return this.context_({userId:user.id,tenantId:this.config.tenantId,principal:principal,operationName:operationName,authoritative:true,kind:'USER',capabilities:capabilities});
};
AtlasAuthorizationService_.prototype.capabilitiesFor_ = function (membership) {
  var values=[], roles=parseIdentityList_(membership.roles), explicit=parseIdentityList_(membership.capabilities);
  roles.forEach(function(role){(ATLAS_DEFAULT_ROLE_CAPABILITIES[role]||[]).forEach(function(capability){if(values.indexOf(capability)===-1)values.push(capability);});});
  explicit.forEach(function(capability){if(values.indexOf(capability)===-1)values.push(capability);}); return values;
};
AtlasAuthorizationService_.prototype.context_ = function (values) {
  return Object.freeze({userId:values.userId,tenantId:values.tenantId,principalType:values.principal.type,principalSubject:values.principal.subject,
    operation:values.operationName,correlationId:'AUTH-'+this.uuid(),occurredAt:this.clock(),actorType:values.kind,authoritative:values.authoritative===true,capabilities:Object.freeze((values.capabilities||Object.keys(ATLAS_CAPABILITIES)).slice())});
};
AtlasAuthorizationService_.prototype.legacyContext_ = function (operationName,kind) {
  var actor=getVmosAuditUser_(); return this.context_({userId:actor,tenantId:this.config.tenantId||'DEVELOPMENT_UNSCOPED',principal:{type:'LEGACY_DEVELOPMENT',subject:actor},operationName:operationName,authoritative:false,kind:kind||'DEVELOPMENT_UNENFORCED'});
};
AtlasAuthorizationService_.prototype.logValidation_ = function (error,operationName) { try{console.warn(JSON.stringify({event:'IDENTITY_VALIDATION_WOULD_DENY',operation:operationName,reason:error.code||'AUTHORIZATION_ERROR'}));}catch(ignored){} };

function parseIdentityList_(value) { if(Array.isArray(value))return value.map(function(v){return String(v).trim().toUpperCase();}).filter(Boolean);if(!value)return [];try{var parsed=JSON.parse(value);if(Array.isArray(parsed))return parseIdentityList_(parsed);}catch(ignored){}return String(value).split(',').map(function(v){return v.trim().toUpperCase();}).filter(Boolean); }

function getAtlasAuthorizationService_() { return new AtlasAuthorizationService_(); }
function authorizedExecute_(requiredCapability,operationName,operation,options) { return getAtlasAuthorizationService_().execute(requiredCapability,operationName,operation,options); }

function SecurityAuditService_(dependencies){dependencies=dependencies||{};this.repository=dependencies.repository||new SecurityAuditEventRepository_();this.clock=dependencies.clock||function(){return new Date();};this.uuid=dependencies.uuid||function(){return Utilities.getUuid();};this.lock=dependencies.lock||(typeof LockService!=='undefined'?LockService.getScriptLock():null);this.leaseSeconds=Number(dependencies.leaseSeconds||(typeof getSecurityOperationLeaseSeconds_==='function'?getSecurityOperationLeaseSeconds_():120));this.staleReconciler=dependencies.staleReconciler||null;}
SecurityAuditService_.prototype.execute=function(context,requiredCapability,operation,options){
  options=options||{};var key=String(options.idempotencyKey||context.correlationId||'');if(!key)throw new VmosConfigurationError_('A durable operation identity is required.');
  var record=this.begin_(context,requiredCapability,key,options),prior=this.priorResult_(record,options);
  if(prior)return prior;
  try{
    var executionContext=this.executionContext_(context,record,options),value=operation(executionContext),result=this.safeResult_(value,options),resourceId=String(options.resourceId||result.id||'');
    try{this.repository.update(record.id,{resourceId:resourceId,resultCode:'SUCCEEDED',resultJson:JSON.stringify(result),recoveryStatus:'NOT_REQUIRED',completedAt:this.clock(),outcome:'SUCCEEDED',status:'COMPLETED',lastAttemptAt:this.clock(),leaseExpiresAt:''});return this.result_(record.id,value,'COMPLETED',false);}
    catch(auditError){try{this.repository.update(record.id,{resourceId:resourceId,resultCode:'UNKNOWN_OUTCOME',resultJson:JSON.stringify(result),recoveryStatus:'PENDING',outcome:'UNKNOWN_OUTCOME',status:'RECOVERY_REQUIRED',lastAttemptAt:this.clock()});}catch(ignored){}return this.result_(record.id,value,'RECOVERY_REQUIRED',false);}
  }catch(error){
    var known=error&&['VALIDATION_ERROR','AUTHORIZATION_ERROR','NOT_FOUND','CONFLICT'].indexOf(error.code)!==-1,status=known?'FAILED':'RECOVERY_REQUIRED';
    try{this.repository.update(record.id,{resourceId:String(options.resourceId||record.resourceId||''),resultCode:error&&error.code||'UNKNOWN_OUTCOME',recoveryStatus:known?'NOT_REQUIRED':'PENDING',completedAt:known?this.clock():'',outcome:error&&error.code||'UNKNOWN_OUTCOME',status:status,details:String(error&&error.code||'INTERNAL_ERROR'),lastAttemptAt:this.clock()});}catch(ignored){}
    if(!known){var uncertain=new VmosError_('The result could not be confirmed. Refresh before retrying.','UNKNOWN_OUTCOME');uncertain.cause=error;throw uncertain;}
    throw error;
  }
};
SecurityAuditService_.prototype.begin_=function(context,requiredCapability,key,options){return this.withLock_(function(){var existing=this.repository.findByOperationIdentity?this.repository.findByOperationIdentity(context.tenantId,context.userId,context.operation,key):null;if(existing)return existing;var now=this.clock(),lease=this.leaseExpiry_(now),record={id:'SAE-'+this.uuid(),tenantId:context.tenantId,userId:context.userId,principalType:context.principalType,principalSubject:context.principalSubject,operation:context.operation,requiredCapability:requiredCapability||'',capabilitiesJson:JSON.stringify(context.capabilities||[]),correlationId:context.correlationId,idempotencyKey:key,requestFingerprint:String(options.requestFingerprint||''),actorType:context.actorType,resourceType:String(options.resourceType||''),resourceId:String(options.resourceId||''),mutationState:'NOT_STARTED',mutationAt:'',resultCode:'',resultJson:'',recoveryType:String(options.recoveryType||''),recoveryStatus:'NOT_REQUIRED',recoveryJson:this.boundedJson_(options.recoveryContext||{}),recoveryActor:'',recoveryCorrelationId:'',attemptCount:1,lastAttemptAt:now,leaseSeconds:this.leaseSeconds,leaseExpiresAt:lease,reconciledAt:'',occurredAt:context.occurredAt,completedAt:'',outcome:'',status:'PENDING',details:''};this.repository.create(record);this.repository.update(record.id,{status:'IN_PROGRESS',lastAttemptAt:now,leaseExpiresAt:lease});record.status='IN_PROGRESS';record.__newOperation=true;return record;}.bind(this));};
SecurityAuditService_.prototype.priorResult_=function(record,options){if(record.__newOperation)return null;var status=String(record.status||'').toUpperCase();if(status==='COMPLETED')return this.result_(record.id,this.parseResult_(record.resultJson),'COMPLETED',true);if(status==='RECOVERY_REQUIRED')return this.result_(record.id,this.parseResult_(record.resultJson),'RECOVERY_REQUIRED',true);if(status==='RECONCILING')throw new VmosError_('This request is being reconciled.','OPERATION_IN_PROGRESS');if(status==='PENDING'||status==='IN_PROGRESS'){if(!this.isLeaseExpired_(record))throw new VmosError_('This request is already being processed.','OPERATION_IN_PROGRESS');return this.reconcileStale_(record,options||{});}if(status==='FAILED')throw new VmosError_('This request previously failed validation.','VALIDATION_ERROR');return null;};
SecurityAuditService_.prototype.result_=function(id,value,status,replayed){return {__atlasAuthorizedResult:true,value:value||{},auditStatus:status,auditEventId:id,replayed:replayed===true};};
SecurityAuditService_.prototype.safeResult_=function(value,options){value=value||{};var result={};if(value.id!==undefined)result.id=value.id;if(value.status!==undefined)result.status=value.status;if(value.version!==undefined)result.version=value.version;if(options.resultProjector)result=options.resultProjector(value);return result;};
SecurityAuditService_.prototype.parseResult_=function(value){if(!value)return {};try{return JSON.parse(value);}catch(ignored){return {};}};
SecurityAuditService_.prototype.boundedJson_=function(value){var json=JSON.stringify(value||{});return json.length>4000?json.slice(0,4000):json;};
SecurityAuditService_.prototype.executionContext_=function(context,record,options){var values={};Object.keys(context).forEach(function(key){values[key]=context[key];});values.operationId=record.id;values.requestFingerprint=record.requestFingerprint||'';values.resourceId=record.resourceId||'';values.recoveryType=record.recoveryType||'';values.checkpoint=function(result,recoveryContext){return this.checkpoint(record,result,options,recoveryContext);}.bind(this);return Object.freeze(values);};
SecurityAuditService_.prototype.checkpoint=function(record,value,options,recoveryContext){var result=this.safeResult_(value||{},options||{}),resourceId=String(options&&options.resourceId||result.id||record.resourceId||''),changes={resourceId:resourceId,mutationState:'CANONICAL_COMPLETED',mutationAt:this.clock(),resultJson:JSON.stringify(result),lastAttemptAt:this.clock()};if(recoveryContext)changes.recoveryJson=this.boundedJson_(recoveryContext);return this.repository.update(record.id,changes);};
SecurityAuditService_.prototype.leaseExpiry_=function(now){return new Date(new Date(now).getTime()+this.leaseSeconds*1000);};
SecurityAuditService_.prototype.isLeaseExpired_=function(record){var value=record.leaseExpiresAt||new Date(new Date(record.lastAttemptAt||record.occurredAt||0).getTime()+Number(record.leaseSeconds||this.leaseSeconds)*1000);return new Date(value).getTime()<=new Date(this.clock()).getTime();};
SecurityAuditService_.prototype.reconcileStale_=function(record,options){var claimed=this.withLock_(function(){var current=this.repository.get?this.repository.get(record.id):record,status=String(current.status||'').toUpperCase();if(status==='COMPLETED'||status==='RECOVERY_REQUIRED'||status==='RECONCILING')return current;if(!this.isLeaseExpired_(current))return current;return this.repository.update(current.id,{status:'RECONCILING',recoveryStatus:'IN_PROGRESS',reconciledAt:this.clock(),lastAttemptAt:this.clock(),attemptCount:Number(current.attemptCount||1)+1});}.bind(this)),status=String(claimed.status||'').toUpperCase();if(status==='COMPLETED')return this.result_(claimed.id,this.parseResult_(claimed.resultJson),'COMPLETED',true);if(status==='RECOVERY_REQUIRED')return this.result_(claimed.id,this.parseResult_(claimed.resultJson),'RECOVERY_REQUIRED',true);if(status!=='RECONCILING')throw new VmosError_('This request is already being processed.','OPERATION_IN_PROGRESS');var resolution;try{resolution=this.staleReconciler?this.staleReconciler(claimed,options):recoverSecurityOperation_(claimed.id);if(resolution&&resolution.__atlasAuthorizedResult)resolution=resolution.value;}catch(error){this.markRecoveryRequired(claimed,error&&error.code||'STALE_RECONCILIATION_FAILED','SYSTEM:SECURITY_OPERATION_RECOVERY','');return this.result_(claimed.id,{},'RECOVERY_REQUIRED',true);}if(resolution&&resolution.outcome==='COMPLETED'){var completed=this.repository.get?this.repository.get(claimed.id):claimed;return this.result_(completed.id,this.parseResult_(completed.resultJson),'COMPLETED',true);}if(resolution&&resolution.outcome==='NOT_COMPLETED'&&resolution.proof===true)return this.resetForProvenRetry_(claimed);this.markRecoveryRequired(claimed,'STALE_OUTCOME_UNCERTAIN','SYSTEM:SECURITY_OPERATION_RECOVERY','');return this.result_(claimed.id,{},'RECOVERY_REQUIRED',true);};
SecurityAuditService_.prototype.resetForProvenRetry_=function(record){return this.withLock_(function(){var current=this.repository.get?this.repository.get(record.id):record;if(String(current.status).toUpperCase()==='COMPLETED')return this.result_(current.id,this.parseResult_(current.resultJson),'COMPLETED',true);var now=this.clock(),lease=this.leaseExpiry_(now);this.repository.update(current.id,{status:'IN_PROGRESS',recoveryStatus:'NOT_REQUIRED',outcome:'',resultCode:'',lastAttemptAt:now,leaseExpiresAt:lease});current.__newOperation=true;return null;}.bind(this));};
SecurityAuditService_.prototype.withLock_=function(operation){if(!this.lock)return operation();this.lock.waitLock(10000);try{return operation();}finally{this.lock.releaseLock();}};
SecurityAuditService_.prototype.markRecovered=function(record,result,recoveryContext){recoveryContext=recoveryContext||{};return this.withLock_(function(){var current=this.repository.get?this.repository.get(record.id):record;if(String(current.status).toUpperCase()==='COMPLETED')return current;return this.repository.update(record.id,{resourceId:String(current.resourceId||result&&result.id||''),resultCode:'SUCCEEDED',resultJson:JSON.stringify(this.safeResult_(result||{},{})),recoveryStatus:'COMPLETED',recoveryActor:String(recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'),recoveryCorrelationId:String(recoveryContext.correlationId||''),reconciledAt:this.clock(),completedAt:this.clock(),outcome:'SUCCEEDED',status:'COMPLETED',lastAttemptAt:this.clock(),leaseExpiresAt:''});}.bind(this));};
SecurityAuditService_.prototype.markRecoveryRequired=function(record,code,actor,correlationId){return this.withLock_(function(){var current=this.repository.get?this.repository.get(record.id):record;if(String(current.status).toUpperCase()==='COMPLETED')return current;return this.repository.update(record.id,{recoveryStatus:'REVIEW_REQUIRED',recoveryActor:String(actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'),recoveryCorrelationId:String(correlationId||''),reconciledAt:this.clock(),outcome:'RECOVERY_REQUIRED',status:'RECOVERY_REQUIRED',details:String(code||'OUTCOME_UNCERTAIN'),lastAttemptAt:this.clock(),leaseExpiresAt:''});}.bind(this));};
SecurityAuditService_.prototype.markRecoveryFailed=function(record,error,recoveryContext){recoveryContext=recoveryContext||{};return this.withLock_(function(){var current=this.repository.get?this.repository.get(record.id):record;if(String(current.status).toUpperCase()==='COMPLETED')return current;return this.repository.update(record.id,{recoveryStatus:'FAILED',recoveryActor:String(recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'),recoveryCorrelationId:String(recoveryContext.correlationId||''),reconciledAt:this.clock(),outcome:'RECOVERY_REQUIRED',status:'RECOVERY_REQUIRED',details:String(error&&error.code||'RECOVERY_FAILED'),lastAttemptAt:this.clock(),attemptCount:Number(current.attemptCount||1)+1,leaseExpiresAt:''});}.bind(this));};

var ATLAS_SYSTEM_OPERATION_CAPABILITIES = { CALENDAR_RECONCILIATION:['CALENDAR_RECONCILE'], RFQ_INTAKE:['RFQ_WRITE'], SECURITY_OPERATION_RECOVERY:['SECURITY_RECOVER'] };
function createTrustedSystemAuditContext_(operationName,requiredCapability) {
  var allowed=ATLAS_SYSTEM_OPERATION_CAPABILITIES[operationName]||[];
  if(allowed.indexOf(requiredCapability)===-1)throw new VmosAuthorizationError_('System operation is not authorized for this capability.');
  var config=getAtlasIdentityConfig_(); if(!config.tenantId)throw new VmosAuthorizationError_('Tenant context could not be resolved.');
  return Object.freeze({userId:'SYSTEM:'+operationName,tenantId:config.tenantId,principalType:'ATLAS_SYSTEM',principalSubject:operationName,operation:operationName,
    correlationId:'SYS-'+Utilities.getUuid(),occurredAt:new Date(),actorType:'SYSTEM',authoritative:true});
}
function trustedSystemExecute_(operationName,requiredCapability,operation,dependencies,options){
  dependencies=dependencies||{};var context=createTrustedSystemAuditContext_(operationName,requiredCapability),audit=dependencies.securityAudit||new SecurityAuditService_();
  return audit.execute(context,requiredCapability,operation,options);
}
function recoverSecurityOperation_(eventId,dependencies){dependencies=dependencies||{};return trustedSystemExecute_('SECURITY_OPERATION_RECOVERY','SECURITY_RECOVER',function(systemContext){return new SecurityOperationRecoveryService_(dependencies).reconcile(eventId,{tenantId:systemContext.tenantId,actor:systemContext.userId,correlationId:systemContext.correlationId});},dependencies,{resultProjector:function(value){return {outcome:value&&value.outcome||'UNCERTAIN'};}});}
