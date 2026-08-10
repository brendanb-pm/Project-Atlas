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
['Config.gs', 'Utilities/Errors.gs', 'Utilities/Serialization.gs', 'Utilities/Validation.gs', 'Utilities/IdGenerator.gs', 'Repository/SheetsRepository.gs', 'Services/MvpServices.gs'].forEach((file) => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context));
const mapping = context.VMOS_DEFAULT_MAPPING;
context.getVmosConfig_ = () => ({ mapping });
context.createRepository_ = (entity) => ({
  list: () => records[entity].slice(),
  findById: (id) => { const item = records[entity].find((r) => r.id === id); if (!item) throw new context.VmosNotFoundError('missing'); return item; },
  insert: (item) => { records[entity].push({ ...item }); return item; },
  updateById: (id, changes) => { if (Object.prototype.hasOwnProperty.call(changes, 'id')) throw new context.VmosValidationError('Primary key cannot be changed.'); const item = records[entity].find((r) => r.id === id); if (!item) throw new context.VmosNotFoundError('missing'); Object.keys(changes).forEach((key) => { item[key] = changes[key]; }); return item; }
});
function nextId(prefix, ids) { return context.generateVmosId_(prefix, { list: () => ids.map((id) => ({ id })) }); }
const sheetDate = new Date('2026-08-04T19:12:33.000Z');
const serialized = context.serializeVmosValue_({ date: sheetDate, text: 'steel', number: 12.5, flag: true, blank: '', empty: null, nested: [{ timestamp: sheetDate }] });
assert.deepEqual(serialized, { date: '2026-08-04T19:12:33.000Z', text: 'steel', number: 12.5, flag: true, blank: '', empty: null, nested: [{ timestamp: '2026-08-04T19:12:33.000Z' }] });
const mappedRecord = context.SheetsRepository.prototype.toDomain_.call({}, [sheetDate, 'RFQ-26-0128', 4, false, ''], { createdAt: { column: 1 }, id: { column: 2 }, quantity: { column: 3 }, active: { column: 4 }, blank: { column: 5 } });
assert.deepEqual(mappedRecord, { createdAt: '2026-08-04T19:12:33.000Z', id: 'RFQ-26-0128', quantity: 4, active: false, blank: '' });
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
const authoritativeCustomer = new context.MvpService('Customer', { auditUser: () => 'USR-AUTHORITATIVE' }).create({ name: 'Secure Co', createdBy: 'FORGED', updatedBy: 'FORGED' });
assert.equal(authoritativeCustomer.createdBy, 'USR-AUTHORITATIVE');
const authoritativeUpdated = new context.MvpService('Customer', { auditUser: () => 'USR-UPDATER' }).update(authoritativeCustomer.id, { name: 'Secure Co 2', createdBy: 'FORGED', updatedBy: 'FORGED' });
assert.equal(authoritativeUpdated.createdBy, 'USR-AUTHORITATIVE');
assert.equal(authoritativeUpdated.updatedBy, 'USR-UPDATER');
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
