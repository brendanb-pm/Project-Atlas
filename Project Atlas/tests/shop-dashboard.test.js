const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'appscript', 'src', 'Services', 'ShopDashboardService.gs'), 'utf8');
const context = vm.createContext({
  Date, JSON, String, Number, Error, Object, Array, isNaN,
  Utilities: { formatDate: (date) => date.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'UTC' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  VmosValidationError_: function VmosValidationError_(message) { this.message = message; },
  serializeVmosValue_: (value) => JSON.parse(JSON.stringify(value))
});
vm.runInContext(source, context);

const jobs = [
  { id: 'JOB-1', quoteId: 'VQT-1', operator: 'Josh', status: 'QUEUED', dueDate: '2026-08-07' },
  { id: 'JOB-2', quoteId: 'VQT-2', operator: 'Josh', status: 'BLOCKED', dueDate: '2026-08-08' },
  { id: 'JOB-3', quoteId: 'VQT-1', operator: 'Ana', status: 'COMPLETE', dueDate: '2026-08-07' },
  { id: 'JOB-4', operator: 'Ana', status: 'RUNNING', dueDate: '2026-08-07' }, // no QR: excluded, disclosed
  { id: 'JOB-5', operator: '', status: 'RUNNING', dueDate: '2026-08-09' }
];
const service = new context.ShopDashboardService_({
  jobs: { list: () => jobs },
  quotes: { list: () => [{ id: 'VQT-1', total: 1000 }, { id: 'VQT-2', total: '' }] },
  invoices: { list: () => [{ id: 'INV-1', jobId: 'JOB-1', total: 250, amountPaid: 100 }, { id: 'INV-2', jobId: 'JOB-2', total: 75, amountPaid: '' }] },
  qrTokens: { list: () => [
    { id: 'token-1', jobId: 'JOB-1', workflowId: 'MACHINING' },
    { id: 'token-2', jobId: 'JOB-2', workflowId: 'MACHINING' },
    { id: 'token-3', jobId: 'JOB-3', workflowId: 'MACHINING' },
    { id: 'token-4', jobId: 'JOB-5', workflowId: 'MACHINING' },
    { id: 'duplicate', jobId: 'JOB-1', workflowId: 'MACHINING' }
  ] },
  events: { list: () => [{ jobId: 'JOB-1', occurredAt: '2026-08-07T01:14:00.000Z' }] },
  getWorkflow: () => ({ label: 'Machining', states: ['QUEUED', 'RUNNING', 'COMPLETE'] }),
  getStatusCategories: () => ({ readyStatuses: ['QUEUED'], blockedStatuses: ['BLOCKED'], completedStatuses: ['COMPLETE'] }),
  now: () => new Date('2026-08-07T12:00:00.000Z')
});

const wip = service.getLiveWip();
assert.equal(wip.activeJobs, 3);
assert.equal(wip.readyToWorkJobs, 1, 'Unknown RUNNING status is never ready without an explicit category.');
assert.equal(wip.blockedJobs, 1);
assert.equal(wip.dueTodayJobs, 1);
assert.equal(wip.dueThisWeekJobs, 3);
assert.equal(wip.linkedQuotedValue, 1000);
assert.equal(wip.linkedInvoiceTotal, 325);
assert.equal(wip.linkedPaidValue, 100);
assert.equal(wip.jobsWithLinkedQuoteValue, 1);
assert.equal(wip.jobsWithoutLinkedQuoteValue, 2);
assert.equal(wip.jobsWithInvoiceRecords, 2);
assert.equal(wip.financialAvailability.openOrderValueAvailable, false);
assert.ok(!Object.prototype.hasOwnProperty.call(wip, 'openOrderValue'));
assert.equal(wip.unconfiguredJobCount, 1);
assert.equal(wip.duplicateTokenCount, 1);
assert.equal(wip.jobs.find((job) => job.id === 'JOB-1').lastEventAt, '2026-08-07T01:14:00.000Z');

const josh = service.getOperatorWorkload('Josh');
assert.equal(josh.activeJobs, 2);
assert.equal(josh.readyToWorkJobs, 1);
assert.equal(josh.blockedJobs, 1);
const workloads = service.listOperatorWorkloads();
assert.ok(workloads.some((workload) => workload.operator === 'Unassigned'), 'Blank job operators must be visible as Unassigned.');

console.log('VMOS shop dashboard tests passed');
