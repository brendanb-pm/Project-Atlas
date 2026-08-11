/**
 * MOS-109 process observations are append-only. A recorded trial is evidence,
 * not a mutable machine setting; later trials supersede it through history.
 */
var VMOS_PROCESS_TRIAL_MAPPING = {
  sheetName: 'ProcessTrials', idField: 'TrialID',
  headers: ['TrialID', 'JobID', 'Machine', 'Material', 'Operation', 'Tool', 'Tool Number', 'Diameter', 'Holder', 'Stickout', 'RPM', 'Feed', 'DOC/Peck', 'Coolant', 'Outcome', 'Tool Life', 'Failure Mode', 'Parameter Classification', 'Notes', 'Observed At', 'Recorded By', 'Created At'],
  fields: {
    id: ['TrialID'], jobId: ['JobID'], machine: ['Machine'], material: ['Material'], operation: ['Operation'], tool: ['Tool'], toolNumber: ['Tool Number'], diameter: ['Diameter'], holder: ['Holder'], stickout: ['Stickout'], rpm: ['RPM'], feed: ['Feed'], docPeck: ['DOC/Peck'], coolant: ['Coolant'], outcome: ['Outcome'], toolLife: ['Tool Life'], failureMode: ['Failure Mode'], parameterClassification: ['Parameter Classification'], notes: ['Notes'], observedAt: ['Observed At'], recordedBy: ['Recorded By'], createdAt: ['Created At']
  }
};

function ProcessTrialRepository_() {
  var config = getVmosConfig_();
  this.repository = new SheetsRepository_('ProcessTrial', VMOS_PROCESS_TRIAL_MAPPING, SpreadsheetApp.openById(config.spreadsheetId));
}
ProcessTrialRepository_.prototype.list = function () { return this.repository.list(); };
ProcessTrialRepository_.prototype.append = function (record) { return this.repository.insert(record); };
ProcessTrialRepository_.prototype.findById = function (id) { return this.repository.findById(id); };
ProcessTrialRepository_.prototype.listByJobId = function (jobId) { return this.list().filter(function (record) { return String(record.jobId) === String(jobId); }); };

function ProcessTrialService_(dependencies) {
  dependencies = dependencies || {};
  this.repository = dependencies.repository || new ProcessTrialRepository_();
  this.jobs = dependencies.jobs || new MvpService_('Job');
  this.clock = dependencies.clock || function () { return new Date(); };
  this.actor = dependencies.actor || getVmosAuditUser_;
  this.uuid = dependencies.uuid || function () { return Utilities.getUuid(); };
}
ProcessTrialService_.prototype.record = function (input) {
  input = input || {};
  var classification = String(input.parameterClassification || '').toUpperCase();
  if (['CALCULATED', 'TEST', 'PROVEN', 'FAILED'].indexOf(classification) === -1) throw new VmosValidationError_('Parameter classification must be CALCULATED, TEST, PROVEN, or FAILED.');
  if (!String(input.outcome || '').trim()) throw new VmosValidationError_('Outcome is required so the observation is useful later.');
  if (input.jobId) this.jobs.get(input.jobId);
  var now = this.clock();
  return this.repository.append({
    id: 'PTR-' + this.uuid().toUpperCase(), jobId: input.jobId || '', machine: input.machine || '', material: input.material || '', operation: input.operation || '', tool: input.tool || '', toolNumber: input.toolNumber || '', diameter: input.diameter || '', holder: input.holder || '', stickout: input.stickout || '', rpm: input.rpm || '', feed: input.feed || '', docPeck: input.docPeck || '', coolant: input.coolant || '', outcome: input.outcome, toolLife: input.toolLife || '', failureMode: input.failureMode || '', parameterClassification: classification, notes: input.notes || '', observedAt: input.observedAt || now, recordedBy: this.actor(), createdAt: now
  });
};
ProcessTrialService_.prototype.listForJob = function (jobId) {
  if (!jobId) throw new VmosValidationError_('Job ID is required.');
  return this.repository.listByJobId(jobId).sort(function (left, right) { return String(right.observedAt || '').localeCompare(String(left.observedAt || '')); });
};
