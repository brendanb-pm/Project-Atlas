const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const base = path.join(__dirname, '..', 'appscript', 'src');
const records = { Customer: [], RFQ: [], Quote: [], Job: [], Invoice: [] };
const mapping = {};
Object.keys(records).forEach((name) => {
  const prefixes = { Customer: 'CUST', RFQ: 'RFQ', Quote: 'VQT', Job: 'JOB', Invoice: 'INV' };
  const required = { Customer: ['name'], RFQ: ['customerId', 'description'], Quote: ['rfqId', 'customerId'], Job: ['quoteId', 'customerId', 'name'], Invoice: ['jobId', 'customerId'] };
  mapping[name] = { idPrefix: prefixes[name], required: required[name], fields: { id: [], createdAt: [], status: [] } };
});
const context = vm.createContext({ console, Date, JSON, String, Number, Error, isNaN, Object, Array,
  LockService: { getDocumentLock: () => null, getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Session: { getScriptTimeZone: () => 'UTC' }, Utilities: { formatDate: () => '26' }
});
['Utilities/Errors.gs', 'Utilities/Validation.gs', 'Utilities/IdGenerator.gs', 'Services/MvpServices.gs'].forEach((file) => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context));
context.getVmosConfig_ = () => ({ mapping });
context.createRepository_ = (entity) => ({
  list: () => records[entity].slice(),
  findById: (id) => { const item = records[entity].find((r) => r.id === id); if (!item) throw new context.VmosNotFoundError('missing'); return item; },
  insert: (item) => { records[entity].push({ ...item }); return item; }
});
const customer = new context.MvpService('Customer').create({ name: 'Acme' });
assert.equal(customer.id, 'CUST-26-0001');
const rfq = new context.MvpService('RFQ').create({ customerId: customer.id, description: 'Bracket' });
const quote = new context.MvpService('Quote').create({ rfqId: rfq.id });
const job = new context.MvpService('Job').create({ quoteId: quote.id });
const invoice = new context.MvpService('Invoice').create({ jobId: job.id, amount: 1250 });
assert.equal(invoice.customerId, customer.id);
assert.equal(job.name, 'Job for ' + quote.id);
assert.throws(() => new context.MvpService('RFQ').create({ customerId: customer.id }), /required/);
console.log('VMOS MVP service tests passed');
