const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', 'appscript', 'src');
const context = vm.createContext({ Date, String, Number, Object, Array, Error, console });
vm.runInContext(fs.readFileSync(path.join(base, 'Utilities', 'Errors.gs'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(base, 'Services', 'FirearmsWorkflowService.gs'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(base, 'Services', 'IntegrationMocks.gs'), 'utf8'), context);

const job = { id: 'JOB-26-0128', customerId: 'CUST-26-0001', workflowId: 'FIREARMS_BASE', status: 'IN_PROCESS', recipient: 'tom@example.test' };
const events = [], syncEvents = [], notificationEvents = [];
const workOrders = {
  create: value => Object.assign({ id: 'JOB-26-0200' }, value),
  get: id => { assert.equal(id, job.id); return job; },
  update: (id, changes) => { assert.equal(id, job.id); Object.assign(job, changes); return job; },
  findByExternalTaskId: id => id === 'asana-1' ? job : null
};
const eventRepo = { append: value => { events.push(value); return value; } };
const commands = { values: {}, has(id) { return !!this.values[id]; }, get(id) { return this.values[id]; }, put(id, value) { this.values[id] = value; } };
const firearmsRecords = { rows: [], create: value => { firearmsRecords.rows.push(value); return value; } };
const workflow = new context.FirearmsWorkflowService_({ workOrders, events: eventRepo, commands, firearmsRecords, clock: () => new Date('2026-08-07T12:00:00Z') });

const intake = { customer: { name: 'Tom' }, item: { itemType: 'Slide' }, requestedWork: { services: ['Optic Cut'] }, authorization: { authorized: true } };
const created = workflow.createWorkOrder(intake, 'intake-1');
assert.equal(created.status, 'RECEIVED');
assert.equal(firearmsRecords.rows[0].jobId, created.id, 'the Firearms extension attaches to the canonical core work order');
assert.equal(workflow.createWorkOrder(intake, 'intake-1'), created, 'intake command is idempotent');
assert.throws(() => workflow.createWorkOrder(Object.assign({}, intake, { authorization: { authorized: false } }), 'intake-2'), /authorization/);
assert.equal(workflow.canTransition('IN_PROCESS', 'FINAL_QC'), true, 'service paths may skip coating');

const notificationService = new context.CustomerNotificationService_({
  rules: { listEnabled: (workflowId, status) => status === 'COATING' ? [{ id: 'RULE-1', channel: 'TEXT', delayMinutes: 10 }] : [] },
  events: {
    findActive: (jobId, status, ruleId) => notificationEvents.find(e => e.jobId === jobId && e.sourceStatus === status && e.notificationRuleId === ruleId && e.status === 'PENDING'),
    append: value => { value.sourceStatus = job.status; notificationEvents.push(value); return value; },
    cancelPendingExcept: (jobId, currentStatus) => notificationEvents.filter(e => e.jobId === jobId && e.status === 'PENDING' && e.sourceStatus !== currentStatus).map(e => { e.status = 'CANCELLED'; return e; })
  },
  clock: () => new Date('2026-08-07T12:00:00Z')
});
const syncRepo = { findByCorrelation: (provider, id) => syncEvents.find(e => e.provider === provider && e.correlationId === id), append: e => { syncEvents.push(e); return e; } };
const board = new context.ExternalBoardProviderMock_();
const sync = new context.ExternalBoardSyncService_({ workflowService: workflow, workOrders, syncEvents: syncRepo, board, notifications: notificationService, statusMappings: { resolve: (provider, section) => section === 'coating-section' ? 'COATING' : section === 'ready-section' ? 'READY_FOR_PICKUP' : null, findExternalState: (workflowId, status) => status === 'COATING' ? { externalSectionId: 'coating-section' } : null }, clock: () => new Date('2026-08-07T12:01:00Z') });

const allowed = sync.processInboundMove({ provider: 'ASANA', externalTaskId: 'asana-1', externalSectionId: 'coating-section', correlationId: 'event-1', actor: 'Josh' });
assert.equal(allowed.result, 'SUCCESS'); assert.equal(job.status, 'COATING'); assert.equal(events.filter(e => e.eventType === 'STATUS_CHANGED').length, 1);
assert.equal(notificationEvents.length, 1, 'accepted VMOS change evaluates notification rules');
assert.equal(sync.processInboundMove({ provider: 'ASANA', externalTaskId: 'asana-1', externalSectionId: 'coating-section', correlationId: 'event-1' }), allowed, 'duplicate external event is processed once');
assert.equal(events.filter(e => e.eventType === 'STATUS_CHANGED').length, 1);

job.status = 'RECEIVED';
const rejected = sync.processInboundMove({ provider: 'ASANA', externalTaskId: 'asana-1', externalSectionId: 'ready-section', correlationId: 'event-2' });
assert.equal(rejected.result, 'REJECTED'); assert.equal(job.status, 'RECEIVED'); assert.equal(notificationEvents.length, 1, 'rejected board move produces no notification'); assert.ok(board.calls.some(c => c.type === 'RECONCILE'));

job.status = 'COATING';
const outbound = sync.onVmosStatusChanged(job, 'vmos-1');
assert.equal(outbound.externalSectionId, 'coating-section', 'VMOS status creates a board reconciliation request');
notificationService.cancelForRevertedStatus(job.id, 'IN_PROCESS');
assert.equal(notificationEvents[0].status, 'CANCELLED', 'a reverted status cancels delayed notification');

console.log('VMOS firearms/Asana integration contract tests passed');
