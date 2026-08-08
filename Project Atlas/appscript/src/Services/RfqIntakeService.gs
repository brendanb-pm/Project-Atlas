/** Disabled-by-default proposal intake. Providers and staging are injectable for safe tests. */
function RfqIntakeService(dependencies) {
  dependencies = dependencies || {};
  this.enabled = dependencies.enabled || function () { return PropertiesService.getScriptProperties().getProperty('VMOS_RFQ_INTAKE_ENABLED') === 'true'; };
  this.gmail = dependencies.gmail; this.ai = dependencies.ai; this.staging = dependencies.staging;
  this.matcher = dependencies.matcher || { match: function () { return { company: { classification: 'UNCERTAIN' }, contact: { classification: 'UNCERTAIN' }, parts: [] }; } };
  this.documents = dependencies.documents || { stage: function (attachment) { return { name: attachment.name, status: 'STAGED' }; } };
}
RfqIntakeService.prototype.poll = function () {
  if (!this.enabled()) return { enabled: false, processed: 0, proposals: [] };
  if (!this.gmail || !this.ai || !this.staging) throw new VmosConfigurationError('RFQ Intake providers and staging storage must be configured before polling.');
  var self = this, messages = this.gmail.listCandidateMessages() || [], created = [];
  messages.forEach(function (message) {
    var existing = self.staging.findByMessageOrThread(message.messageId, message.threadId);
    if (existing && existing.status !== 'RETRYABLE_FAILURE') return;
    if (existing && existing.retryCount >= 3) { existing.status = 'NEEDS_ATTENTION'; existing.audit.push({ type: 'RETRY_LIMIT_REACHED', at: new Date() }); self.staging.save(existing); return; }
    try {
      var extracted = validateRfqIntakeProposal_(self.ai.extract(message));
      var attachments = (message.attachments || []).map(function (attachment) { return self.documents.stage(attachment); });
      var record = { id: 'INTAKE-' + Utilities.getUuid().toUpperCase(), status: 'PENDING_REVIEW', messageId: message.messageId, threadId: message.threadId, receivedAt: message.receivedAt || new Date(), source: 'GMAIL', senderName: message.senderName || '', senderEmail: message.senderEmail || '', subject: message.subject || '', attachmentCount: attachments.length, aiConfidence: extracted.confidence, warningCount: extracted.warnings.length, reviewedBy: '', reviewedAt: '', approvedBy: '', approvedAt: '', rejectionReason: '', proposal: extracted, match: self.matcher.match(extracted), attachments: attachments, retryCount: 0, audit: [{ type: 'AI_PROPOSED', at: new Date() }] };
      self.staging.insert(record); created.push(record);
    } catch (error) { var failed = existing || { id: 'INTAKE-' + Utilities.getUuid().toUpperCase(), messageId: message.messageId, threadId: message.threadId, audit: [] }; failed.status = 'RETRYABLE_FAILURE'; failed.error = error.message; failed.retryCount = (failed.retryCount || 0) + 1; failed.audit.push({ type: 'EXTRACTION_FAILED', at: new Date() }); if (existing) self.staging.save(failed); else self.staging.insert(failed); }
  });
  return { enabled: true, processed: messages.length, proposals: created };
};
RfqIntakeService.prototype.listPending = function () { return this.staging.listByStatus('PENDING_REVIEW'); };
RfqIntakeService.prototype.reject = function (id, note, reviewer) { var record = this.staging.get(id); if (record.status === 'REJECTED') return record; record.status = 'REJECTED'; record.rejectionReason = note || ''; record.reviewedBy = reviewer || ''; record.reviewedAt = new Date(); record.audit.push({ type: 'REJECTED', note: note || '', at: new Date() }); return this.staging.save(record); };
RfqIntakeService.prototype.approve = function (id, correctedProposal) {
  if (!this.enabled()) throw new VmosConfigurationError('RFQ Intake is disabled. No production record was created.');
  var record = this.staging.get(id); if (record.status === 'APPROVED_FOR_PLAN') return record.result;
  if (record.status !== 'PENDING_REVIEW') throw new VmosValidationError('Only a pending intake proposal can be approved.');
  var proposal = validateRfqIntakeProposal_(correctedProposal || record.proposal);
  record.status = 'APPROVED_FOR_PLAN'; record.reviewedAt = new Date(); record.approvedAt = new Date(); record.proposal = proposal; record.result = buildRfqApprovalPlan_(proposal, record.match); record.audit.push({ type: 'HUMAN_CONFIRMED_APPROVAL_PLAN', at: new Date() }); this.staging.save(record); return record.result;
};
function validateRfqIntakeProposal_(proposal) {
  proposal = proposal || {};
  if (!proposal.description || typeof proposal.description !== 'string') throw new VmosValidationError('AI proposal requires a text description.');
  if (proposal.customerId !== undefined && typeof proposal.customerId !== 'string') throw new VmosValidationError('Customer ID must be a string when supplied.');
  if (proposal.dueDate !== undefined && isNaN(new Date(proposal.dueDate).getTime())) throw new VmosValidationError('Due date must be a valid date when supplied.');
  if (proposal.parts !== undefined && !Array.isArray(proposal.parts)) throw new VmosValidationError('Parts must be an array.');
  var parts = (proposal.parts || []).map(function (part) { if (!part.partNumber) throw new VmosValidationError('Every part requires an exact part number.'); return { partNumber: String(part.partNumber), revision: part.revision || '', description: part.description || '', material: part.material || '', processes: part.processes || [], supplier: part.supplier === 'VITALITY' ? 'VITALITY' : 'CUSTOMER', customerSuppliedComponents: part.customerSuppliedComponents || [], quantities: part.quantities || [], confidence: part.confidence || {} }; });
  return { company: proposal.company || { name: proposal.customerName || '' }, contact: proposal.contact || {}, description: proposal.description.trim(), customerRfqNumber: proposal.customerRfqNumber || '', requestedDelivery: proposal.requestedDelivery || proposal.dueDate || '', requestedQuantities: proposal.requestedQuantities || [], parts: parts, documents: proposal.documents || [], documentPartAssociations: proposal.documentPartAssociations || [], warnings: proposal.warnings || [], notes: proposal.notes || '', confidence: Number(proposal.confidence || 0), fieldConfidence: proposal.fieldConfidence || {} };
}
function buildRfqApprovalPlan_(proposal, match) { return { company: planClassification_(proposal.company, match && match.company), contact: planClassification_(proposal.contact, match && match.contact), parts: proposal.parts.map(function (part, index) { return planClassification_(part, match && match.parts && match.parts[index]); }), documents: proposal.documents.map(function (document) { return { status: 'MISSING', proposed: document }; }), rfq: { status: proposal.description ? 'NEW' : 'MISSING', proposed: { description: proposal.description, customerRfqNumber: proposal.customerRfqNumber, requestedDelivery: proposal.requestedDelivery } }, warnings: proposal.warnings }; }
function planClassification_(proposed, match) { return { status: (match && ['EXISTING', 'NEW', 'UNCERTAIN', 'MISSING'].indexOf(match.classification) !== -1) ? match.classification : (proposed && Object.keys(proposed).length ? 'NEW' : 'MISSING'), proposed: proposed || {}, match: match || null }; }
/** Future voice/upload/manual sources use this same proposal shape and approval gate. */
function VmosProposalProvider() {}
