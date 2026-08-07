const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'appscript', 'src');
const context = vm.createContext({
  console, Date, String, Number, Error, Object, Array, isNaN,
  Utilities: { getUuid: () => '123e4567-e89b-12d3-a456-426614174000' },
  Session: { getActiveUser: () => ({ getEmail: () => 'requester@example.com' }), getEffectiveUser: () => ({ getEmail: () => 'requester@example.com' }) }
});
['Utilities/Errors.gs', 'Utilities/Validation.gs', 'Services/MvpServices.gs', 'Services/PurchaseApprovalService.gs'].forEach((file) => {
  // MvpServices supplies the existing audit-user helper; its constructor is not invoked here.
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
});

const records = [];
const repository = {
  list: () => records.slice(),
  findById: (id) => { const record = records.find((item) => item.id === id); if (!record) throw new context.VmosNotFoundError('missing'); return record; },
  create: (record) => { records.push({ ...record }); return record; },
  updateById: (id, changes) => { const record = repository.findById(id); Object.assign(record, changes); return record; }
};
const service = new context.PurchaseApprovalService(repository, { threshold: 500 });

const requestFields = { requester: 'Josh@Vitality.test', vendor: 'Acme Tool', category: 'Cutting tools', classification: 'Job', businessJustification: 'Replace failed Tool #3', expectedRoiNeed: 'Restore machining capacity', description: 'Replacement drill' };
assert.throws(() => service.submit({ ...requestFields, amount: 0 }), /greater than zero/);
assert.throws(() => service.submit({ ...requestFields, vendor: '', amount: 50 }), /Vendor is required/);
assert.throws(() => service.submit({ ...requestFields, classification: 'Petty cash', amount: 50 }), /Classification must be Job, CapEx, or Overhead/);
assert.throws(() => service.submit({ ...requestFields, expectedRoiNeed: '', amount: 50 }), /Expected ROI/);

const controlled = service.submit({ ...requestFields, amount: 501, notes: 'Tool #3' });
assert.equal(controlled.id, 'PUR-123E4567-E89B-12D3-A456-426614174000');
assert.equal(controlled.status, 'PENDING_APPROVAL');
assert.equal(controlled.approvalRequired, true);
assert.equal(controlled.category, 'Cutting tools');
assert.equal(controlled.classification, 'JOB');
assert.equal(controlled.businessJustification, 'Replace failed Tool #3');
assert.equal(controlled.expectedRoiNeed, 'Restore machining capacity');
assert.equal(controlled.actualPurchaseAmount, '');
assert.equal(controlled.createdBy, 'requester@example.com');
assert.throws(() => service.approve(controlled.id, ' JOSH@vitality.test '), /Requester and approver/);
assert.throws(() => service.recordReceipt(controlled.id, 'R-1', 'Josh'), /after the purchase request is approved/);
const approved = service.approve(controlled.id, 'Amanda@vitality.test', 'Budget confirmed');
assert.equal(approved.status, 'APPROVED');
assert.equal(approved.approver, 'Amanda@vitality.test');
assert.equal(approved.updatedBy, 'Amanda@vitality.test');
const receipted = service.recordReceipt(controlled.id, 'RCPT-2026-0001', 487.25, 'Amanda@vitality.test');
assert.equal(receipted.receiptReference, 'RCPT-2026-0001');
assert.equal(receipted.actualPurchaseAmount, 487.25);
assert.throws(() => service.recordReceipt(controlled.id, 'RCPT-2026-0002', 490, 'Amanda@vitality.test'), /cannot be replaced/);

const lowSpend = service.submit({ ...requestFields, vendor: 'Fastenal', category: 'PPE', classification: 'Overhead', description: 'Gloves', amount: 500, actualPurchaseAmount: 499.5 });
assert.equal(lowSpend.approvalRequired, false);
assert.equal(lowSpend.status, 'APPROVED_NO_APPROVAL_REQUIRED');
assert.equal(lowSpend.actualPurchaseAmount, 499.5);
assert.throws(() => service.approve(lowSpend.id, 'Josh@Vitality.test'), /Only pending over-threshold/);

console.log('VMOS purchase approval tests passed');
