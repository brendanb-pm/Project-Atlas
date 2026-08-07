const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'appscript', 'src', 'Services', 'ProcessTrialService.gs'), 'utf8');
const rows = [];
const context = vm.createContext({
  String, Date, Array, Object, Error,
  VmosValidationError: function VmosValidationError(message) { this.message = message; },
  getVmosAuditUser_: () => 'Josh'
});
vm.runInContext(source, context);
const service = new context.ProcessTrialService({
  repository: { append: (row) => { rows.push(row); return row; }, listByJobId: (id) => rows.filter((row) => row.jobId === id) },
  jobs: { get: (id) => ({ id }) }, clock: () => new Date('2026-08-07T12:00:00.000Z'), actor: () => 'Josh', uuid: () => 'abc'
});
assert.throws(() => service.record({ outcome: 'Worked', parameterClassification: 'UNKNOWN' }), (error) => /classification/.test(error.message));
assert.throws(() => service.record({ parameterClassification: 'TEST' }), (error) => /Outcome/.test(error.message));
const trial = service.record({ jobId: 'JOB-26-0127', parameterClassification: 'PROVEN', outcome: 'Stable finish', rpm: 12000, notes: 'First good run.' });
assert.equal(trial.id, 'PTR-ABC');
assert.equal(trial.parameterClassification, 'PROVEN');
assert.equal(rows.length, 1, 'Trials are appended, never updated.');
assert.equal(service.listForJob('JOB-26-0127').length, 1);
console.log('VMOS process-trial service tests passed');
