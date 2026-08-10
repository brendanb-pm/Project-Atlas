/** MOS-113 receipt/deposit workflow. It never changes invoice balances. */
function CashReceiptService_(dependencies) {
  dependencies = dependencies || {};
  this.repository = dependencies.repository || new CashReceiptRepository_();
  this.invoices = dependencies.invoices || new MvpService_('Invoice');
  this.now = dependencies.now || function () { return new Date(); };
  this.auditUser = dependencies.auditUser || getVmosAuditUser_;
  // recordReceipt already holds the script lock for command idempotency, so
  // the default generator must not try to acquire that lock a second time.
  this.idGenerator = dependencies.idGenerator || generateCashReceiptIdUnderLock_;
}

CashReceiptService_.prototype.recordReceipt = function (input) {
  var self = this; input = input || {};
  requireCashReceipt_(input.invoiceId, 'Invoice ID');
  requireCashReceipt_(input.customerId, 'Customer ID');
  requireCashReceipt_(input.receiptCommandId, 'Receipt command ID');
  requireCashReceipt_(input.receivedDate, 'Received date');
  requireCashReceipt_(input.paymentMethod, 'Payment method');
  validateCashAmount_(input.amount);
  validateCashDate_(input.receivedDate, 'Received date');
  return withCashReceiptLock_(function () {
    var existing = self.repository.findByReceiptCommandId(input.receiptCommandId);
    if (existing) return existing;
    var invoice = self.invoices.get(input.invoiceId);
    if (String(invoice.customerId) !== String(input.customerId)) throw new VmosValidationError_('Receipt customer must match its invoice customer.');
    var now = self.now(), actor = self.auditUser();
    return self.repository.insert({
      id: self.idGenerator(self.repository), receiptCommandId: input.receiptCommandId, invoiceId: input.invoiceId, customerId: input.customerId,
      receivedDate: input.receivedDate, amount: Number(input.amount), paymentMethod: input.paymentMethod, referenceNumber: input.referenceNumber || '',
      depositStatus: 'UNDEPOSITED', depositDate: '', depositReference: '', depositCommandId: '', notes: input.notes || '',
      createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor
    });
  });
};

CashReceiptService_.prototype.depositReceipt = function (receiptId, input) {
  var self = this; input = input || {};
  requireCashReceipt_(receiptId, 'Receipt ID');
  requireCashReceipt_(input.depositCommandId, 'Deposit command ID');
  requireCashReceipt_(input.depositDate, 'Deposit date');
  requireCashReceipt_(input.depositReference, 'Deposit reference');
  validateCashDate_(input.depositDate, 'Deposit date');
  return withCashReceiptLock_(function () {
    var receipt = self.repository.findById(receiptId);
    if (String(receipt.depositCommandId || '') === String(input.depositCommandId)) return receipt;
    if (String(receipt.depositStatus || '').toUpperCase() !== 'UNDEPOSITED') throw new VmosValidationError_('Only an undeposited receipt can be marked deposited.');
    return self.repository.updateById(receiptId, {
      depositStatus: 'DEPOSITED', depositDate: input.depositDate, depositReference: input.depositReference,
      depositCommandId: input.depositCommandId, updatedAt: self.now(), updatedBy: self.auditUser()
    });
  });
};

CashReceiptService_.prototype.getUndepositedExceptionSummary = function (asOf) {
  var today = cashReceiptDate_(asOf || this.now()), invalidAmountCount = 0, invalidDateCount = 0, total = 0, oldestDays = null;
  var undeposited = this.repository.list().filter(function (receipt) { return String(receipt.depositStatus || '').toUpperCase() === 'UNDEPOSITED'; });
  undeposited.forEach(function (receipt) {
    var amount = Number(receipt.amount);
    if (isNaN(amount)) invalidAmountCount += 1; else total += amount;
    var received = cashReceiptDate_(receipt.receivedDate);
    if (!received) { invalidDateCount += 1; return; }
    var days = Math.max(0, Math.floor((cashReceiptStartOfDay_(today) - cashReceiptStartOfDay_(received)) / 86400000));
    oldestDays = oldestDays === null ? days : Math.max(oldestDays, days);
  });
  return serializeVmosValue_({ count: undeposited.length, total: total, oldestDays: oldestDays, invalidAmountCount: invalidAmountCount, invalidDateCount: invalidDateCount });
};

function requireCashReceipt_(value, label) { if (value === undefined || value === null || String(value).trim() === '') throw new VmosValidationError_(label + ' is required.'); }
function validateCashAmount_(value) { if (value === undefined || value === null || value === '' || isNaN(Number(value)) || Number(value) <= 0) throw new VmosValidationError_('Receipt amount must be greater than zero.'); }
function validateCashDate_(value, label) { if (!cashReceiptDate_(value)) throw new VmosValidationError_(label + ' must be a valid date.'); }
function cashReceiptDate_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  // Date-only receipt fields are business-calendar dates, not midnight UTC.
  var match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(value || ''));
  var date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}
function cashReceiptStartOfDay_(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); }
function withCashReceiptLock_(action) { var lock = LockService.getScriptLock(); lock.waitLock(30000); try { return action(); } finally { lock.releaseLock(); } }
function generateCashReceiptIdUnderLock_(repository) {
  var year = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yy');
  var highest = repository.list().reduce(function (maximum, receipt) {
    var sequence = parseVmosSequence_(receipt.id, 'RCPT', year);
    return sequence === null ? maximum : Math.max(maximum, sequence);
  }, 0);
  if (highest >= 9999) throw new VmosValidationError_('ID sequence for RCPT-' + year + ' has reached its 4-digit limit.');
  return 'RCPT-' + year + '-' + ('0000' + (highest + 1)).slice(-4);
}
