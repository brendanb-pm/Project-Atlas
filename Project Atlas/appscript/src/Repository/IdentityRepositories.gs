function AtlasIdentityRepository(entityName, definition) {
  var config = getVmosConfig_();
  this.repository = new SheetsRepository(entityName, definition, SpreadsheetApp.openById(config.spreadsheetId));
}
AtlasIdentityRepository.prototype.list = function () { return this.repository.list(); };
AtlasIdentityRepository.prototype.get = function (id) { return this.repository.findById(id); };
AtlasIdentityRepository.prototype.find = function (criteria) { return this.repository.findFirstByFields(criteria); };
AtlasIdentityRepository.prototype.create = function (record) { return this.repository.insert(record); };
AtlasIdentityRepository.prototype.update = function (id, changes) { return this.repository.updateById(id, changes); };

function AtlasUserRepository() { AtlasIdentityRepository.call(this, 'AtlasUser', ATLAS_IDENTITY_MAPPINGS.AtlasUser); }
AtlasUserRepository.prototype = Object.create(AtlasIdentityRepository.prototype);
function TenantMembershipRepository() { AtlasIdentityRepository.call(this, 'TenantMembership', ATLAS_IDENTITY_MAPPINGS.TenantMembership); }
TenantMembershipRepository.prototype = Object.create(AtlasIdentityRepository.prototype);
TenantMembershipRepository.prototype.findActive = function (tenantId, userId) { var matches=this.list().filter(function(record){return String(record.tenantId)===String(tenantId)&&String(record.userId)===String(userId)&&String(record.status).toUpperCase()==='ACTIVE';});if(matches.length>1)throw new VmosAuthorizationError('Tenant membership is ambiguous.');return matches[0]; };
function ExternalIdentityReferenceRepository() { AtlasIdentityRepository.call(this, 'ExternalIdentityReference', ATLAS_IDENTITY_MAPPINGS.ExternalIdentityReference); }
ExternalIdentityReferenceRepository.prototype = Object.create(AtlasIdentityRepository.prototype);
ExternalIdentityReferenceRepository.prototype.findActive = function (provider, subject) { var matches=this.list().filter(function(record){return String(record.provider)===String(provider)&&String(record.subject).toLowerCase()===String(subject).toLowerCase()&&String(record.status).toUpperCase()==='ACTIVE';});if(matches.length>1)throw new VmosAuthorizationError('External identity mapping is ambiguous.');return matches[0]; };
function SecurityAuditEventRepository() { AtlasIdentityRepository.call(this,'SecurityAuditEvent',ATLAS_IDENTITY_MAPPINGS.SecurityAuditEvent); }
SecurityAuditEventRepository.prototype=Object.create(AtlasIdentityRepository.prototype);
