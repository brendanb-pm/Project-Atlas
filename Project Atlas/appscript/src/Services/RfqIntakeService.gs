/** Disabled-by-default proposal intake. Providers and staging are injectable for safe tests. */
function RfqIntakeService(dependencies) {
  dependencies = dependencies || {};
  this.enabled = dependencies.enabled || function () { return PropertiesService.getScriptProperties().getProperty('VMOS_RFQ_INTAKE_ENABLED') === 'true'; };
  this.gmail = dependencies.gmail; this.ai = dependencies.ai; this.staging = dependencies.staging;
  this.rfqs = dependencies.rfqs; this.matcher = dependencies.matcher || { match: function () { return { classification: 'UNCERTAIN', candidates: [] }; } };
  this.documents = dependencies.documents || { stage: function (attachment) { return { name: attachment.name, status: 'STAGED' }; } };
}
RfqIntakeService.prototype.poll = function () {
  if (!this.enabled()) return { enabled: false, processed: 0, proposals: [] };
  if (!this.gmail || !this.ai || !this.staging) throw new VmosConfigurationError('RFQ Intake providers and staging storage must be configured before polling.');
  var self = this, messages = this.gmail.listCandidateMessages() || [], created = [];
  messages.forEach(function (message) {
    if (self.staging.findByMessageOrThread(message.messageId, message.threadId)) return;
    try {
      var extracted = validateRfqIntakeProposal_(self.ai.extract(message));
      var record = { id: 'INTAKE-' + Utilities.getUuid().toUpperCase(), status: 'PENDING_REVIEW', messageId: message.messageId, threadId: message.threadId, receivedAt: message.receivedAt || new Date(), source: 'GMAIL', proposal: extracted, match: self.matcher.match(extracted), attachments: (message.attachments || []).map(function (attachment) { return self.documents.stage(attachment); }), audit: [{ type: 'AI_PROPOSED', at: new Date() }] };
      self.staging.insert(record); created.push(record);
    } catch (error) { self.staging.insert({ id: 'INTAKE-' + Utilities.getUuid().toUpperCase(), status: 'RETRYABLE_FAILURE', messageId: message.messageId, threadId: message.threadId, error: error.message, audit: [{ type: 'EXTRACTION_FAILED', at: new Date() }] }); }
  });
  return { enabled: true, processed: messages.length, proposals: created };
};
RfqIntakeService.prototype.listPending = function () { return this.staging.listByStatus('PENDING_REVIEW'); };
RfqIntakeService.prototype.reject = function (id, note) { var record = this.staging.get(id); if (record.status === 'REJECTED') return record; record.status = 'REJECTED'; record.audit.push({ type: 'REJECTED', note: note || '', at: new Date() }); return this.staging.save(record); };
RfqIntakeService.prototype.approve = function (id, correctedProposal) {
  if (!this.enabled()) throw new VmosConfigurationError('RFQ Intake is disabled. No production RFQ was created.');
  var record = this.staging.get(id); if (record.status === 'APPROVED') return record.result;
  if (record.status !== 'PENDING_REVIEW') throw new VmosValidationError('Only a pending intake proposal can be approved.');
  var proposal = validateRfqIntakeProposal_(correctedProposal || record.proposal);
  if (!this.rfqs) throw new VmosConfigurationError('RFQ service is not configured. No production RFQ was created.');
  var created = this.rfqs.create({ customerId: proposal.customerId, description: proposal.description, dueDate: proposal.dueDate, notes: proposal.notes || '' });
  record.status = 'APPROVED'; record.result = { rfqId: created.id }; record.proposal = proposal; record.audit.push({ type: 'HUMAN_APPROVED_AND_CREATED', at: new Date() }); this.staging.save(record); return record.result;
};
function validateRfqIntakeProposal_(proposal) {
  proposal = proposal || {};
  if (!proposal.description || typeof proposal.description !== 'string') throw new VmosValidationError('AI proposal requires a text description.');
  if (proposal.customerId !== undefined && typeof proposal.customerId !== 'string') throw new VmosValidationError('Customer ID must be a string when supplied.');
  if (proposal.dueDate !== undefined && isNaN(new Date(proposal.dueDate).getTime())) throw new VmosValidationError('Due date must be a valid date when supplied.');
  return { customerId: proposal.customerId || '', customerName: proposal.customerName || '', description: proposal.description.trim(), dueDate: proposal.dueDate || '', notes: proposal.notes || '', confidence: Number(proposal.confidence || 0) };
}
/** Future voice/upload/manual sources use this same proposal shape and approval gate. */
function VmosProposalProvider() {}
