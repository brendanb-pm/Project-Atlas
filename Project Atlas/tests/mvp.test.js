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
  insert: (item) => { records[entity].push({ ...item }); return item; }
});
const customer = new context.MvpService('Customer').create({ name: 'Acme' });
assert.equal(customer.id, 'CUST-26-0001');
assert.equal(customer.createdBy, 'operator@example.com');
const rfq = new context.MvpService('RFQ').create({ customerId: customer.id, description: 'Bracket' });
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
