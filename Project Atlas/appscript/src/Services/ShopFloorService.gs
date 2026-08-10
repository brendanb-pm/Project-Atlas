/** Shop-floor commands are the only path that changes production job status. */
function ShopFloorService_(dependencies) {
  dependencies = dependencies || {};
  this.jobs = dependencies.jobs || new MvpService_('Job');
  this.events = dependencies.events || new JobEventRepository_();
  this.qrTokens = dependencies.qrTokens || new JobQrTokenRepository_();
  this.auditUser = dependencies.auditUser || getVmosAuditUser_;
  this.tokenGenerator = dependencies.tokenGenerator || generateOpaqueJobQrToken_;
  this.clock = dependencies.clock || function () { return new Date(); };
}

ShopFloorService_.prototype.configureJob = function (jobId, workflowId, initialStatus) {
  var job = this.jobs.get(jobId), workflow = getShopWorkflow_(workflowId);
  var active = this.qrTokens.findActiveByJobId(jobId)[0];
  if (active && active.workflowId === workflowId) return { job: this.toShopJob_(job, active), qrToken: active.id };
  if (active) throw new VmosValidationError_('Job ' + jobId + ' already has an active QR token. Reprint its existing traveler instead of creating another token.');
  if (workflow.states.indexOf(String(job.status || '').toUpperCase()) === -1) {
    var assignedStatus = String(initialStatus || '').toUpperCase();
    if (workflow.states.indexOf(assignedStatus) === -1) throw new VmosValidationError_('Select an initial ' + workflow.label + ' status for this job.');
    this.jobs.update(jobId, { status: assignedStatus });
    this.appendEvent_(job, { eventType: 'WORKFLOW_ASSIGNED', previousStatus: job.status, newStatus: assignedStatus, workflowId: workflowId, notes: 'Workflow assigned for shop-floor control.' });
    job = this.jobs.get(jobId);
  }
  var token = this.tokenGenerator();
  if (!isValidOpaqueJobQrToken_(token)) throw new VmosConfigurationError_('Secure QR token generation failed. No token was created.');
  var record = this.qrTokens.create({ id: token, jobId: jobId, workflowId: workflowId, createdAt: this.clock(), createdBy: this.auditUser() });
  this.appendEvent_(job, { eventType: 'QR_ASSIGNED', workflowId: workflowId, notes: 'Shop-floor QR identifier assigned.' });
  return { job: this.toShopJob_(job, record), qrToken: record.id };
};

ShopFloorService_.prototype.resolveByQr = function (token) {
  var record = this.activeQr_(token), job = this.jobs.get(record.jobId);
  return this.toShopJob_(job, record);
};

ShopFloorService_.prototype.getJob = function (jobId) {
  var job = this.jobs.get(jobId), qr = this.qrTokens.findActiveByJobId(jobId)[0];
  if (!qr) throw new VmosConfigurationError_('Job ' + jobId + ' has not been configured for shop-floor QR access.');
  return this.toShopJob_(job, qr);
};

/** Builds a print model from an existing QR token; reprints never mint tokens. */
ShopFloorService_.prototype.getTravelerData = function (token) {
  var record = this.activeQr_(token);
  var job = this.jobs.get(record.jobId), shopJob = this.toShopJob_(job, record);
  return serializeVmosValue_({
    id: shopJob.id, jobId: shopJob.id, customerName: shopJob.customerName,
    partId: shopJob.partId, revision: shopJob.revision, dueDate: shopJob.dueDate,
    status: shopJob.status, quantity: shopJob.quantity, machine: shopJob.machine,
    program: shopJob.program, nextAction: shopJob.nextAction,
    qrImageUrl: getVmosQrImageUrl_(getShopFloorScanUrl_(record.id))
  });
};

ShopFloorService_.prototype.activeQr_ = function (token) {
  if (!isValidOpaqueJobQrToken_(token)) throw new VmosNotFoundError_('This QR code is invalid or no longer available.');
  try {
    var record = this.qrTokens.findByToken(String(token));
    if (!record || record.revokedAt) throw new VmosNotFoundError_('inactive');
    return record;
  } catch (error) {
    if (error && error.code === 'NOT_FOUND') throw new VmosNotFoundError_('This QR code is invalid or no longer available.');
    throw error;
  }
};

