/**
 * Beta DeploymentProfile contract. It intentionally excludes all credentials,
 * Script Properties, storage mappings, and provider secrets.
 */
var ATLAS_GENERIC_MANUFACTURING_WORKFLOW = ['RECEIVED', 'QUEUED', 'IN_PROCESS', 'FINAL_QC', 'READY', 'COMPLETE'];
var ATLAS_DEMO_TENANTS = {
  VMOS: {
    deploymentKey: 'vmos', identity: { organizationName: 'Vitality Modification Company', deploymentName: 'VMOS' },
    branding: { logoReference: '', primaryColor: '#151719', secondaryColor: '#f5f5f3', accentColor: '#b51f2b', lightAssetReference: '', darkAssetReference: '', typography: '' },
    modules: ['CRM', 'RFQ_QUOTES', 'MANUFACTURING', 'PURCHASING', 'INVOICING', 'PROCESS_LEARNING', 'FIREARMS', 'COATINGS'], integrations: ['ASANA', 'GMAIL_RFQ_INTAKE', 'DRIVE', 'AI'],
    terminology: { jobs: 'Work Orders', customers: 'Customers' }, workflowReferences: { defaultWorkflow: 'VMOS_MANUFACTURING', specialtyWorkflows: ['VITALITY_FIREARMS', 'VITALITY_COATINGS'] },
    featureFlags: { nativeKanban: false, firearmsTablet: false, rfqIntake: false }, appearance: 'dark', workflow: ['RECEIVED', 'QUEUED', 'IN_PROCESS', 'COATING', 'FINAL_QC', 'READY', 'COMPLETE'], configurationRequired: []
  },
  IPM: {
    deploymentKey: 'ipm-operations', identity: { organizationName: 'International Precision Machine', deploymentName: 'IPM Operations' },
    branding: { logoReference: '', primaryColor: '', secondaryColor: '', accentColor: '', lightAssetReference: '', darkAssetReference: '', typography: '' },
    modules: ['CRM', 'RFQ_QUOTES', 'MANUFACTURING', 'PURCHASING', 'INVOICING', 'PROCESS_LEARNING'], integrations: [],
    terminology: { jobs: 'Jobs', customers: 'Customers' }, workflowReferences: { defaultWorkflow: 'ATLAS_GENERIC_MANUFACTURING', specialtyWorkflows: [] },
    featureFlags: { nativeKanban: false, firearmsTablet: false, rfqIntake: false }, appearance: 'light', workflow: ATLAS_GENERIC_MANUFACTURING_WORKFLOW,
    configurationRequired: ['Brand colors/logo', 'Terminology confirmation', 'Default workflow', 'Payment terms', 'User roles and access', 'Import/start-empty choice']
  }
};
function cloneAtlasValue_(value) { return JSON.parse(JSON.stringify(value)); }
function getAtlasConceptTenant_(key) { var profile = ATLAS_DEMO_TENANTS[String(key || 'VMOS').toUpperCase()]; if (!profile) throw new VmosNotFoundError('Unknown beta deployment profile.'); return resolveAtlasDeploymentProfile_(cloneAtlasValue_(profile)); }
function resolveAtlasDeploymentProfile_(profile) {
  if (!profile || !profile.deploymentKey || !profile.identity || !profile.identity.organizationName || !profile.identity.deploymentName) throw new VmosValidationError('Deployment profile identity is incomplete.');
  profile.branding = profile.branding || {}; profile.modules = profile.modules || []; profile.integrations = profile.integrations || []; profile.terminology = profile.terminology || {}; profile.workflowReferences = profile.workflowReferences || {}; profile.featureFlags = profile.featureFlags || {};
  profile.branding.primaryColor = profile.branding.primaryColor || '#263b4a'; profile.branding.secondaryColor = profile.branding.secondaryColor || '#f4f7f8'; profile.branding.accentColor = profile.branding.accentColor || '#356f91';
  profile.enabledModules = profile.modules.slice(); profile.enabledIntegrations = profile.integrations.slice(); profile.organizationName = profile.identity.organizationName; profile.deploymentName = profile.identity.deploymentName; profile.primaryColor = profile.branding.primaryColor; profile.secondaryColor = profile.branding.secondaryColor; profile.accentColor = profile.branding.accentColor; profile.key = profile.deploymentKey.toUpperCase(); profile.terminologyOverrides = profile.terminology;
  return profile;
}
function atlasModuleEnabled_(profile, module) { return profile.modules.indexOf(module) !== -1; }
function getAtlasConceptNavigation_(profile) { return getAtlasModuleRegistry_().filter(function (module) { return atlasModuleEnabled_(profile, module.key); }).reduce(function (items, module) { return items.concat(module.navigationEntries(profile)); }, ['Command Center']); }
function getAtlasCommandCenterCards_(profile) {
  var cards = [{ key: 'NEW_RFQS', label: 'New RFQs', requires: 'RFQ_QUOTES' }, { key: 'QUOTES', label: 'Quotes Needing Action', requires: 'RFQ_QUOTES' }, { key: 'DUE', label: (profile.terminology.jobs || 'Jobs') + ' Due Soon', requires: 'MANUFACTURING' }, { key: 'OVERDUE', label: 'Overdue ' + (profile.terminology.jobs || 'Jobs'), requires: 'MANUFACTURING' }, { key: 'BLOCKED', label: 'Blocked Work', requires: 'MANUFACTURING' }, { key: 'WIP', label: 'Work In Process', requires: 'MANUFACTURING' }, { key: 'READY', label: 'Ready for Pickup / Shipment', requires: 'MANUFACTURING' }, { key: 'INVOICES', label: 'Unpaid Invoices', requires: 'INVOICING' }, { key: 'RECEIPTS', label: 'Undeposited Receipts', requires: 'INVOICING' }, { key: 'PURCHASES', label: 'Purchase Approvals', requires: 'PURCHASING' }, { key: 'MACHINES', label: 'Machine Workload', requires: 'MANUFACTURING' }];
  return cards.filter(function (card) { return atlasModuleEnabled_(profile, card.requires); });
}
function getAtlasConceptBootstrap_(tenantKey) { var profile = getAtlasConceptTenant_(tenantKey); return { ok: true, data: { tenant: profile, navigation: getAtlasConceptNavigation_(profile), commandCenter: getAtlasCommandCenterCards_(profile), kanban: getAtlasConceptKanban_(profile) } }; }
function getAtlasConceptKanban_(profile) { return { columns: profile.workflow || ATLAS_GENERIC_MANUFACTURING_WORKFLOW, exceptionColumns: ['BLOCKED', 'WAITING_CUSTOMER', 'WAITING_PARTS'], cards: [{ id: 'WO-26-1042', customer: 'Northstar', item: 'Fixture Plate', service: 'Mill + inspect', due: 'Today', operator: 'Ricardo', priority: 'RUSH', status: 'IN_PROCESS' }, { id: 'WO-26-1043', customer: 'Delta', item: 'Pump Housing', service: 'Deburr', due: 'Tomorrow', operator: 'Mia', priority: 'NEW', status: 'QUEUED' }, { id: 'WO-26-1044', customer: 'Apex', item: 'Mount', service: atlasModuleEnabled_(profile, 'COATINGS') ? 'Coating' : 'Inspection hold', due: 'Aug 12', operator: 'Josh', priority: 'BLOCKED', status: 'BLOCKED' }] }; }
