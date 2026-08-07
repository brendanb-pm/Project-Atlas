/**
 * Operational records intentionally live apart from the established production
 * tabs. These are the exact headers created only by
 * initializeShopOperationalPersistence() when an authorized operator invokes
 * it. Existing sheets are never changed by that function.
 */
var VMOS_DEFAULT_OPERATIONAL_MAPPING = {
  eventMapping: {
    sheetName: 'JobEvents',
    idField: 'EventID',
    headers: ['EventID', 'Command ID', 'JobID', 'Event Type', 'Occurred At', 'Actor', 'Previous Status', 'New Status', 'Notes', 'Problem Type', 'Responsible Party', 'Next Action', 'Expected Resolution', 'Machine', 'Tool', 'Program', 'Workflow ID', 'Workflow Version'],
    fields: {
      id: ['EventID'], commandId: ['Command ID'], jobId: ['JobID'], eventType: ['Event Type'], occurredAt: ['Occurred At'], actor: ['Actor'], previousStatus: ['Previous Status'], newStatus: ['New Status'], notes: ['Notes'], problemType: ['Problem Type'], responsibleParty: ['Responsible Party'], nextAction: ['Next Action'], expectedResolution: ['Expected Resolution'], machine: ['Machine'], tool: ['Tool'], program: ['Program'], workflowId: ['Workflow ID'], workflowVersion: ['Workflow Version']
    }
  },
  qrMapping: {
    sheetName: 'JobQrTokens',
    idField: 'QR Token',
    headers: ['QR Token', 'JobID', 'Workflow ID', 'Created At', 'Created By', 'Revoked At', 'Revoked By'],
    fields: {
      id: ['QR Token'], jobId: ['JobID'], workflowId: ['Workflow ID'], createdAt: ['Created At'], createdBy: ['Created By'], revokedAt: ['Revoked At'], revokedBy: ['Revoked By']
    }
  }
};

/**
 * Reads optional full replacement mappings from VMOS_OPERATIONAL_SHEET_MAPPING.
 * The property must contain both eventMapping and qrMapping; partial mappings
 * are rejected rather than guessed.
 */
function getShopOperationalConfig_() {
  var baseConfig = getVmosConfig_();
  var rawMapping = PropertiesService.getScriptProperties().getProperty('VMOS_OPERATIONAL_SHEET_MAPPING');
  var mapping = rawMapping ? JSON.parse(rawMapping) : VMOS_DEFAULT_OPERATIONAL_MAPPING;
  if (!mapping.eventMapping || !mapping.qrMapping) throw new VmosConfigurationError('VMOS_OPERATIONAL_SHEET_MAPPING must define eventMapping and qrMapping.');
  validateOperationalMapping_(mapping.eventMapping, 'eventMapping');
  validateOperationalMapping_(mapping.qrMapping, 'qrMapping');
  return { spreadsheetId: baseConfig.spreadsheetId, eventMapping: mapping.eventMapping, qrMapping: mapping.qrMapping };
}

function validateOperationalMapping_(mapping, name) {
  if (!mapping || !mapping.sheetName || !mapping.idField || !mapping.fields || !mapping.fields.id || !mapping.headers) {
    throw new VmosConfigurationError('Operational ' + name + ' is incomplete. Configure sheetName, idField, headers, and fields.id.');
  }
  if (mapping.headers.indexOf(mapping.idField) === -1) throw new VmosConfigurationError('Operational ' + name + ' headers must include its idField.');
}
