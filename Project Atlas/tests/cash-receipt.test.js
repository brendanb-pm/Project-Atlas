const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'appscript', 'src', 'Services', 'CashReceiptService.gs'), 'utf8');
function VmosValidationError_(message) { this.name = 'VmosValidationError_'; this.message = message; }
VmosValidationError_.prototype = Object.create(Error.prototype);
const lock = { waitLock() {}, releaseLock() {} };
const context = vm.createContext({
  Date, String, Number, Object, Array, Error, isNaN, console,
  VmosValidationError_, LockService: { getScriptLock: () => lock },
  serializeVmosValue_: (value) => JSON.parse(JSON.stringify(value))
});
vm.runInContext(source, context);

const rows = [];
const repository = {
  list: () => rows.slice(),
  findById: (id) => { const row = rows.find((item) => item.id === id); if (!row) throw new Error('missing'); return row; },
  findByReceiptCommandId: (commandId) => rows.find((item) => item.receiptCommandId === commandId) || null,
  insert: (record) => { rows.push({ ...record }); return rows[rows.length - 1]; },
  updateById: (id, changes) => { const row = repository.findById(id); Object.assign(row, changes); return row; }
};
const invoices = { get: (id) => ({ id, customerId: 'CUST-26-0001' }) };
const service = new context.CashReceiptService_({
  repository, invoices, now: () => new Date('2026-08-07T12:00:00.000Z'), auditUser: () => 'operator@example.com',
  idGenerator: () => 'RCPT-26-0001'
});

const input = { invoiceId: 'INV-26-0001', customerId: 'CUST-26-0001', receiptCommandId: 'receipt-command-1', receivedDate: '2026-08-01', amount: '125.50', paymentMethod: 'CHECK', referenceNumber: '1001' };
const receipt = service.recordReceipt(input);
assert.equal(receipt.id, 'RCPT-26-0001');
assert.equal(receipt.depositStatus, 'UNDEPOSITED');
assert.equal(receipt.amount, 125.5);
assert.equal(rows.length, 1);
assert.strictEqual(service.recordReceipt(input), receipt, 'A replayed receipt command must not create a second receipt.');
assert.equal(rows.length, 1);
assert.throws(() => service.recordReceipt({ ...input, receiptCommandId: 'bad-amount', amount: 0 }), /greater than zero/);
assert.throws(() => service.recordReceipt({ ...input, receiptCommandId: 'wrong-customer', customerId: 'CUST-26-9999' }), /must match/);

const deposited = service.depositReceipt(receipt.id, { depositCommandId: 'deposit-command-1', depositDate: '2026-08-07', depositReference: 'DEP-100' });
assert.equal(deposited.depositStatus, 'DEPOSITED');
assert.strictEqual(service.depositReceipt(receipt.id, { depositCommandId: 'deposit-command-1', depositDate: '2026-08-07', depositReference: 'DEP-100' }), deposited, 'A replayed deposit command must be idempotent.');
assert.throws(() => service.depositReceipt(receipt.id, { depositCommandId: 'deposit-command-2', depositDate: '2026-08-07', depositReference: 'DEP-101' }), /Only an undeposited/);

rows.push({ id: 'RCPT-26-0002', depositStatus: 'UNDEPOSITED', amount: 75, receivedDate: '2026-08-03' });
rows.push({ id: 'RCPT-26-0003', depositStatus: 'UNDEPOSITED', amount: 'bad', receivedDate: 'bad date' });
const summary = service.getUndepositedExceptionSummary('2026-08-07T12:00:00.000Z');
assert.deepEqual(summary, { count: 2, total: 75, oldestDays: 4, invalidAmountCount: 1, invalidDateCount: 1 });

console.log('VMOS cash receipt tests passed');
