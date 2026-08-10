/** Additive MOS-121G identity stores. These sheets are never created automatically. */
var ATLAS_IDENTITY_MAPPINGS = {
  AtlasUser: {
    sheetName: 'AtlasUsers', idField: 'UserID',
    fields: { id: ['UserID'], displayName: ['Display Name'], status: ['Status'], createdAt: ['Created At'], updatedAt: ['Updated At'] }
  },
  TenantMembership: {
    sheetName: 'TenantMemberships', idField: 'MembershipID',
    fields: { id: ['MembershipID'], tenantId: ['TenantID'], userId: ['UserID'], status: ['Status'], roles: ['Roles JSON'], capabilities: ['Capabilities JSON'], createdAt: ['Created At'], updatedAt: ['Updated At'] }
  },
  ExternalIdentityReference: {
    sheetName: 'ExternalIdentityReferences', idField: 'IdentityReferenceID',
    fields: { id: ['IdentityReferenceID'], userId: ['UserID'], provider: ['Provider'], subject: ['Subject'], status: ['Status'], createdAt: ['Created At'], updatedAt: ['Updated At'] }
  }
};

function getAtlasIdentityConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var mode = properties.getProperty('ATLAS_IDENTITY_ENFORCEMENT_MODE') || 'DISABLED_FOR_DEVELOPMENT';
  if (['DISABLED_FOR_DEVELOPMENT', 'VALIDATION', 'ENFORCED'].indexOf(mode) === -1) throw new VmosConfigurationError('Atlas identity enforcement mode is invalid.');
  return { mode: mode, tenantId: properties.getProperty('ATLAS_TENANT_ID') || '' };
}
