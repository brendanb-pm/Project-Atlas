/**
 * Firearms workflow contracts. All collaborators are injected adapters: this
 * file has no SpreadsheetApp, UrlFetchApp, or provider dependency.
 */
var VMOS_FIREARMS_WORKFLOW = {
  id: 'FIREARMS_BASE',
  states: ['RECEIVED', 'INSPECTION', 'QUEUED', 'IN_PROCESS', 'COATING', 'REASSEMBLY', 'FINAL_QC', 'READY_FOR_PICKUP', 'COMPLETE', 'BLOCKED', 'WAITING_CUSTOMER', 'WAITING_PARTS'],
  transitions: {
    RECEIVED: ['INSPECTION', 'BLOCKED', 'WAITING_CUSTOMER'],
    INSPECTION: ['QUEUED', 'IN_PROCESS', 'WAITING_PARTS', 'BLOCKED'],
    QUEUED: ['IN_PROCESS', 'WAITING_PARTS', 'BLOCKED'],
    IN_PROCESS: ['COATING', 'REASSEMBLY', 'FINAL_QC', 'WAITING_CUSTOMER', 'WAITING_PARTS', 'BLOCKED'],
    COATING: ['REASSEMBLY', 'FINAL_QC', 'BLOCKED'],
    REASSEMBLY: ['FINAL_QC', 'BLOCKED'],
    FINAL_QC: ['READY_FOR_PICKUP', 'IN_PROCESS', 'BLOCKED'],
    READY_FOR_PICKUP: ['COMPLETE'], COMPLETE: [], BLOCKED: ['INSPECTION', 'QUEUED', 'IN_PROCESS', 'COATING', 'REASSEMBLY', 'FINAL_QC'],
    WAITING_CUSTOMER: ['INSPECTION', 'QUEUED', 'IN_PROCESS', 'BLOCKED'], WAITING_PARTS: ['QUEUED', 'IN_PROCESS', 'BLOCKED']
  }
};

var VMOS_FIREARMS_INTAKE_FIELDS = {
  shop: ['workOrderNumber', 'dateReceived', 'receivedBy', 'estimatedCompletion', 'paymentStatus', 'finalQc'],
  customer: ['name', 'phone', 'email', 'preferredContact', 'intakeMethod', 'returnMethod', 'returnAddressNotes'],
  item: ['itemType', 'manufacturer', 'model', 'caliber', 'serialOrIdentifyingMarks', 'oemOrAftermarket', 'existingFinish', 'previouslyModified', 'priorModificationNotes', 'customerReference'],
  requestedWork: ['services', 'specifics', 'cutFootprintPattern', 'colors', 'instructions'],
  opticParts: ['opticStatus', 'opticMake', 'opticModel', 'mountingHardware', 'sightsIncluded', 'installSights', 'additionalPartsIncluded', 'photoReferences'],
  condition: ['conditions', 'notes'], authorization: ['authorized', 'contactBeforeAddedWork', 'signature', 'printedName', 'date']
};

function FirearmsWorkflowService_(deps) { this.deps = deps || {}; this.workflow = this.deps.workflow || VMOS_FIREARMS_WORKFLOW; this.clock = this.deps.clock || function () { return new Date(); }; }
FirearmsWorkflowService_.prototype.validateIntake = function (intake) {
  if (!intake || !intake.customer || !String(intake.customer.name || '').trim()) throw new VmosValidationError_('Customer name is required.');
  if (!intake.item || !String(intake.item.itemType || '').trim()) throw new VmosValidationError_('Item type is required.');
  if (!intake.requestedWork || !intake.requestedWork.services || !intake.requestedWork.services.length) throw new VmosValidationError_('Select at least one requested service.');
  if (!intake.authorization || intake.authorization.authorized !== true) throw new VmosValidationError_('Customer authorization is required before creating a work order.');
  return true;
};
FirearmsWorkflowService_.prototype.createWorkOrder = function (intake, commandId) {
  if (!commandId) throw new VmosValidationError_('Command ID is required.'); this.validateIntake(intake);
  if (this.deps.commands && this.deps.commands.has(commandId)) return this.deps.commands.get(commandId);
  // The core Work Order receives only core data. Firearms-only fields are
  // retained by the module extension record associated with its canonical ID.
  var job = this.deps.workOrders.create({ customerId: intake.customerId || '', status: 'RECEIVED', workflowId: this.workflow.id });
  if (!this.deps.firearmsRecords || !this.deps.firearmsRecords.create) throw new VmosConfigurationError_('A Firearms module record adapter is required.');
  this.deps.firearmsRecords.create({ jobId: job.id, customerId: intake.customerId || '', intake: intake, createdAt: this.clock() });
  this.deps.events.append({ jobId: job.id, eventType: 'WORK_ORDER_RECEIVED', newStatus: 'RECEIVED', occurredAt: this.clock(), commandId: commandId });
  if (this.deps.board) this.deps.board.requestCreate({ jobId: job.id, status: 'RECEIVED', intake: intake });
  if (this.deps.commands) this.deps.commands.put(commandId, job);
  return job;
};
FirearmsWorkflowService_.prototype.canTransition = function (fromStatus, targetStatus) { return (this.workflow.transitions[String(fromStatus || '').toUpperCase()] || []).indexOf(String(targetStatus || '').toUpperCase()) !== -1; };
FirearmsWorkflowService_.prototype.transition = function (job, targetStatus, commandId, source) {
  var target = String(targetStatus || '').toUpperCase();
  if (!this.canTransition(job.status, target)) throw new VmosValidationError_('Transition from ' + job.status + ' to ' + target + ' is not allowed for this work order.');
  this.deps.workOrders.update(job.id, { status: target });
  this.deps.events.append({ jobId: job.id, eventType: 'STATUS_CHANGED', previousStatus: job.status, newStatus: target, occurredAt: this.clock(), commandId: commandId, source: source || 'VMOS' });
  return this.deps.workOrders.get(job.id);
};

