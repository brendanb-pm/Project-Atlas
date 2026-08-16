/** Mapping-driven repository for the proposed CashReceipts store. */
function CashReceiptRepository_() {
  var config = getCashReceiptConfig_();
  this.repository = new SheetsRepository_('CashReceipt', config.mapping, SpreadsheetApp.openById(config.spreadsheetId));
}
CashReceiptRepository_.prototype.list = function () { return this.repository.list(); };
CashReceiptRepository_.prototype.findById = function (id) { return this.repository.findById(id); };
CashReceiptRepository_.prototype.insert = function (record) { return this.repository.insert(record); };
CashReceiptRepository_.prototype.updateById = function (id, changes) { return this.repository.updateById(id, changes); };
CashReceiptRepository_.prototype.findByReceiptCommandId = function (commandId) {
  if (typeof this.repository.findFirstByFields === 'function') return this.repository.findFirstByFields({ receiptCommandId: commandId }) || null;
  return this.list().filter(function (receipt) { return String(receipt.receiptCommandId || '') === String(commandId); })[0] || null;
};
