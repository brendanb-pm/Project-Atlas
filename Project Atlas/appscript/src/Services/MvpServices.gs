function MvpService(entityName, dependencies) { dependencies=dependencies||{}; this.entityName = entityName; this.config = getVmosConfig_(); this.definition = this.config.mapping[entityName]; this.repository = dependencies.repository||createRepository_(entityName); this.auditUser=dependencies.auditUser||getVmosAuditUser_; }
MvpService.prototype.list = function () { return this.repository.list(); };
MvpService.prototype.get = function (id) { return this.repository.findById(id); };
MvpService.prototype.update = function (id, changes) {
  if (!id) throw new VmosValidationError('Record ID is required.');
  changes = changes || {};
  if (Object.prototype.hasOwnProperty.call(changes, 'id')) throw new VmosValidationError('Primary key cannot be changed.');
  ['createdBy','updatedBy','createdAt'].forEach(function(key){if(Object.prototype.hasOwnProperty.call(changes,key))delete changes[key];});
  var existing = this.get(id), proposed = {};
  Object.keys(existing).forEach(function (key) { proposed[key] = existing[key]; });
  Object.keys(changes).forEach(function (key) { proposed[key] = changes[key]; });
  validateEntityInput_(this.definition, proposed); this.validateRelationships_(proposed);
  if (this.definition.fields.updatedAt) changes.updatedAt = new Date();
  if (this.definition.fields.updatedBy) changes.updatedBy = this.auditUser();
  return this.repository.updateById(id, changes);
};
MvpService.prototype.create = function (input) {
  input = input || {};
  // HTML forms submit blank optional controls. Remove them before validating the
  // workbook mapping so an unused optional field does not require a header.
  Object.keys(input).forEach(function (key) { if (input[key] === '') delete input[key]; });
  this.applyWorkflowDefaults_(input); validateEntityInput_(this.definition, input); this.validateRelationships_(input);
  var now = new Date();
  input.id = generateVmosId_(this.definition.idPrefix, this.repository);
  if (this.definition.fields.createdAt) input.createdAt = now;
  if (this.definition.fields.updatedAt) input.updatedAt = now;
  if (this.definition.fields.createdBy) input.createdBy = this.auditUser();
  if (this.definition.fields.updatedBy) input.updatedBy = this.auditUser();
  if (this.definition.fields.status && !input.status) input.status = this.defaultStatus_();
  return this.repository.insert(input);
};
MvpService.prototype.defaultStatus_ = function () { return { Customer: 'Active', RFQ: 'Received', Quote: 'Draft', Job: 'Planned', Invoice: 'Draft' }[this.entityName]; };
MvpService.prototype.applyWorkflowDefaults_ = function (input) {
  if (this.entityName === 'Quote' && input.rfqId) { var rfq = new MvpService('RFQ').get(input.rfqId); if (!input.customerId) input.customerId = rfq.customerId; if (!input.quoteDate) input.quoteDate = new Date(); }
  if (this.entityName === 'Job' && input.quoteId) { var quote = new MvpService('Quote').get(input.quoteId); if (!input.customerId) input.customerId = quote.customerId; }
  if (this.entityName === 'Invoice' && input.jobId) { var job = new MvpService('Job').get(input.jobId); if (!input.customerId) input.customerId = job.customerId; if (!input.invoiceDate) input.invoiceDate = new Date(); }
};
MvpService.prototype.validateRelationships_ = function (input) {
  if (input.customerId) new MvpService('Customer').get(input.customerId);
  if (this.entityName === 'Quote' && input.rfqId) { var rfq = new MvpService('RFQ').get(input.rfqId); if (rfq.customerId !== input.customerId) throw new VmosValidationError('Quote customer must match its RFQ customer.'); }
  if (this.entityName === 'Job' && input.quoteId) { var quote = new MvpService('Quote').get(input.quoteId); if (quote.customerId !== input.customerId) throw new VmosValidationError('Job customer must match its quote customer.'); }
  if (this.entityName === 'Invoice' && input.jobId) { var job = new MvpService('Job').get(input.jobId); if (job.customerId !== input.customerId) throw new VmosValidationError('Invoice customer must match its job customer.'); }
};
function CustomerService() { return new MvpService('Customer'); }
function RFQService() { return new MvpService('RFQ'); }
function QuoteService() { return new MvpService('Quote'); }
function JobService() { return new MvpService('Job'); }
function InvoiceService() { return new MvpService('Invoice'); }

function getVmosAuditUser_() {
  return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'VMOS';
}
