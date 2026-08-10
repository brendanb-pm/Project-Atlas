/** Dedicated repository wrapper; it does not initialize, alter, or create sheets. */
function PurchaseApprovalRepository_(config) {
  this.config = config || getPurchaseApprovalConfig_();
  this.repository = new SheetsRepository_('PurchaseApproval', this.config.mapping, SpreadsheetApp.openById(this.config.spreadsheetId));
}
PurchaseApprovalRepository_.prototype.list = function () { return this.repository.list(); };
PurchaseApprovalRepository_.prototype.findById = function (id) { return this.repository.findById(id); };
PurchaseApprovalRepository_.prototype.create = function (record) {
  if (!record || !record.id) throw new VmosValidationError_('Purchase request ID is required.');
  return this.repository.insert(record);
};
PurchaseApprovalRepository_.prototype.updateById = function (id, changes) {
  if (Object.prototype.hasOwnProperty.call(changes || {}, 'id')) throw new VmosValidationError_('Purchase request ID cannot be changed.');
  return this.repository.updateById(id, changes);
};
