const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', 'appscript', 'src');
const jobs = {
  'JOB-26-0127': { id: 'JOB-26-0127', customerId: 'CUST-26-0001', partId: 'H2', status: 'PLANNED', machine: 'Haas 2' },
  'JOB-26-0999': { id: 'JOB-26-0999', customerId: 'CUST-26-0001', partId: 'H3', status: 'SETUP', machine: 'Haas 3' }
};
const events = [];
const tokens = [];
const TOKEN_A = '11111111222243338444555555555555';
const TOKEN_B = 'aaaaaaaa55554555b555cccccccccccc';
const context = vm.createContext({
  console, Date, JSON, String, Number, Error, Object, Array, isNaN,
  Utilities: { getUuid: () => '11111111-2222-4333-8444-555555555555', DigestAlgorithm:{SHA_256:'SHA_256'}, Charset:{UTF_8:'UTF_8'}, computeDigest:value=>Array.from({length:32},(_,index)=>(String(value).charCodeAt(index%String(value).length)||0)+index) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (name) => name === 'VMOS_QR_IMAGE_ENDPOINT' ? 'https://qr.example.invalid/?data=' : null }) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/example/exec' }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
});
['Utilities/Errors.gs', 'Utilities/Serialization.gs', 'Utilities/WorkflowConfig.gs', 'Repository/OperationalRepositories.gs', 'Services/ShopFloorService.gs'].forEach((file) => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context));

const jobService = {
  get(id) { if (!jobs[id]) throw new context.VmosNotFoundError_('missing'); return jobs[id]; },
  update(id, changes) { Object.assign(jobs[id], changes); return jobs[id]; }
};
const eventRepository = {
  listByJobId(id) { return events.filter((event) => event.jobId === id); },
  append(event) { events.push(event); return event; }
};
const tokenRepository = {
  findActiveByJobId(id) { return tokens.filter((token) => token.jobId === id && !token.revokedAt); },
  findByToken(token) { const found = tokens.find((record) => record.id === token); if (!found) throw new context.VmosNotFoundError_('missing'); return found; },
  create(record) { tokens.push(record); return record; },
  revoke(token, actor) { const record = this.findByToken(token); record.revokedAt = new Date('2026-08-10T18:00:00Z'); record.revokedBy = actor; return record; }
};
context.MvpService_ = function (entity) {
  if (entity === 'Customer') this.get = () => ({ id: 'CUST-26-0001', name: 'Vitality Test Customer' });
};

let generatedToken = TOKEN_A;
const shop = new context.ShopFloorService_({
  jobs: jobService, events: eventRepository, qrTokens: tokenRepository,
  auditUser: () => 'authenticated-user-1', tokenGenerator: () => generatedToken,
  clock: () => new Date('2026-08-10T17:00:00Z')
});

assert.equal(context.isValidOpaqueJobQrToken_(TOKEN_A), true);
assert.equal(context.isValidOpaqueJobQrToken_('JOB-26-0127'), false);
assert.match(context.generateOpaqueJobQrToken_(), /^[a-f0-9]{32}$/);
const firstGenerated = context.generateOpaqueJobQrToken_();
context.Utilities.getUuid = () => '99999999-8888-4777-a666-555555555555';
const secondGenerated = context.generateOpaqueJobQrToken_();
assert.notEqual(firstGenerated, secondGenerated, 'Independent UUID source values must produce unique opaque tokens.');

const configured = shop.configureJob('JOB-26-0127', 'MACHINING', 'SETUP');
assert.equal(configured.qrToken, TOKEN_A);
assert.equal(jobs['JOB-26-0127'].status, 'SETUP');
assert.equal(events[0].eventType, 'WORKFLOW_ASSIGNED');
assert.equal(events[1].eventType, 'QR_ASSIGNED');