ShopFloorService_.prototype.assertQrScope_ = function (token, jobId) {
  var record = this.activeQr_(token);
  if (String(record.jobId) !== String(jobId)) throw new VmosNotFoundError_('This QR code is invalid or no longer available.');
  return record;
};

/** Lifecycle operations remain server-side until MOS-121 identity enforcement gates an admin endpoint. */
ShopFloorService_.prototype.revokeQr = function (token, reason) {
  var record = this.activeQr_(token), actor = this.auditUser();
  this.qrTokens.revoke(record.id, actor);
  this.appendEvent_(this.jobs.get(record.jobId), { eventType: 'QR_REVOKED', workflowId: record.workflowId, notes: reason || 'Shop-floor QR identifier revoked.' });
  return { jobId: record.jobId, state: 'REVOKED' };
};

ShopFloorService_.prototype.rotateQr = function (jobId, reason) {
  var self = this, lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var active = this.qrTokens.findActiveByJobId(jobId)[0];
    if (!active) throw new VmosNotFoundError_('No active QR code is available to replace.');
    var job = this.jobs.get(jobId), actor = this.auditUser(), token = this.tokenGenerator();
    if (!isValidOpaqueJobQrToken_(token)) throw new VmosConfigurationError_('Secure QR token generation failed. The existing token remains active.');
    this.qrTokens.revoke(active.id, actor);
    var replacement = this.qrTokens.create({ id: token, jobId: jobId, workflowId: active.workflowId, createdAt: this.clock(), createdBy: actor });
    self.appendEvent_(job, { eventType: 'QR_ROTATED', workflowId: active.workflowId, notes: reason || 'Shop-floor QR identifier replaced; the previous identifier remains revoked.' });
    return { job: this.toShopJob_(job, replacement), qrToken: replacement.id };
  } finally { lock.releaseLock(); }
};

ShopFloorService_.prototype.toShopJob_ = function (job, qr) {
  var customer = job.customerId ? new MvpService_('Customer').get(job.customerId) : {};
  var workflow = getShopWorkflow_(qr.workflowId);
  var transitions = String(job.status || '').toUpperCase() === 'BLOCKED' ? [] : getWorkflowTransitions_(qr.workflowId, job.status);
  return serializeVmosValue_({
    id: job.id, customerId: job.customerId, customerName: customer.name, partId: job.partId, revision: job.revision,
    dueDate: job.dueDate, status: job.status, operator: job.operator, machine: job.machine, program: job.program,
    quantity: job.quantity, workflowId: qr.workflowId, workflowLabel: workflow.label, workflowStates: workflow.states, allowedTransitions: transitions,
    nextAction: transitions.length ? transitions[0].replace(/_/g, ' ') : '', blocked: String(job.status || '').toUpperCase() === 'BLOCKED'
  });
};

ShopFloorService_.prototype.listEvents = function (jobId) {
  return this.events.listByJobId(jobId).sort(function (left, right) { return String(right.occurredAt || '').localeCompare(String(left.occurredAt || '')); });
};

ShopFloorService_.prototype.transition = function (jobId, targetStatus, commandId, notes, token) {
  var self = this;
  return this.withCommand_(jobId, commandId, token, function (job, qr) {
    var target = String(targetStatus || '').toUpperCase();
    if (getWorkflowTransitions_(qr.workflowId, job.status).indexOf(target) === -1) throw new VmosValidationError_('Transition from ' + job.status + ' to ' + target + ' is not allowed for this job.');
    self.jobs.update(jobId, { status: target });
    self.appendEvent_(job, { eventType: 'STATUS_CHANGED', previousStatus: job.status, newStatus: target, notes: notes || '', workflowId: qr.workflowId, commandId: commandId });
    return self.getJob(jobId);
  });
};

