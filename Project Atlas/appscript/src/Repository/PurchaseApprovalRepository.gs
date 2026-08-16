/** Dedicated repository wrapper; it does not initialize, alter, or create sheets. */
function PurchaseApprovalRepository_(config) {
  this.config = config || getPurchaseApprovalConfig_();
  this.repository = new SheetsRepository_('PurchaseApproval', this.config.mapping, SpreadsheetApp.openById(this.config.spreadsheetId));
}
PurchaseApprovalRepository_.prototype.list = function () { return this.repository.list(); };
PurchaseApprovalRepository_.prototype.listByJobId = function (jobId, tenantId, limit) {
  var maximum=Math.min(50,Math.max(1,Number(limit||20)));
  return this.list().filter(function (row) { return String(row.securityTenantId)===String(tenantId)&&String(row.jobId||'')===String(jobId); }).slice(0,maximum);
};
PurchaseApprovalRepository_.prototype.findById = function (id) { return this.repository.findById(id); };
PurchaseApprovalRepository_.prototype.create = function (record) {
  if (!record || !record.id) throw new VmosValidationError_('Purchase request ID is required.');
  return this.repository.insert(record);
};
PurchaseApprovalRepository_.prototype.updateById = function (id, changes) {
  if (Object.prototype.hasOwnProperty.call(changes || {}, 'id')) throw new VmosValidationError_('Purchase request ID cannot be changed.');
  return this.repository.updateById(id, changes);
};
