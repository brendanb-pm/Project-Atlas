/**
 * Spend-control domain service. No generic update API is provided: callers can
 * submit a request, approve an over-threshold request, and attach one receipt.
 */
function PurchaseApprovalService_(repository, config, auditUser, lock, idGenerator, mutationProof, vendors, context) {
  this.config = config || getPurchaseApprovalConfig_();
  this.repository = repository || new PurchaseApprovalRepository_(this.config);
  this.auditUser = auditUser || getVmosAuditUser_;
  this.authoritativeAudit = typeof auditUser === 'function';
  this.lock=lock||null;
  this.idGenerator=idGenerator||newPurchaseApprovalId_;
  this.mutationProof=mutationProof||null;
  this.vendors=vendors||null;
  this.context=context||null;
}

PurchaseApprovalService_.prototype.list = function () { return this.repository.list(); };
PurchaseApprovalService_.prototype.get = function (id) { return this.repository.findById(id); };
PurchaseApprovalService_.prototype.vendor_=function(vendorId){requireValue_(vendorId,'Vendor selection');if(!this.vendors||!this.context)throw new VmosConfigurationError_('Canonical Vendor validation is unavailable.');var vendor=this.vendors.get(vendorId);if(!vendor||String(vendor.tenantId)!==String(this.context.tenantId))throw new VmosAuthorizationError_('Vendor is unavailable.');if(String(vendor.status||'ACTIVE').toUpperCase()!=='ACTIVE')throw new VmosValidationError_('Choose an active Vendor.');return vendor;};

PurchaseApprovalService_.prototype.submit = function (input) {
  input = input || {};
  var auditActor=this.auditUser(), authoritativeRequester=this.authoritativeAudit?auditActor:input.requester;
  requireValue_(authoritativeRequester, 'Requester');
  var vendor=this.vendor_(input.vendorId);
  requireValue_(input.category, 'Category');
  requireValue_(input.classification, 'Classification');
  requireValue_(input.businessJustification, 'Business justification');
  requireValue_(input.expectedRoiNeed, 'Expected ROI / need');
  requireValue_(input.description, 'Description');
  requireValue_(input.amount, 'Amount');
  optionalNumber_(input.amount, 'Amount');
  var amount = Number(input.amount);
  if (amount <= 0) throw new VmosValidationError_('Amount must be greater than zero.');
  var classification = String(input.classification).trim().toUpperCase();
  if (['JOB', 'CAPEX', 'OVERHEAD'].indexOf(classification) === -1) throw new VmosValidationError_('Classification must be Job, CapEx, or Overhead.');
  var actualPurchaseAmount = normalizeActualPurchaseAmount_(input.actualPurchaseAmount);
  var now = new Date(), requiresApproval = amount > this.config.threshold;
  var record={
    id: this.idGenerator(), requestDate: now, requester: String(authoritativeRequester).trim(), vendorId:vendor.id, vendor:String(vendor.name).trim(),
    category: String(input.category).trim(), classification: classification, businessJustification: String(input.businessJustification).trim(),
    expectedRoiNeed: String(input.expectedRoiNeed).trim(), description: String(input.description).trim(), amount: amount, actualPurchaseAmount: actualPurchaseAmount,
    status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED_NO_APPROVAL_REQUIRED', approvalRequired: requiresApproval,
    approver: '', approvedAt: '', receiptReference: input.receiptReference ? String(input.receiptReference).trim() : '',
    notes: input.notes ? String(input.notes).trim() : '', createdAt: now, updatedAt: now,
    createdBy: auditActor, updatedBy: auditActor
  },proof=typeof this.mutationProof==='function'?this.mutationProof():this.mutationProof;
  if(proof){record.securityOperationId=proof.operationId;record.securityOperationFingerprint=proof.fingerprint;record.securityTenantId=proof.tenantId;record.securityActorId=proof.actorId;}else if(this.context){record.securityTenantId=this.context.tenantId;record.securityActorId=auditActor;}
  return this.repository.create(record);
};

PurchaseApprovalService_.prototype.associateVendor=function(id,vendorId){return this.withMutationLock_(function(){var request=this.get(id);if(!request.securityTenantId||String(request.securityTenantId)!==String(this.context&&this.context.tenantId))throw new VmosAuthorizationError_('Purchase request is unavailable.');if(request.status!=='PENDING_APPROVAL')throw new VmosValidationError_('Vendor changes are limited to purchase requests still pending approval.');if(request.receiptReference)throw new VmosValidationError_('Vendor cannot be changed after receipt evidence is recorded.');var vendor=this.vendor_(vendorId),actor=this.auditUser();return this.repository.updateById(id,{vendorId:vendor.id,vendor:vendor.name,updatedAt:new Date(),updatedBy:actor});}.bind(this));};

PurchaseApprovalService_.prototype.approve = function (id, approver, notes) {
  return this.withMutationLock_(function(){
  var request = this.get(id);
  if (this.authoritativeAudit) approver = this.auditUser();
  requireValue_(approver, 'Approver');
  var normalizedApprover = String(approver).trim();
  if (request.status !== 'PENDING_APPROVAL' || request.approvalRequired !== true) {
    throw new VmosValidationError_('Only pending over-threshold purchase requests can be approved.');
  }
  if (samePurchaseActor_(request.requester, normalizedApprover)) {
    throw new VmosValidationError_('Requester and approver must be different for an over-threshold purchase request.');
  }
  var now = new Date();
  var changes = { status: 'APPROVED', approver: normalizedApprover, approvedAt: now, updatedAt: now, updatedBy: normalizedApprover };
  if (notes !== undefined && notes !== null && String(notes).trim() !== '') changes.notes = String(notes).trim();
  return this.repository.updateById(id, changes);
  }.bind(this));
};

PurchaseApprovalService_.prototype.recordReceipt = function (id, receiptReference, actualPurchaseAmount, actor) {
  return this.withMutationLock_(function(){
  var request = this.get(id);
  requireValue_(receiptReference, 'Receipt reference');
  if (['APPROVED', 'APPROVED_NO_APPROVAL_REQUIRED'].indexOf(request.status) === -1) {
    throw new VmosValidationError_('A receipt can only be recorded after the purchase request is approved.');
  }
  var reference = String(receiptReference).trim();
  if (request.receiptReference && String(request.receiptReference) !== reference) {
    throw new VmosValidationError_('Receipt reference is already recorded and cannot be replaced.');
  }
  if (request.receiptReference) return request;
  var authoritativeActor=this.auditUser(); requireValue_(authoritativeActor, 'Receipt recorder');
  var changes = { receiptReference: reference, updatedAt: new Date(), updatedBy: String(authoritativeActor).trim() };
  var actual = normalizeActualPurchaseAmount_(actualPurchaseAmount);
  if (actual !== '') changes.actualPurchaseAmount = actual;
  return this.repository.updateById(id, changes);
  }.bind(this));
};
PurchaseApprovalService_.prototype.withMutationLock_=function(operation){if(!this.lock)return operation();this.lock.waitLock(10000);try{return operation();}finally{this.lock.releaseLock();}};

function newPurchaseApprovalId_() { return 'PUR-' + Utilities.getUuid().toUpperCase(); }
function samePurchaseActor_(left, right) { return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase(); }
function normalizeActualPurchaseAmount_(value) {
  if (value === undefined || value === null || value === '') return '';
  optionalNumber_(value, 'Actual purchase amount');
  if (Number(value) <= 0) throw new VmosValidationError_('Actual purchase amount must be greater than zero.');
  return Number(value);
}
