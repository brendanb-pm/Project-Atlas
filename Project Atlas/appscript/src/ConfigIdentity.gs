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
  },
  SecurityAuditEvent: {
    sheetName:'SecurityAuditEvents', idField:'SecurityAuditEventID',
    fields:{id:['SecurityAuditEventID'],tenantId:['TenantID'],userId:['UserID'],principalType:['Principal Type'],principalSubject:['Principal Reference'],operation:['Operation'],requiredCapability:['Required Capability'],capabilitiesJson:['Capabilities JSON'],correlationId:['Correlation ID'],idempotencyKey:['Idempotency Key'],requestFingerprint:['Request Fingerprint'],actorType:['Actor Type'],resourceType:['Resource Type'],resourceId:['Resource ID'],mutationState:['Mutation State'],mutationAt:['Mutation At'],resultCode:['Result Code'],resultJson:['Result JSON'],recoveryType:['Recovery Type'],recoveryStatus:['Recovery Status'],recoveryJson:['Recovery JSON'],recoveryActor:['Recovery Actor'],recoveryCorrelationId:['Recovery Correlation ID'],attemptCount:['Attempt Count'],lastAttemptAt:['Last Attempt At'],leaseSeconds:['Lease Seconds'],leaseExpiresAt:['Lease Expires At'],reconciledAt:['Reconciled At'],occurredAt:['Occurred At'],completedAt:['Completed At'],outcome:['Outcome'],status:['Status'],details:['Details']}
  }
};

function getAtlasIdentityConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var mode = properties.getProperty('ATLAS_IDENTITY_ENFORCEMENT_MODE') || 'DISABLED_FOR_DEVELOPMENT';
  if (['DISABLED_FOR_DEVELOPMENT', 'VALIDATION', 'ENFORCED'].indexOf(mode) === -1) throw new VmosConfigurationError_('Atlas identity enforcement mode is invalid.');
  return { mode: mode, tenantId: properties.getProperty('ATLAS_TENANT_ID') || '' };
}

/** Lease is configurable for measured Apps Script runtimes; two minutes is the conservative validation default. */
function getSecurityOperationLeaseSeconds_() {
  var raw=PropertiesService.getScriptProperties().getProperty('ATLAS_SECURITY_OPERATION_LEASE_SECONDS'),seconds=raw?Number(raw):120;
  if(!isFinite(seconds)||seconds<30||seconds>1800)throw new VmosConfigurationError_('Security operation lease configuration is invalid.');
  return Math.floor(seconds);
}
