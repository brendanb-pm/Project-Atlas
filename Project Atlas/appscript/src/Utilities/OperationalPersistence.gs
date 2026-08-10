/**
 * Explicit, manual-only initializer for the two new operational sheets.
 * It never alters pre-existing sheets, including pre-existing operational
 * sheets with unexpected headers. Run this once from the Apps Script editor
 * only after approving the headers in ConfigOperational.gs.
 */
function initializeShopOperationalPersistence() {
  return callable_('initializeShopOperationalPersistence','ADMINISTRATIVE',function(){return initializeShopOperationalPersistence_();});
}
function initializeShopOperationalPersistence_() {
  var config = getShopOperationalConfig_();
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  return {
    ok: true,
    sheets: [
      ensureOperationalSheet_(spreadsheet, config.eventMapping),
      ensureOperationalSheet_(spreadsheet, config.qrMapping)
    ]
  };
}

function ensureOperationalSheet_(spreadsheet, mapping) {
  var sheet = spreadsheet.getSheetByName(mapping.sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(mapping.sheetName);
    sheet.getRange(1, 1, 1, mapping.headers.length).setValues([mapping.headers]);
    return { sheetName: mapping.sheetName, created: true };
  }

  var actualHeaders = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0] : [];
  if (!sameOperationalHeaders_(actualHeaders, mapping.headers)) {
    throw new VmosConfigurationError('Operational sheet "' + mapping.sheetName + '" already exists but does not have the expected headers. No changes were made.');
  }
  return { sheetName: mapping.sheetName, created: false };
}

function sameOperationalHeaders_(actual, expected) {
  if (actual.length !== expected.length) return false;
  for (var index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) return false;
  }
  return true;
}
