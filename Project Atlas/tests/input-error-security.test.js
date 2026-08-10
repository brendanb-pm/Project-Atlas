const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', 'appscript', 'src');
const diagnostics = [];
const context = vm.createContext({
  Date, JSON, String, Number, Boolean, Object, Array, Error,
  console: { error: (message) => diagnostics.push(JSON.parse(message)) },
  Utilities: { getUuid: () => '12345678-90ab-cdef-1234-567890abcdef' }
});
['Utilities/Errors.gs', 'Utilities/Serialization.gs', 'Repository/SheetsRepository.gs'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context);
});

// Formula-triggering business text is escaped only at the Sheets boundary.
['=SUM(A1:A3)', '+cmd', '- pending', '@mention'].forEach((value) => {
  assert.equal(context.toSafeSheetsCellValue_(value), "'" + value);
});
assert.equal(context.toSafeSheetsCellValue_('  =SUM(A1:A3)'), "'  =SUM(A1:A3)");
assert.equal(context.toSafeSheetsCellValue_('ordinary text'), 'ordinary text');
assert.strictEqual(context.toSafeSheetsCellValue_(42), 42);
assert.strictEqual(context.toSafeSheetsCellValue_(true), true);
const date = new Date('2026-08-10T12:00:00Z');
assert.strictEqual(context.toSafeSheetsCellValue_(date), date);

// This fake reproduces the relevant Sheets behavior: a leading apostrophe
// forces literal text and is absent from getValues()/operator display.
const headers = ['ID', 'Description', 'Notes', 'Quantity', 'Due At'];
const rows = [headers.slice()];
function sheetsLiteral(value) {
  if (typeof value === 'string' && value.charAt(0) === "'") return value.slice(1);
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return { executedFormula: value };
  return value;
}
const sheet = {
  getLastColumn: () => headers.length,
  getLastRow: () => rows.length,
  appendRow(values) { rows.push(values.map(sheetsLiteral)); },
  getRange(row, column, rowCount, columnCount) {
    return {
      getDisplayValues() { return [rows[row - 1].slice(column - 1, column - 1 + columnCount).map(String)]; },
      getValues() { return Array.from({ length: rowCount }, (_, r) => rows[row - 1 + r].slice(column - 1, column - 1 + columnCount)); },
      setValue(value) { rows[row - 1][column - 1] = sheetsLiteral(value); }
    };
  }
};
const definition = {
  sheetName: 'RFQs', idField: 'ID',
  fields: { id: ['ID'], description: ['Description'], notes: ['Notes'], quantity: ['Quantity'], dueAt: ['Due At'] }
};
const repository = new context.SheetsRepository_('RFQ', definition, { getSheetByName: () => sheet });
const created = repository.insert({ id: 'RFQ-26-0001', description: '=AI_EXTRACTED(A1)', notes: '<script>alert(1)</script>', quantity: 12, dueAt: date });
assert.equal(created.description, '=AI_EXTRACTED(A1)', 'AI/RFQ text must round-trip literally.');
assert.equal(created.notes, '<script>alert(1)</script>', 'Notes must retain legitimate visible text.');
assert.strictEqual(created.quantity, 12, 'Numeric values must remain numeric.');
assert.strictEqual(rows[1][4], date, 'Dates must remain typed in Sheets storage.');
assert.equal(created.dueAt, date.toISOString(), 'Repository output must serialize dates safely for clients.');
repository.updateById(created.id, { description: created.description });
assert.equal(repository.findById(created.id).description, '=AI_EXTRACTED(A1)', 'Repeated updates must not double-escape.');
assert.equal(rows[1].description, undefined);
assert.equal(rows[1][1].executedFormula, undefined, 'The stored value must not be interpreted as a formula.');

// Browser contracts retain operator-safe validation while hiding internal
// configuration, repository, provider, stack, path, and identifier details.
let response = context.toClientError_(new context.VmosValidationError_('End time must be after start time.'));
assert.equal(response.error.code, 'VALIDATION_ERROR');
assert.equal(response.error.message, 'End time must be after start time.');
assert.match(response.error.referenceId, /^ERR-/);

response = context.toClientError_(new context.VmosConfigurationError_('Sheet "SecretWorksheet" missing header "CredentialReference"; VMOS_SECRET_PROPERTY is absent.'));
assert.equal(response.error.code, 'CONFIGURATION_UNAVAILABLE');
assert.equal(response.error.message, 'This feature is not configured.');
assert.doesNotMatch(JSON.stringify(response), /SecretWorksheet|CredentialReference|VMOS_SECRET_PROPERTY/);

const providerError = new Error('Provider token abc123 failed at C:\\internal\\Gateway.gs:42');
providerError.code = 'PROVIDER_UNAVAILABLE';
response = context.toClientError_(providerError);
assert.equal(response.error.message, 'The connected service is temporarily unavailable.');
assert.doesNotMatch(JSON.stringify(response), /abc123|Gateway|stack/i);
assert.ok(diagnostics.some((entry) => /provider token \[REDACTED\]/i.test(entry.message)), 'Provider tokens must be redacted from diagnostics.');

const internalError = new Error('Spreadsheet ID secret-id at Repository.gs:99');
internalError.stack = 'stack trace /private/path Repository.gs:99';
response = context.toClientError_(internalError);
assert.equal(response.error.code, 'INTERNAL_ERROR');
assert.equal(response.error.message, 'Your request could not be completed.');
assert.doesNotMatch(JSON.stringify(response), /secret-id|Repository|private|stack/i);
assert.ok(diagnostics.some((entry) => /SecretWorksheet/.test(entry.message)), 'Detailed diagnostics must remain available server-side.');
assert.ok(diagnostics.some((entry) => /private\/path/.test(entry.stack)), 'Server diagnostics must retain stack context.');

const ideasUi = fs.readFileSync(path.join(base, 'UI', 'Ideas.html'), 'utf8');
const escapeSource = ideasUi.match(/function esc\(value\)\{[^}]+\}\[c\];\}\);\}/);
assert.ok(escapeSource, 'Stored-text UI requires a centralized HTML escaping helper.');
const uiContext = vm.createContext({ String });
vm.runInContext(escapeSource[0], uiContext);
assert.equal(uiContext.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
assert.match(ideasUi, /esc\(idea\.title\)/, 'Stored idea text must pass through HTML escaping before innerHTML rendering.');

console.log('Atlas input and client-safe error boundary tests passed');
