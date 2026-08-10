/**
 * Ideas are deliberately isolated from production Jobs and all operational
 * queues. These two sheets are created only by the explicit initializer; no
 * existing production tab, header, or record is changed.
 */
var VMOS_DEFAULT_IDEAS_MAPPING = {
  ideaMapping: {
    sheetName: 'IdeasBacklog',
    idField: 'IdeaID',
    headers: ['IdeaID', 'Title', 'Description', 'Category', 'Created At', 'Created By'],
    fields: {
      id: ['IdeaID'], title: ['Title'], description: ['Description'], category: ['Category'],
      createdAt: ['Created At'], createdBy: ['Created By']
    }
  },
  eventMapping: {
    sheetName: 'IdeaEvents',
    idField: 'IdeaEventID',
    headers: ['IdeaEventID', 'IdeaID', 'Event Type', 'Occurred At', 'Actor', 'Note'],
    fields: {
      id: ['IdeaEventID'], ideaId: ['IdeaID'], eventType: ['Event Type'], occurredAt: ['Occurred At'],
      actor: ['Actor'], note: ['Note']
    }
  }
};

function getIdeasConfig_() {
  var base = getVmosConfig_();
  var raw = PropertiesService.getScriptProperties().getProperty('VMOS_IDEAS_SHEET_MAPPING');
  var mapping = raw ? JSON.parse(raw) : VMOS_DEFAULT_IDEAS_MAPPING;
  if (!mapping.ideaMapping || !mapping.eventMapping) throw new VmosConfigurationError('VMOS_IDEAS_SHEET_MAPPING must define ideaMapping and eventMapping.');
  validateIdeasMapping_(mapping.ideaMapping, 'ideaMapping');
  validateIdeasMapping_(mapping.eventMapping, 'eventMapping');
  return { spreadsheetId: base.spreadsheetId, ideaMapping: mapping.ideaMapping, eventMapping: mapping.eventMapping };
}

function validateIdeasMapping_(mapping, name) {
  if (!mapping || !mapping.sheetName || !mapping.idField || !mapping.headers || !mapping.fields || !mapping.fields.id) {
    throw new VmosConfigurationError('Ideas ' + name + ' is incomplete. Configure sheetName, idField, headers, and fields.id.');
  }
  if (mapping.headers.indexOf(mapping.idField) === -1) throw new VmosConfigurationError('Ideas ' + name + ' headers must include its idField.');
}

/** Manual-only creation of the separate Ideas store. Never call at runtime. */
function initializeIdeasPersistence() {
  return callable_('initializeIdeasPersistence','ADMINISTRATIVE',function(){return initializeIdeasPersistence_();});
}
function initializeIdeasPersistence_() {
  var config = getIdeasConfig_(), spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  return {
    ok: true,
    sheets: [
      ensureIdeasSheet_(spreadsheet, config.ideaMapping),
      ensureIdeasSheet_(spreadsheet, config.eventMapping)
    ]
  };
}

function ensureIdeasSheet_(spreadsheet, mapping) {
  var sheet = spreadsheet.getSheetByName(mapping.sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(mapping.sheetName);
    sheet.getRange(1, 1, 1, mapping.headers.length).setValues([mapping.headers]);
    return { sheetName: mapping.sheetName, created: true };
  }
  var actual = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0] : [];
  if (actual.length !== mapping.headers.length || actual.some(function (value, index) { return value !== mapping.headers[index]; })) {
    throw new VmosConfigurationError('Ideas sheet "' + mapping.sheetName + '" has unexpected headers. No changes were made.');
  }
  return { sheetName: mapping.sheetName, created: false };
}
