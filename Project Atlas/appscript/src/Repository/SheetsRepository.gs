function SheetsRepository_(entityName, definition, spreadsheet) {
  this.entityName = entityName; this.definition = definition; this.spreadsheet = spreadsheet;
}
/**
 * Sheets interprets leading formula characters when strings are written. An
 * apostrophe is the Sheets literal-text marker: it is not shown to operators
 * and getValues() returns the original visible string, so updates do not
 * accumulate escaping. Numbers, booleans, and Dates retain their native type.
 */
function toSafeSheetsCellValue_(value) {
  if (typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(value)) return "'" + value;
  return value;
}
SheetsRepository_.prototype.getSheet_ = function () {
  var sheet = this.spreadsheet.getSheetByName(this.definition.sheetName);
  if (!sheet) throw new VmosConfigurationError_('Sheet "' + this.definition.sheetName + '" for ' + this.entityName + ' does not exist. No sheet was created.');
  return sheet;
};
SheetsRepository_.prototype.headerMap_ = function () {
  var sheet = this.getSheet_();
  if (sheet.getLastColumn() === 0) throw new VmosConfigurationError_('Sheet "' + this.definition.sheetName + '" has no header row.');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var mapping = {};
  Object.keys(this.definition.fields).forEach(function (logical) {
    var found = this.definition.fields[logical].filter(function (candidate) { return headers.indexOf(candidate) !== -1; })[0];
    if (found) mapping[logical] = { header: found, column: headers.indexOf(found) + 1 };
  }, this);
  return mapping;
};
SheetsRepository_.prototype.assertWritable_ = function (data, mapping) {
  Object.keys(data).forEach(function (logical) {
    if (!mapping[logical]) throw new VmosConfigurationError_('Workbook mapping for ' + this.entityName + '.' + logical + ' is missing. Add a matching header or configure VMOS_SHEET_MAPPING.');
  }, this);
};
SheetsRepository_.prototype.toDomain_ = function (row, mapping) {
  var output = {};
  Object.keys(mapping).forEach(function (logical) { output[logical] = row[mapping[logical].column - 1]; });
  return serializeVmosValue_(output);
};
SheetsRepository_.prototype.list = function () {
  var sheet = this.getSheet_(), mapping = this.headerMap_(), lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues().map(function (row) { return this.toDomain_(row, mapping); }, this).filter(function (row) { return row.id; });
};
SheetsRepository_.prototype.findById = function (id) {
  return this.findRowById_(id).record;
};
SheetsRepository_.prototype.findFirstByFields = function (criteria) {
  var sheet = this.getSheet_(), mapping = this.headerMap_(), lastRow = sheet.getLastRow(), keys = Object.keys(criteria || {});
  if (!keys.length || lastRow < 2) return undefined;
  keys.forEach(function (key) { if (!mapping[key]) throw new VmosConfigurationError_('Workbook mapping for ' + this.entityName + '.' + key + ' is missing.'); }, this);
  var columns = keys.map(function (key) { return mapping[key].column; }), first = Math.min.apply(null, columns), last = Math.max.apply(null, columns);
  var values = sheet.getRange(2, first, lastRow - 1, last - first + 1).getValues();
  for (var index = 0; index < values.length; index += 1) {
    var matches = keys.every(function (key) { return String(values[index][mapping[key].column - first]) === String(criteria[key]); });
    if (matches) return this.toDomain_(sheet.getRange(index + 2, 1, 1, sheet.getLastColumn()).getValues()[0], mapping);
  }
  return undefined;
};
SheetsRepository_.prototype.findRowById_ = function (id) {
  var sheet = this.getSheet_(), mapping = this.headerMap_(), lastRow = sheet.getLastRow();
  if (!mapping.id) throw new VmosConfigurationError_('Primary-key mapping for ' + this.entityName + ' is missing.');
  if (lastRow < 2) throw new VmosNotFoundError_(this.entityName + ' ' + id + ' was not found.');
  var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var index = 0; index < rows.length; index += 1) {
    if (String(rows[index][mapping.id.column - 1]) === String(id)) return { sheet: sheet, mapping: mapping, rowNumber: index + 2, record: this.toDomain_(rows[index], mapping) };
  }
  throw new VmosNotFoundError_(this.entityName + ' ' + id + ' was not found.');
};
SheetsRepository_.prototype.insert = function (data) {
  var sheet = this.getSheet_(), mapping = this.headerMap_(); this.assertWritable_(data, mapping);
  var row = new Array(sheet.getLastColumn()).fill('');
  Object.keys(data).forEach(function (logical) { row[mapping[logical].column - 1] = toSafeSheetsCellValue_(data[logical]); });
  sheet.appendRow(row); return this.findById(data.id);
};
SheetsRepository_.prototype.updateById = function (id, changes) {
  if (Object.prototype.hasOwnProperty.call(changes, 'id')) throw new VmosValidationError_('Primary key cannot be changed.');
  var located = this.findRowById_(id); this.assertWritable_(changes, located.mapping);
  Object.keys(changes).forEach(function (logical) {
    located.sheet.getRange(located.rowNumber, located.mapping[logical].column).setValue(toSafeSheetsCellValue_(changes[logical]));
  });
  return this.findById(id);
};
function createRepository_(entityName) { var config = getVmosConfig_(); if (!config.mapping[entityName]) throw new VmosConfigurationError_('No mapping configured for ' + entityName + '.'); return new SheetsRepository_(entityName, config.mapping[entityName], SpreadsheetApp.openById(config.spreadsheetId)); }
