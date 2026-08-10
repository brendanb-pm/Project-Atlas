const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', 'appscript', 'src');
const sheets = {};

function makeSheet(name) {
  const rows = [[]];
  return {
    name,
    rows,
    getLastColumn: () => rows[0].length,
    getLastRow: () => rows.length,
    getRange(row, column, numberOfRows, numberOfColumns) {
      return {
        setValues(values) {
          for (let r = 0; r < values.length; r += 1) {
            const target = rows[row - 1 + r] || (rows[row - 1 + r] = []);
            for (let c = 0; c < values[r].length; c += 1) target[column - 1 + c] = values[r][c];
          }
        },
        getDisplayValues() {
          return Array.from({ length: numberOfRows }, (_, r) => Array.from({ length: numberOfColumns }, (_, c) => String((rows[row - 1 + r] || [])[column - 1 + c] || '')));
        },
        getValues() {
          return Array.from({ length: numberOfRows }, (_, r) => Array.from({ length: numberOfColumns }, (_, c) => (rows[row - 1 + r] || [])[column - 1 + c] || ''));
        },
        setValue(value) { (rows[row - 1] || (rows[row - 1] = []))[column - 1] = value; }
      };
    },
    appendRow(values) { rows.push(values); }
  };
}

const spreadsheet = {
  getSheetByName: (name) => sheets[name] || null,
  insertSheet(name) { const sheet = makeSheet(name); sheets[name] = sheet; return sheet; }
};
const context = vm.createContext({
  console, Date, JSON, String, Number, Error, Object, Array,
  Utilities: { getUuid: () => 'a1b2c3d4-e5f6-47a8-9012-3456789abcde' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  SpreadsheetApp: { openById: () => spreadsheet },
  callable_: (name, policy, operation) => operation({ userId: 'ADMIN-TEST' })
});

[
  'Utilities/Errors.gs',
  'Utilities/Serialization.gs',
  'Repository/SheetsRepository.gs',
  'ConfigOperational.gs',
  'Repository/OperationalRepositories.gs',
  'Utilities/OperationalPersistence.gs'
].forEach((file) => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context));
context.getVmosConfig_ = () => ({ spreadsheetId: 'test-workbook' });

const result = context.initializeShopOperationalPersistence();
assert.deepEqual(result, { ok: true, sheets: [{ sheetName: 'JobEvents', created: true }, { sheetName: 'JobQrTokens', created: true }] });
assert.deepEqual(sheets.JobEvents.rows[0], context.VMOS_DEFAULT_OPERATIONAL_MAPPING.eventMapping.headers);
assert.deepEqual(sheets.JobQrTokens.rows[0], context.VMOS_DEFAULT_OPERATIONAL_MAPPING.qrMapping.headers);
assert.deepEqual(context.initializeShopOperationalPersistence(), { ok: true, sheets: [{ sheetName: 'JobEvents', created: false }, { sheetName: 'JobQrTokens', created: false }] });

sheets.JobEvents.rows[0][0] = 'Wrong Event ID';
assert.throws(() => context.initializeShopOperationalPersistence(), /No changes were made/);
assert.equal(sheets.JobEvents.rows[0][0], 'Wrong Event ID');
sheets.JobEvents.rows[0] = context.VMOS_DEFAULT_OPERATIONAL_MAPPING.eventMapping.headers.slice();

const events = new context.JobEventRepository();
events.append({ id: 'JEV-26-0001', commandId: 'cmd-001', jobId: 'JOB-26-0127', eventType: 'STATUS_CHANGED', occurredAt: new Date('2026-08-07T01:14:00.000Z'), actor: 'Josh' });
assert.deepEqual(events.listByJobId('JOB-26-0127'), [{ id: 'JEV-26-0001', commandId: 'cmd-001', jobId: 'JOB-26-0127', eventType: 'STATUS_CHANGED', occurredAt: '2026-08-07T01:14:00.000Z', actor: 'Josh', previousStatus: '', newStatus: '', notes: '', problemType: '', responsibleParty: '', nextAction: '', expectedResolution: '', machine: '', tool: '', program: '', workflowId: '', workflowVersion: '' }]);

const tokens = new context.JobQrTokenRepository();
tokens.create({ id: context.generateOpaqueJobQrToken_(), jobId: 'JOB-26-0127', workflowId: 'MACHINING', createdAt: new Date('2026-08-07T01:14:00.000Z'), createdBy: 'Josh' });
assert.equal(tokens.findActiveByJobId('JOB-26-0127').length, 1);
assert.match(tokens.findActiveByJobId('JOB-26-0127')[0].id, /^[a-f0-9]{32}$/);
const tokenId = tokens.findActiveByJobId('JOB-26-0127')[0].id;
tokens.revoke(tokenId, 'Authoritative User');
assert.equal(tokens.findActiveByJobId('JOB-26-0127').length, 0);
assert.equal(tokens.findByToken(tokenId).revokedBy, 'Authoritative User');
assert.ok(tokens.findByToken(tokenId).revokedAt, 'Revocation history must remain durable.');

console.log('VMOS operational persistence tests passed');