/** External-board gateway: inbound moves are requests, never canonical writes. */
function ExternalBoardSyncService_(deps) { this.deps = deps || {}; this.workflowService = this.deps.workflowService; this.clock = this.deps.clock || function () { return new Date(); }; }
ExternalBoardSyncService_.prototype.processInboundMove = function (request) {
  if (!request || !request.provider || !request.externalTaskId || !request.correlationId) throw new VmosValidationError_('Provider, external task ID, and correlation ID are required.');
  var seen = this.deps.syncEvents.findByCorrelation(request.provider, request.correlationId);
  if (seen) return seen;
  var job = this.deps.workOrders.findByExternalTaskId(request.externalTaskId), target = this.deps.statusMappings.resolve(request.provider, request.externalSectionId);
  if (!job || !target) return this.record_(request, job && job.id, target, 'REJECTED', 'Unknown external card or board section.');
  if (!this.workflowService.canTransition(job.status, target)) {
    if (this.deps.board) this.deps.board.requestReconcile({ externalTaskId: request.externalTaskId, vmosStatus: job.status, reason: 'Transition is not permitted.' });
    return this.record_(request, job.id, target, 'REJECTED', 'Transition from ' + job.status + ' to ' + target + ' is not allowed.');
  }
  var updated = this.workflowService.transition(job, target, request.correlationId, 'EXTERNAL_BOARD');
  var result = this.record_(request, job.id, target, 'SUCCESS', '');
  if (this.deps.board) this.deps.board.requestReconcile({ externalTaskId: request.externalTaskId, vmosStatus: updated.status, correlationId: request.correlationId });
  if (this.deps.notifications) this.deps.notifications.evaluate(updated, target, request.correlationId);
  return result;
};
ExternalBoardSyncService_.prototype.onVmosStatusChanged = function (job, correlationId) {
  var mapped = this.deps.statusMappings.findExternalState(job.workflowId, job.status);
  if (!mapped) return null;
  return this.deps.board.requestMove({ jobId: job.id, externalSectionId: mapped.externalSectionId, vmosStatus: job.status, correlationId: correlationId });
};
ExternalBoardSyncService_.prototype.record_ = function (request, jobId, target, result, error) {
  return this.deps.syncEvents.append({ provider: request.provider, externalTaskId: request.externalTaskId, jobId: jobId || '', eventType: 'SECTION_MOVE', requestedExternalState: request.externalSectionId || '', requestedVmosState: target || '', result: result, error: error || '', occurredAt: this.clock(), actor: request.actor || '', correlationId: request.correlationId });
};

/** Notification evaluation is durable and provider-independent; it never sends on board input directly. */
function CustomerNotificationService_(deps) { this.deps = deps || {}; this.clock = this.deps.clock || function () { return new Date(); }; }
CustomerNotificationService_.prototype.evaluate = function (job, status, correlationId) {
  var rules = this.deps.rules.listEnabled(job.workflowId, status), created = [], now = this.clock();
  rules.forEach(function (rule) {
    if (this.deps.events.findActive(job.id, status, rule.id)) return;
    created.push(this.deps.events.append({ jobId: job.id, customerId: job.customerId || '', notificationRuleId: rule.id, status: 'PENDING', channel: rule.channel, recipient: job.recipient || '', triggeredAt: now, scheduledAt: new Date(now.getTime() + Number(rule.delayMinutes || 0) * 60000), correlationId: correlationId || '' }));
  }, this);
  return created;
};
CustomerNotificationService_.prototype.cancelForRevertedStatus = function (jobId, currentStatus) { return this.deps.events.cancelPendingExcept(jobId, currentStatus, this.clock()); };
