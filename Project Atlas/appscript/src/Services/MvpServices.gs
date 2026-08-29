function MvpService_(entityName, dependencies) { dependencies=dependencies||{}; this.entityName = entityName; this.config = getVmosConfig_(); this.definition = this.config.mapping[entityName]; this.repository = dependencies.repository||createRepository_(entityName); this.auditUser=dependencies.auditUser||getVmosAuditUser_; this.mutationProof=dependencies.mutationProof||null; }
MvpService_.prototype.list = function () { return this.repository.list(); };
MvpService_.prototype.get = function (id) { return this.repository.findById(id); };
MvpService_.prototype.findFirstByField = function (field, value) { var criteria={};criteria[field]=value;if(this.repository.findFirstByFields)return this.repository.findFirstByFields(criteria);return this.list().filter(function(row){return String(row[field])===String(value);})[0]; };
MvpService_.prototype.listByField = function (field, value, limit) { var maximum=Math.min(100,Math.max(1,Number(limit||25)));return this.list().filter(function(row){return String(row[field])===String(value);}).slice(0,maximum); };
MvpService_.prototype.update = function (id, changes) {
  if (!id) throw new VmosValidationError_('Record ID is required.');
  changes = changes || {};
  if (Object.prototype.hasOwnProperty.call(changes, 'id')) throw new VmosValidationError_('Primary key cannot be changed.');
  ['createdBy','updatedBy','createdAt'].forEach(function(key){if(Object.prototype.hasOwnProperty.call(changes,key))delete changes[key];});
  var existing = this.get(id), proposed = {};
  Object.keys(existing).forEach(function (key) { proposed[key] = existing[key]; });
  Object.keys(changes).forEach(function (key) { proposed[key] = changes[key]; });
  validateEntityInput_(this.definition, proposed); this.validateRelationships_(proposed,existing);
  if (this.definition.fields.updatedAt) changes.updatedAt = new Date();
  if (this.definition.fields.updatedBy) changes.updatedBy = this.auditUser();
  this.applySecurityProof_(changes);
  return this.repository.updateById(id, changes);
};
MvpService_.prototype.allocateId = function () { return generateVmosId_(this.definition.idPrefix, this.repository); };
MvpService_.prototype.create = function (input, resourceId) {
  input = input || {};
  // HTML forms submit blank optional controls. Remove them before validating the
  // workbook mapping so an unused optional field does not require a header.
  Object.keys(input).forEach(function (key) { if (input[key] === '') delete input[key]; });
  this.applyWorkflowDefaults_(input); validateEntityInput_(this.definition, input); this.validateRelationships_(input,null);
  var now = new Date();
  input.id = resourceId || this.allocateId();
  if (this.definition.fields.createdAt) input.createdAt = now;
  if (this.definition.fields.updatedAt) input.updatedAt = now;
  if (this.definition.fields.createdBy) input.createdBy = this.auditUser();
  if (this.definition.fields.updatedBy) input.updatedBy = this.auditUser();
  this.applySecurityProof_(input);
  if (this.definition.fields.status && !input.status) input.status = this.defaultStatus_();
  return this.repository.insertUnique?this.repository.insertUnique(input):this.repository.insert(input);
};
MvpService_.prototype.applySecurityProof_=function(target){var proof=typeof this.mutationProof==='function'?this.mutationProof():this.mutationProof;if(!proof)return;var fields=this.definition.fields||{};if(fields.securityOperationId)target.securityOperationId=proof.operationId;if(fields.securityOperationFingerprint)target.securityOperationFingerprint=proof.fingerprint;if(fields.securityTenantId)target.securityTenantId=proof.tenantId;if(fields.securityActorId)target.securityActorId=proof.actorId;};
MvpService_.prototype.securityProof_=function(){return typeof this.mutationProof==='function'?this.mutationProof():this.mutationProof||{};};
MvpService_.prototype.defaultStatus_ = function () { return { Customer: 'Active', RFQ: 'Received', Quote: 'Draft', Job: 'Planned', Invoice: 'Draft' }[this.entityName]; };
MvpService_.prototype.applyWorkflowDefaults_ = function (input) {
  if (this.entityName === 'Quote' && input.rfqId) { var rfq = new MvpService_('RFQ').get(input.rfqId); if (!input.customerId) input.customerId = rfq.customerId; if (!input.quoteDate) input.quoteDate = new Date(); }
  if (this.entityName === 'Job' && input.quoteId) { var quote = new MvpService_('Quote').get(input.quoteId); if (!input.customerId) input.customerId = quote.customerId; }
  if (this.entityName === 'Invoice' && input.jobId) { var job = new MvpService_('Job').get(input.jobId); if (!input.customerId) input.customerId = job.customerId; if (!input.invoiceDate) input.invoiceDate = new Date(); }
};
MvpService_.prototype.validateRelationships_ = function (input,existing) {
  var customer=input.customerId?new MvpService_('Customer').get(input.customerId):null,quote=null,asset=null,proof=this.securityProof_();
  if (this.entityName === 'Quote' && input.rfqId) { var rfq = new MvpService_('RFQ').get(input.rfqId); if (rfq.customerId !== input.customerId) throw new VmosValidationError_('Quote customer must match its RFQ customer.'); }
  if (this.entityName === 'Job' && input.quoteId) { quote = new MvpService_('Quote').get(input.quoteId); if (quote.customerId !== input.customerId) throw new VmosValidationError_('Job customer must match its quote customer.'); }
  if(this.entityName==='Job'&&input.assetId)asset=new MvpService_('Asset').get(input.assetId);
  if(this.entityName==='Job'&&typeof validateAtlasJobContract_==='function'){
    var before=existing&&typeof atlasJobClassification_==='function'?atlasJobClassification_(existing):'';
    var after=validateAtlasJobContract_(input,{tenantId:proof.tenantId||input.securityTenantId,customer:customer,quote:quote,asset:asset,existing:existing});
    if(before&&before!==after)throw new VmosConflictError('Job classification cannot be changed after creation. Create a corrected Job without rewriting commercial or operational history.');
  }
  if (this.entityName === 'Invoice' && input.jobId) { var job = new MvpService_('Job').get(input.jobId); if (job.customerId !== input.customerId) throw new VmosValidationError_('Invoice customer must match its job customer.'); }
};
function CustomerService_() { return new MvpService_('Customer'); }
function RFQService_() { return new MvpService_('RFQ'); }
function QuoteService_() { return new MvpService_('Quote'); }
function JobService_() { return new MvpService_('Job'); }
function AssetRecordService_() { return new MvpService_('Asset'); }
function InvoiceService_() { return new MvpService_('Invoice'); }
function MvpLifecycleService_(entityName,actor){this.service=new MvpService_(entityName,{auditUser:function(){return actor;}});}
MvpLifecycleService_.prototype.transition=function(id,fromStatus,toStatus){var record=this.service.get(id);if(record.status!==fromStatus)throw new VmosConflictError('Record status changed. Refresh and try again.');return this.service.update(id,{status:toStatus});};

function getVmosAuditUser_() {
  return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'VMOS';
}
