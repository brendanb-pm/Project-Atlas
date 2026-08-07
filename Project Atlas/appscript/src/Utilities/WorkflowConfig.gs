/** Configurable workflow templates; set VMOS_WORKFLOW_TEMPLATES to override these defaults. */
var VMOS_DEFAULT_WORKFLOW_TEMPLATES = {
  CERAKOTE: { label: 'Cerakote', states: ['RECEIVED', 'DISASSEMBLY', 'PREP', 'BLAST', 'MASK', 'READY_TO_COAT', 'COATING', 'CURING', 'QC', 'ASSEMBLY', 'READY_FOR_CUSTOMER', 'COMPLETE'] },
  MACHINING: { label: 'Machining', states: ['QUEUED', 'PROGRAMMING', 'SETUP', 'RUNNING', 'INSPECTION', 'SECONDARY_OP', 'COMPLETE'] }
};

function getShopWorkflowTemplates_() {
  var configured = PropertiesService.getScriptProperties().getProperty('VMOS_WORKFLOW_TEMPLATES');
  return configured ? JSON.parse(configured) : VMOS_DEFAULT_WORKFLOW_TEMPLATES;
}

function getShopWorkflow_(workflowId) {
  var workflow = getShopWorkflowTemplates_()[workflowId];
  if (!workflow || !Array.isArray(workflow.states) || !workflow.states.length) throw new VmosConfigurationError('Workflow "' + workflowId + '" is not configured.');
  return workflow;
}

function getWorkflowTransitions_(workflowId, currentStatus) {
  var states = getShopWorkflow_(workflowId).states;
  var currentIndex = states.indexOf(String(currentStatus || '').toUpperCase());
  return currentIndex < 0 || currentIndex >= states.length - 1 ? [] : [states[currentIndex + 1]];
}
