/** Dedicated repository wrapper; it does not initialize, alter, or create sheets. */
function PurchaseApprovalRepository(config) {
  this.config = config || getPurchaseApprovalConfig_();
  this.repository = new SheetsRepository('PurchaseApproval', this.config.mapping, SpreadsheetApp.openById(this.config.spreadsheetId));
}
PurchaseApprovalRepository.prototype.list = function () { return this.repository.list(); };
PurchaseApprovalRepository.prototype.findById = function (id) { return this.repository.findById(id); };
PurchaseApprovalRepository.prototype.create = function (record) {
  if (!record || !record.id) throw new VmosValidationError('Purchase request ID is required.');
  return this.repository.insert(record);
};
PurchaseApprovalRepository.prototype.updateById = function (id, changes) {
  if (Object.prototype.hasOwnProperty.call(changes || {}, 'id')) throw new VmosValidationError('Purchase request ID cannot be changed.');
  return this.repository.updateById(id, changes);
};
