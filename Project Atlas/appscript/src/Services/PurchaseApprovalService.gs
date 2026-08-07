/**
 * Spend-control domain service. No generic update API is provided: callers can
 * submit a request, approve an over-threshold request, and attach one receipt.
 */
function PurchaseApprovalService(repository, config) {
  this.config = config || getPurchaseApprovalConfig_();
  this.repository = repository || new PurchaseApprovalRepository(this.config);
}

PurchaseApprovalService.prototype.list = function () { return this.repository.list(); };
PurchaseApprovalService.prototype.get = function (id) { return this.repository.findById(id); };

PurchaseApprovalService.prototype.submit = function (input) {
  input = input || {};
  requireValue_(input.requester, 'Requester');
  requireValue_(input.vendor, 'Vendor');
  requireValue_(input.category, 'Category');
  requireValue_(input.classification, 'Classification');
  requireValue_(input.businessJustification, 'Business justification');
  requireValue_(input.expectedRoiNeed, 'Expected ROI / need');
  requireValue_(input.description, 'Description');
  requireValue_(input.amount, 'Amount');
  optionalNumber_(input.amount, 'Amount');
  var amount = Number(input.amount);
  if (amount <= 0) throw new VmosValidationError('Amount must be greater than zero.');
  var classification = String(input.classification).trim().toUpperCase();
  if (['JOB', 'CAPEX', 'OVERHEAD'].indexOf(classification) === -1) throw new VmosValidationError('Classification must be Job, CapEx, or Overhead.');
  var actualPurchaseAmount = normalizeActualPurchaseAmount_(input.actualPurchaseAmount);
  var now = new Date(), requiresApproval = amount > this.config.threshold;
  return this.repository.create({
    id: newPurchaseApprovalId_(), requestDate: now, requester: String(input.requester).trim(), vendor: String(input.vendor).trim(),
    category: String(input.category).trim(), classification: classification, businessJustification: String(input.businessJustification).trim(),
    expectedRoiNeed: String(input.expectedRoiNeed).trim(), description: String(input.description).trim(), amount: amount, actualPurchaseAmount: actualPurchaseAmount,
    status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED_NO_APPROVAL_REQUIRED', approvalRequired: requiresApproval,
    approver: '', approvedAt: '', receiptReference: input.receiptReference ? String(input.receiptReference).trim() : '',
    notes: input.notes ? String(input.notes).trim() : '', createdAt: now, updatedAt: now,
    createdBy: getVmosAuditUser_(), updatedBy: getVmosAuditUser_()
  });
};

PurchaseApprovalService.prototype.approve = function (id, approver, notes) {
  var request = this.get(id);
  requireValue_(approver, 'Approver');
  var normalizedApprover = String(approver).trim();
  if (request.status !== 'PENDING_APPROVAL' || request.approvalRequired !== true) {
    throw new VmosValidationError('Only pending over-threshold purchase requests can be approved.');
  }
  if (samePurchaseActor_(request.requester, normalizedApprover)) {
    throw new VmosValidationError('Requester and approver must be different for an over-threshold purchase request.');
  }
  var now = new Date();
  var changes = { status: 'APPROVED', approver: normalizedApprover, approvedAt: now, updatedAt: now, updatedBy: normalizedApprover };
  if (notes !== undefined && notes !== null && String(notes).trim() !== '') changes.notes = String(notes).trim();
  return this.repository.updateById(id, changes);
};

PurchaseApprovalService.prototype.recordReceipt = function (id, receiptReference, actualPurchaseAmount, actor) {
  var request = this.get(id);
  requireValue_(receiptReference, 'Receipt reference');
  if (['APPROVED', 'APPROVED_NO_APPROVAL_REQUIRED'].indexOf(request.status) === -1) {
    throw new VmosValidationError('A receipt can only be recorded after the purchase request is approved.');
  }
  var reference = String(receiptReference).trim();
  if (request.receiptReference && String(request.receiptReference) !== reference) {
    throw new VmosValidationError('Receipt reference is already recorded and cannot be replaced.');
  }
  if (request.receiptReference) return request;
  requireValue_(actor || getVmosAuditUser_(), 'Receipt recorder');
  var changes = { receiptReference: reference, updatedAt: new Date(), updatedBy: String(actor || getVmosAuditUser_()).trim() };
  var actual = normalizeActualPurchaseAmount_(actualPurchaseAmount);
  if (actual !== '') changes.actualPurchaseAmount = actual;
  return this.repository.updateById(id, changes);
};

function newPurchaseApprovalId_() { return 'PUR-' + Utilities.getUuid().toUpperCase(); }
function samePurchaseActor_(left, right) { return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase(); }
function normalizeActualPurchaseAmount_(value) {
  if (value === undefined || value === null || value === '') return '';
  optionalNumber_(value, 'Actual purchase amount');
  if (Number(value) <= 0) throw new VmosValidationError('Actual purchase amount must be greater than zero.');
  return Number(value);
}
