const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const base = path.join(__dirname, '..', 'appscript', 'src');
const context = vm.createContext({ console, Date, JSON, String, Number, Math, Object, Array, Error });
['Utilities/Errors.gs', 'Services/AbuseControlService.gs'].forEach((file) => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context));

function fixture(options) {
  options = options || {};
  const values = new Map(), operations = { gets: 0, puts: 0, locks: 0 }, logs = [];
  const cache = options.cache || {
    get(key) { operations.gets += 1; return values.has(key) ? values.get(key) : null; },
    put(key, value) { operations.puts += 1; values.set(key, value); }
  };
  const lock = options.lock || { tryLock() { operations.locks += 1; return true; }, releaseLock() {} };
  let now = 1000;
  const service = new context.AbuseControlService({
    cache, lockFactory: () => lock, clock: () => now,
    digest: (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 32),
    logger: (entry) => logs.push(entry),
    policies: options.policies || {
      TEST: { limit: 2, windowSeconds: 10, failureMode: 'OPEN' },
      SCOPED: { limit: 1, globalLimit: 3, windowSeconds: 10, failureMode: 'OPEN' },
      CLOSED: { limit: 1, windowSeconds: 10, failureMode: 'CLOSED' }
    }
  });
  return { service, values, operations, logs, advance(ms) { now += ms; } };
}

let test = fixture();
assert.equal(test.service.enforce('read', 'TEST').allowed, true);
assert.equal(test.service.enforce('read', 'TEST').allowed, true);
assert.throws(() => test.service.enforce('read', 'TEST'), (error) => error.code === 'THROTTLED' && error.retryAfterSeconds === 10);
assert.equal(test.operations.puts, 2, 'Denied traffic must not mutate limiter state.');
test.advance(10001);
assert.equal(test.service.enforce('read', 'TEST').allowed, true, 'Legitimate retry succeeds after the window.');

test = fixture();
assert.equal(test.service.enforce('shop', 'SCOPED', 'token-a').allowed, true);
assert.throws(() => test.service.enforce('shop', 'SCOPED', 'token-a'), (error) => error.code === 'THROTTLED');
assert.equal(test.service.enforce('shop', 'SCOPED', 'token-b').allowed, true, 'Scoped buckets isolate distinct resource signals.');

let mutations = 0;
test = fixture();
function guardedMutation() { test.service.enforce('create', 'TEST'); mutations += 1; }
guardedMutation(); guardedMutation();
assert.throws(guardedMutation, (error) => error.code === 'THROTTLED');
assert.equal(mutations, 2, 'A throttled request must be rejected before mutation.');

const unavailableCache = { get() { throw new Error('cache unavailable'); }, put() { throw new Error('cache unavailable'); } };
test = fixture({ cache: unavailableCache });
assert.equal(test.service.enforce('read', 'TEST').degraded, true, 'Normal operations fail open if the cache is unavailable.');
assert.throws(() => test.service.enforce('approval', 'CLOSED'), (error) => error.code === 'THROTTLED');

test = fixture({ lock: { tryLock() { return false; }, releaseLock() { throw new Error('must not release unacquired lock'); } } });
assert.equal(test.service.enforce('read', 'TEST').degraded, true, 'Normal traffic remains responsive during limiter lock contention.');

test = fixture();
const started = process.hrtime.bigint();
for (let index = 0; index < 1000; index += 1) {
  const local = fixture();
  local.service.enforce('read-' + index, 'TEST');
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
assert.ok(elapsedMs < 1000, 'In-memory characterization should remain lightweight.');
assert.equal(test.operations.gets, 0);

const code = fs.readFileSync(path.join(base, 'UI', 'Code.gs'), 'utf8');
['getMvpBootstrap', 'getCalendarWorkspace', 'getShopDashboard', 'createMvpRecord', 'createSalesActivity', 'captureIdea', 'recordCashReceipt', 'approvePurchaseRequest', 'transitionShopFloorJob'].forEach((endpoint) => {
  const line = code.split(/\r?\n/).find((candidate) => candidate.includes('function ' + endpoint + '('));
  assert.ok(line && line.includes('enforceAbuseControl_'), endpoint + ' must enforce abuse control before expensive work.');
});
assert.match(code, /transitionShopFloorJob','SHOP_FLOOR_COMMAND',qrToken/, 'QR commands require a token-scoped limiter signal.');
assert.doesNotMatch(fs.readFileSync(path.join(base, 'UI', 'SalesActivity.html'), 'utf8'), /withFailureHandler\([^)]*=>?[^)]*\.message/, 'Sales Activity transport failures must not echo runtime errors.');

const errors = [];
const errorContext = vm.createContext({
  Date, JSON, String, Number, Math, Object, Array, Error,
  Utilities: { getUuid: () => '12345678-90ab-cdef-1234-567890abcdef' },
  console: { error: (message) => errors.push(message) }
});
vm.runInContext(fs.readFileSync(path.join(base, 'Utilities', 'Errors.gs'), 'utf8'), errorContext);
const response = errorContext.toClientError_(new errorContext.VmosThrottleError('Too many requests. Wait briefly, then try again.', 7));
assert.equal(response.error.code, 'THROTTLED');
assert.equal(response.error.retryAfterSeconds, 7);
assert.doesNotMatch(JSON.stringify(response), /counter|cache|threshold|bucket/i);

// A permitted rate-limit check is not authentication or authorization.
assert.equal(test.service.enforce('unauthenticated-attempt', 'TEST').allowed, true);
assert.equal(Object.prototype.hasOwnProperty.call(test.service.enforce('another-attempt', 'TEST'), 'principal'), false);

console.log('Atlas abuse-control and throttling tests passed; in-memory 1000-check characterization:', elapsedMs.toFixed(2), 'ms');