assert.equal(shop.resolveByQr(TOKEN_A).id, 'JOB-26-0127');
assert.equal(events.length, 2, 'Repeated scans are read-only and must not append events.');
assert.equal(shop.resolveByQr(TOKEN_A).id, 'JOB-26-0127');
assert.equal(events.length, 2);
assert.throws(() => shop.resolveByQr('malformed'), /invalid or no longer available/);
assert.throws(() => shop.resolveByQr('ffffffffffffffffffffffffffffffff'), /invalid or no longer available/);

context.LockService.getScriptLock = () => ({ waitLock() { tokens[0].revokedAt = new Date('2026-08-10T17:30:00Z'); }, releaseLock() {} });
assert.throws(() => shop.transition('JOB-26-0127', 'RUNNING', 'cmd-revoke-race', '', TOKEN_A), /invalid or no longer available/, 'QR scope must be revalidated after acquiring the mutation lock.');
assert.equal(events.some((event) => event.commandId === 'cmd-revoke-race'), false);
tokens[0].revokedAt = '';
context.LockService.getScriptLock = () => ({ waitLock() {}, releaseLock() {} });

assert.throws(() => shop.transition('JOB-26-0127', 'RUNNING', 'cmd-no-token', ''), /invalid or no longer available/);
assert.throws(() => shop.transition('JOB-26-0999', 'RUNNING', 'cmd-wrong-job', '', TOKEN_A), /invalid or no longer available/);
shop.transition('JOB-26-0127', 'RUNNING', 'cmd-running', 'Started', TOKEN_A);
assert.equal(jobs['JOB-26-0127'].status, 'RUNNING');
shop.transition('JOB-26-0127', 'RUNNING', 'cmd-running', 'Retry', TOKEN_A);
assert.equal(events.filter((event) => event.commandId === 'cmd-running').length, 1, 'Mutation command IDs remain idempotent.');

shop.reportProblem('JOB-26-0127', { reason: 'TOOL_FAILURE', notes: 'Tool 3 failed.', responsibleParty: 'spoofed-user' }, 'cmd-problem', TOKEN_A);
assert.equal(jobs['JOB-26-0127'].status, 'BLOCKED');
assert.equal(events[events.length - 1].responsibleParty, 'authenticated-user-1', 'Client actor fields are not audit attribution.');
shop.resolveBlock('JOB-26-0127', { nextStatus: 'INSPECTION', responsibleParty: 'spoofed-user' }, 'cmd-resolve', TOKEN_A);
assert.equal(jobs['JOB-26-0127'].status, 'INSPECTION');

const traveler = shop.getTravelerData(TOKEN_A);
assert.equal(traveler.jobId, 'JOB-26-0127');
assert.equal(Object.prototype.hasOwnProperty.call(traveler, 'qrToken'), false, 'Raw tokens must not be exposed in traveler display data.');
assert.match(traveler.qrImageUrl, /shop%3D1%26qr%3D/);
assert.ok(!traveler.qrImageUrl.includes('JOB-26-0127'), 'QR payload must not expose the Job ID.');

generatedToken = TOKEN_B;
const rotated = shop.rotateQr('JOB-26-0127', 'Traveler replaced.');
assert.equal(rotated.qrToken, TOKEN_B);
assert.ok(tokens.find((record) => record.id === TOKEN_A).revokedAt);
assert.throws(() => shop.resolveByQr(TOKEN_A), /invalid or no longer available/);
assert.equal(shop.resolveByQr(TOKEN_B).id, 'JOB-26-0127');
assert.equal(tokens.filter((record) => !record.revokedAt && record.jobId === 'JOB-26-0127').length, 1);

shop.revokeQr(TOKEN_B, 'Job traveler retired.');
assert.throws(() => shop.resolveByQr(TOKEN_B), /invalid or no longer available/);
assert.equal(tokens.filter((record) => !record.revokedAt && record.jobId === 'JOB-26-0127').length, 0);
assert.ok(events.some((event) => event.eventType === 'QR_ROTATED'));
assert.ok(events.some((event) => event.eventType === 'QR_REVOKED'));

console.log('VMOS shop-floor QR security and service tests passed');