ShopFloorService_.prototype.reportProblem = function (jobId, payload, commandId, token) {
  var self = this, allowed = ['TOOL_FAILURE', 'MACHINE_ALARM', 'QUALITY', 'MATERIAL', 'PROGRAM', 'FIXTURE', 'WAITING_CUSTOMER', 'OTHER'];
  payload = payload || {};
  if (allowed.indexOf(payload.reason) === -1) throw new VmosValidationError_('A valid problem reason is required.');
  return this.withCommand_(jobId, commandId, token, function (job, qr) {
    if (String(job.status || '').toUpperCase() === 'COMPLETE') throw new VmosValidationError_('Completed work cannot be changed from the shop-floor QR workflow.');
    self.jobs.update(jobId, { status: 'BLOCKED' });
    self.appendEvent_(job, { eventType: 'STOP_PROBLEM', previousStatus: job.status, newStatus: 'BLOCKED', notes: payload.notes || '', problemType: payload.reason, responsibleParty: self.auditUser(), nextAction: payload.nextAction || 'Investigate ' + payload.reason.replace(/_/g, ' '), machine: payload.machine || job.machine, tool: payload.tool, program: payload.program || job.program, workflowId: qr.workflowId, commandId: commandId });
    return self.getJob(jobId);
  });
};

ShopFloorService_.prototype.resolveBlock = function (jobId, payload, commandId, token) {
  var self = this; payload = payload || {};
  return this.withCommand_(jobId, commandId, token, function (job, qr) {
    if (String(job.status || '').toUpperCase() !== 'BLOCKED') throw new VmosValidationError_('Only blocked jobs can be resolved.');
    var target = String(payload.nextStatus || '').toUpperCase();
    if (getShopWorkflow_(qr.workflowId).states.indexOf(target) === -1) throw new VmosValidationError_('Select a valid next production status to resolve this block.');
    self.jobs.update(jobId, { status: target });
    self.appendEvent_(job, { eventType: 'BLOCK_RESOLVED', previousStatus: 'BLOCKED', newStatus: target, notes: payload.notes || '', responsibleParty: self.auditUser(), nextAction: payload.nextAction || target.replace(/_/g, ' '), workflowId: qr.workflowId, commandId: commandId });
    return self.getJob(jobId);
  });
};

ShopFloorService_.prototype.withCommand_ = function (jobId, commandId, token, action) {
  if (!commandId) throw new VmosValidationError_('Command ID is required.');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var qr=this.assertQrScope_(token,jobId),duplicate = this.events.listByJobId(jobId).filter(function (event) { return event.commandId === commandId; })[0];
    if (duplicate) return this.getJob(jobId);
    var job = this.jobs.get(jobId);
    return action(job, qr);
  } finally { lock.releaseLock(); }
};

ShopFloorService_.prototype.appendEvent_ = function (job, values) {
  var now = this.clock();
  return this.events.append({ id: 'EVT-' + Utilities.getUuid().toUpperCase(), jobId: job.id, eventType: values.eventType, occurredAt: now, actor: this.auditUser(), previousStatus: values.previousStatus || '', newStatus: values.newStatus || '', notes: values.notes || '', problemType: values.problemType || '', responsibleParty: values.responsibleParty || '', nextAction: values.nextAction || '', expectedResolution: values.expectedResolution || '', machine: values.machine || '', tool: values.tool || '', program: values.program || '', workflowId: values.workflowId || '', workflowVersion: '1', commandId: values.commandId || '' });
};

/**
 * A controlled QR renderer is optional. The renderer receives only the opaque
 * VMOS scan URL, never customer or job data. Leave this property unset to
 * render the printable recovery message instead of contacting a third party.
 */
function getVmosQrImageUrl_(scanUrl) {
  var endpoint = PropertiesService.getScriptProperties().getProperty('VMOS_QR_IMAGE_ENDPOINT');
  return endpoint ? endpoint + encodeURIComponent(scanUrl) : '';
}

function getShopFloorScanUrl_(token) {
  var url = ScriptApp.getService().getUrl() || PropertiesService.getScriptProperties().getProperty('VMOS_WEB_APP_URL');
  if (!url) throw new VmosConfigurationError_('Deploy the VMOS web app before printing a QR traveler.');
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'shop=1&qr=' + encodeURIComponent(token);
}
