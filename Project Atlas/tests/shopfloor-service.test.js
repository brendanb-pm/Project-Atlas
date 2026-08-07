const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', 'appscript', 'src');
const job = { id: 'JOB-26-0127', customerId: 'CUST-26-0001', partId: 'H2', status: 'PLANNED', machine: 'Haas 2' };
const events = [];
const tokens = [];
const context = vm.createContext({
  console, Date, JSON, String, Number, Error, Object, Array, isNaN,
  Utilities: { getUuid: () => '11111111-2222-3333-4444-555555555555' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
});
['Utilities/Errors.gs', 'Utilities/Serialization.gs', 'Utilities/WorkflowConfig.gs', 'Services/ShopFloorService.gs'].forEach((file) => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context));
context.getVmosAuditUser_ = () => 'Josh';
context.MvpService = function (entity) {
  this.get = (id) => {
    if (entity === 'Job' && id === job.id) return job;
    if (entity === 'Customer' && id === job.customerId) return { id, name: 'Vitality Test Customer' };
    throw new context.VmosNotFoundError('missing');
  };
  this.update = (id, changes) => { assert.equal(entity, 'Job'); assert.equal(id, job.id); Object.assign(job, changes); return job; };
};
context.JobEventRepository = function () { this.listByJobId = (id) => events.filter((event) => event.jobId === id); this.append = (event) => { events.push(event); return event; }; };
context.JobQrTokenRepository = function () { this.findActiveByJobId = (id) => tokens.filter((token) => token.jobId === id && !token.revokedAt); this.findByToken = (token) => { const found = tokens.find((record) => record.id === token); if (!found) throw new context.VmosNotFoundError('missing'); return found; }; this.create = (record) => { tokens.push(record); return record; }; };
context.generateOpaqueJobQrToken_ = () => 'opaque-token';

const shop = new context.ShopFloorService();
const configured = shop.configureJob(job.id, 'MACHINING', 'SETUP');
assert.equal(configured.qrToken, 'opaque-token');
assert.equal(job.status, 'SETUP');
assert.equal(configured.job.allowedTransitions[0], 'RUNNING');
assert.equal(events[0].eventType, 'WORKFLOW_ASSIGNED');
assert.equal(events[1].eventType, 'QR_ASSIGNED');

shop.transition(job.id, 'RUNNING', 'cmd-running', 'Started');
assert.equal(job.status, 'RUNNING');
assert.equal(events.filter((event) => event.commandId === 'cmd-running').length, 1);
shop.transition(job.id, 'RUNNING', 'cmd-running', 'Retry');
assert.equal(events.filter((event) => event.commandId === 'cmd-running').length, 1);
assert.throws(() => shop.transition(job.id, 'COMPLETE', 'cmd-invalid', ''), /not allowed/);

shop.reportProblem(job.id, { reason: 'TOOL_FAILURE', notes: 'Tool 3 failed.' }, 'cmd-problem');
assert.equal(job.status, 'BLOCKED');
assert.equal(events[events.length - 1].problemType, 'TOOL_FAILURE');
shop.resolveBlock(job.id, { nextStatus: 'INSPECTION', notes: 'Replacement installed.' }, 'cmd-resolve');
assert.equal(job.status, 'INSPECTION');
assert.equal(events[events.length - 1].eventType, 'BLOCK_RESOLVED');

console.log('VMOS shop-floor service tests passed');
