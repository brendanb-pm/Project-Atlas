/** Beta-only tenant contract. It contains no storage or provider configuration. */
var ATLAS_DEMO_TENANTS = {
  VMOS: { key: 'VMOS', organizationName: 'Vitality Modification Company', deploymentName: 'VMOS', logoReference: '', primaryColor: '#151719', secondaryColor: '#f5f5f3', accentColor: '#b51f2b', appearance: 'dark', terminologyOverrides: { jobs: 'Work Orders' }, enabledModules: ['CRM', 'RFQ_QUOTES', 'MANUFACTURING', 'FIREARMS', 'COATINGS', 'PURCHASING', 'INVOICING', 'PROCESS_LEARNING'], enabledIntegrations: ['ASANA', 'GMAIL_RFQ_INTAKE', 'DRIVE', 'AI'], workflow: ['RECEIVED', 'QUEUED', 'IN_PROCESS', 'COATING', 'FINAL_QC', 'READY', 'COMPLETE'] },
  IPM: { key: 'IPM', organizationName: 'International Precision Machine', deploymentName: 'IPM Operations', logoReference: '', primaryColor: '#17334a', secondaryColor: '#f4f7f8', accentColor: '#167a72', appearance: 'light', terminologyOverrides: { jobs: 'Jobs' }, enabledModules: ['CRM', 'RFQ_QUOTES', 'MANUFACTURING', 'PURCHASING', 'INVOICING', 'PROCESS_LEARNING'], enabledIntegrations: [], workflow: ['RECEIVED', 'QUEUED', 'IN_PROCESS', 'FINAL_QC', 'READY', 'COMPLETE'] }
};
function getAtlasConceptTenant_(key) { var tenant = ATLAS_DEMO_TENANTS[String(key || 'VMOS').toUpperCase()]; if (!tenant) throw new VmosNotFoundError('Unknown beta tenant configuration.'); return JSON.parse(JSON.stringify(tenant)); }
function atlasModuleEnabled_(tenant, module) { return tenant.enabledModules.indexOf(module) !== -1; }
function getAtlasConceptNavigation_(tenant) {
  var items = ['Command Center'];
  if (atlasModuleEnabled_(tenant, 'CRM')) items = items.concat(['Companies', 'Customers']);
  if (atlasModuleEnabled_(tenant, 'RFQ_QUOTES')) items = items.concat(['RFQs', 'Quotes']);
  if (atlasModuleEnabled_(tenant, 'MANUFACTURING')) items = items.concat([tenant.terminologyOverrides.jobs || 'Jobs', 'Operations', 'Workload', 'Parts', 'Machines', 'Programs', 'Fixtures', 'Tools']);
  if (atlasModuleEnabled_(tenant, 'PURCHASING')) items.push('Purchasing');
  if (atlasModuleEnabled_(tenant, 'INVOICING')) items.push('Invoices');
  items.push('Documents');
  if (atlasModuleEnabled_(tenant, 'PROCESS_LEARNING')) items.push('Process Trials');
  if (atlasModuleEnabled_(tenant, 'FIREARMS')) items = items.concat(['Firearms Intake', 'Firearms Work']);
  if (atlasModuleEnabled_(tenant, 'COATINGS')) items = items.concat(['Coating Work', 'Coating Queue']);
  return items;
}
function getAtlasConceptBootstrap_(tenantKey) { var tenant = getAtlasConceptTenant_(tenantKey); return { ok: true, data: { tenant: tenant, navigation: getAtlasConceptNavigation_(tenant), kanban: getAtlasConceptKanban_(tenant) } }; }
function getAtlasConceptKanban_(tenant) { return { columns: tenant.workflow, exceptionColumns: ['BLOCKED', 'WAITING_CUSTOMER', 'WAITING_PARTS'], cards: [{ id: 'WO-26-1042', customer: 'Northstar', item: 'Fixture Plate', service: 'Mill + inspect', due: 'Today', operator: 'Ricardo', priority: 'RUSH', status: 'IN_PROCESS' }, { id: 'WO-26-1043', customer: 'Delta', item: 'Pump Housing', service: 'Deburr', due: 'Tomorrow', operator: 'Mia', priority: 'NEW', status: 'QUEUED' }, { id: 'WO-26-1044', customer: 'Apex', item: 'Mount', service: 'Coating', due: 'Aug 12', operator: 'Josh', priority: 'BLOCKED', status: 'BLOCKED' }] }; }
