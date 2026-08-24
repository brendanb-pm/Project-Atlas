function AtlasIdentityRepository_(entityName, definition) {
  var config = getVmosConfig_();
  this.repository = createAtlasPersistenceProvider_({ entityName: entityName, definition: definition, spreadsheet: SpreadsheetApp.openById(config.spreadsheetId), tenantField: definition.fields.tenantId ? 'tenantId' : '' });
}
AtlasIdentityRepository_.prototype.list = function () { return this.repository.list(); };
AtlasIdentityRepository_.prototype.get = function (id) { return this.repository.findById(id); };
AtlasIdentityRepository_.prototype.find = function (criteria) { return this.repository.findFirstByFields(criteria); };
AtlasIdentityRepository_.prototype.create = function (record) { return this.repository.insert(record); };
AtlasIdentityRepository_.prototype.update = function (id, changes) { return this.repository.updateById(id, changes); };

function AtlasUserRepository_() { AtlasIdentityRepository_.call(this, 'AtlasUser', ATLAS_IDENTITY_MAPPINGS.AtlasUser); }
AtlasUserRepository_.prototype = Object.create(AtlasIdentityRepository_.prototype);
function TenantMembershipRepository_() { AtlasIdentityRepository_.call(this, 'TenantMembership', ATLAS_IDENTITY_MAPPINGS.TenantMembership); }
TenantMembershipRepository_.prototype = Object.create(AtlasIdentityRepository_.prototype);
TenantMembershipRepository_.prototype.findActive = function (tenantId, userId) { var matches=this.list().filter(function(record){return String(record.tenantId)===String(tenantId)&&String(record.userId)===String(userId)&&String(record.status).toUpperCase()==='ACTIVE';});if(matches.length>1)throw new VmosAuthorizationError_('Tenant membership is ambiguous.');return matches[0]; };
function ExternalIdentityReferenceRepository_() { AtlasIdentityRepository_.call(this, 'ExternalIdentityReference', ATLAS_IDENTITY_MAPPINGS.ExternalIdentityReference); }
ExternalIdentityReferenceRepository_.prototype = Object.create(AtlasIdentityRepository_.prototype);
ExternalIdentityReferenceRepository_.prototype.findActive = function (provider, subject) { var matches=this.list().filter(function(record){return String(record.provider)===String(provider)&&String(record.subject).toLowerCase()===String(subject).toLowerCase()&&String(record.status).toUpperCase()==='ACTIVE';});if(matches.length>1)throw new VmosAuthorizationError_('External identity mapping is ambiguous.');return matches[0]; };
ExternalIdentityReferenceRepository_.prototype.findActiveIdentity = function (provider, issuer, subject) { var matches=this.list().filter(function(record){return String(record.provider)===String(provider)&&String(record.issuer||'')===String(issuer)&&String(record.subject)===String(subject)&&String(record.status).toUpperCase()==='ACTIVE';});if(matches.length>1)throw new VmosAuthorizationError_('External identity mapping is ambiguous.');return matches[0]; };
function AtlasAuthSessionRepository_(){AtlasIdentityRepository_.call(this,'AtlasAuthSession',ATLAS_IDENTITY_MAPPINGS.AtlasAuthSession);}
AtlasAuthSessionRepository_.prototype=Object.create(AtlasIdentityRepository_.prototype);
AtlasAuthSessionRepository_.prototype.findByTokenHash=function(hash){var matches=this.list().filter(function(row){return String(row.tokenHash)===String(hash);});if(matches.length>1)throw new VmosAuthorizationError_('Atlas session is ambiguous.');return matches[0];};
function SecurityAuditEventRepository_() { AtlasIdentityRepository_.call(this,'SecurityAuditEvent',ATLAS_IDENTITY_MAPPINGS.SecurityAuditEvent); }
SecurityAuditEventRepository_.prototype=Object.create(AtlasIdentityRepository_.prototype);
SecurityAuditEventRepository_.prototype.findByOperationIdentity=function(tenantId,userId,operation,idempotencyKey){var matches=this.list().filter(function(record){return String(record.tenantId)===String(tenantId)&&String(record.userId)===String(userId)&&String(record.operation)===String(operation)&&String(record.idempotencyKey)===String(idempotencyKey);});if(matches.length>1)throw new VmosConfigurationError_('Security operation identity is ambiguous.');return matches[0];};
SecurityAuditEventRepository_.prototype.appendForContext=function(context,record){return this.repository.appendForScope(createTenantPersistenceScope_(context),record,{allowAppend:true});};
SecurityAuditEventRepository_.prototype.recentForContext=function(context,limit){return this.repository.listForScope(createTenantPersistenceScope_(context),{limit:limit,orderBy:{field:'occurredAt',direction:'DESC'}});};
