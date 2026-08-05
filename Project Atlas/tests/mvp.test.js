const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const base = path.join(__dirname, '..', 'appscript', 'src');
const records = { Customer: [], RFQ: [], Quote: [], Job: [], Invoice: [] };
const context = vm.createContext({ console, Date, JSON, String, Number, Error, isNaN, Object, Array,
  LockService: { getDocumentLock: () => null, getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Session: { getScriptTimeZone: () => 'UTC', getActiveUser: () => ({ getEmail: () => 'operator@example.com' }), getEffectiveUser: () => ({ getEmail: () => 'operator@example.com' }) }, Utilities: { formatDate: () => '26' }
});
['Config.gs', 'Utilities/Errors.gs', 'Utilities/Validation.gs', 'Utilities/IdGenerator.gs', 'Services/MvpServices.gs'].forEach((file) => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context));
const mapping = context.VMOS_DEFAULT_MAPPING;
context.getVmosConfig_ = () => ({ mapping });
context.createRepository_ = (entity) => ({
  list: () => records[entity].slice(),
  findById: (id) => { const item = records[entity].find((r) => r.id === id); if (!item) throw new context.VmosNotFoundError('missing'); return item; },
  insert: (item) => { records[entity].push({ ...item }); return item; },
  updateById: (id, changes) => { if (Object.prototype.hasOwnProperty.call(changes, 'id')) throw new context.VmosValidationError('Primary key cannot be changed.'); const item = records[entity].find((r) => r.id === id); if (!item) throw new context.VmosNotFoundError('missing'); Object.keys(changes).forEach((key) => { item[key] = changes[key]; }); return item; }
});
function nextId(prefix, ids) { return context.generateVmosId_(prefix, { list: () => ids.map((id) => ({ id })) }); }
assert.equal(nextId('RFQ', ['rfq 26-0127']), 'RFQ-26-0128');
assert.equal(nextId('RFQ', ['RFQ-26-0127']), 'RFQ-26-0128');
assert.equal(nextId('RFQ', ['rfq 26-0009', 'RFQ-26-0127', 'rFq - 26 - 0126']), 'RFQ-26-0128');
assert.equal(nextId('RFQ', ['RFQ-26-12X7', 'RFQ-25-9999', 'NOT-AN-ID', 'RFQ26-9999']), 'RFQ-26-0001');
assert.equal(nextId('CUST', ['cust 26-0000']), 'CUST-26-0001');
assert.equal(nextId('VQT', ['vqt 26-0127']), 'VQT-26-0128');
assert.equal(nextId('JOB', ['job 26-0127']), 'JOB-26-0128');
assert.equal(nextId('INV', ['inv 26-0127']), 'INV-26-0128');
const customer = new context.MvpService('Customer').create({ name: 'Acme' });
assert.equal(customer.id, 'CUST-26-0001');
assert.equal(customer.createdBy, 'operator@example.com');
const rfq = new context.MvpService('RFQ').create({ customerId: customer.id, description: 'Bracket' });
const updatedRfq = new context.MvpService('RFQ').update(rfq.id, { description: 'Revised bracket' });
assert.equal(updatedRfq.id, rfq.id);
assert.equal(updatedRfq.description, 'Revised bracket');
assert.equal(updatedRfq.status, 'Received');
assert.equal(updatedRfq.updatedBy, 'operator@example.com');
assert.throws(() => new context.MvpService('RFQ').update(rfq.id, { id: 'RFQ-26-9999' }), /Primary key/);
assert.throws(() => new context.MvpService('RFQ').update(rfq.id, { description: '' }), /required/);
const quote = new context.MvpService('Quote').create({ rfqId: rfq.id });
const job = new context.MvpService('Job').create({ quoteId: quote.id });
const invoice = new context.MvpService('Invoice').create({ jobId: job.id, total: 1250 });
assert.equal(invoice.customerId, customer.id);
assert.equal(quote.quoteDate instanceof Date, true);
assert.equal(invoice.invoiceDate instanceof Date, true);
assert.equal(mapping.RFQ.sheetName, "RFQ's");
assert.deepEqual(mapping.Quote.fields.total, ['Total']);
assert.equal(mapping.Job.fields.createdAt, undefined);
assert.throws(() => new context.MvpService('RFQ').create({ customerId: customer.id }), /required/);
console.log('VMOS MVP service tests passed');
