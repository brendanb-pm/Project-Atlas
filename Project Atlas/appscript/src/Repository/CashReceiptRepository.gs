/** Mapping-driven repository for the proposed CashReceipts store. */
function CashReceiptRepository() {
  var config = getCashReceiptConfig_();
  this.repository = new SheetsRepository('CashReceipt', config.mapping, SpreadsheetApp.openById(config.spreadsheetId));
}
CashReceiptRepository.prototype.list = function () { return this.repository.list(); };
CashReceiptRepository.prototype.findById = function (id) { return this.repository.findById(id); };
CashReceiptRepository.prototype.insert = function (record) { return this.repository.insert(record); };
CashReceiptRepository.prototype.updateById = function (id, changes) { return this.repository.updateById(id, changes); };
CashReceiptRepository.prototype.findByReceiptCommandId = function (commandId) {
  return this.list().filter(function (receipt) { return String(receipt.receiptCommandId || '') === String(commandId); })[0] || null;
};
