/** Lightweight fixed-window protection for callable application operations. */
var ATLAS_ABUSE_POLICIES = {
  NORMAL_READ: { limit: 60, windowSeconds: 10, failureMode: 'OPEN' },
  EXPENSIVE_READ: { limit: 20, windowSeconds: 10, failureMode: 'OPEN' },
  NORMAL_WRITE: { limit: 30, windowSeconds: 10, failureMode: 'OPEN' },
  HIGH_RISK_WRITE: { limit: 10, windowSeconds: 30, failureMode: 'CLOSED' },
  SHOP_FLOOR_COMMAND: { limit: 30, windowSeconds: 10, globalLimit: 120, failureMode: 'OPEN' },
  QR_LOOKUP: { limit: 60, windowSeconds: 10, failureMode: 'OPEN' },
  ADMINISTRATIVE: { limit: 10, windowSeconds: 30, failureMode: 'CLOSED' }
};

function AbuseControlService_(dependencies) {
  dependencies = dependencies || {};
  this.cache = dependencies.cache || CacheService.getScriptCache();
  this.lockFactory = dependencies.lockFactory || function () { return LockService.getScriptLock(); };
  this.clock = dependencies.clock || function () { return new Date().getTime(); };
  this.policies = dependencies.policies || ATLAS_ABUSE_POLICIES;
  this.digest = dependencies.digest || abuseDigest_;
  this.logger = dependencies.logger || function (entry) { try { console.warn(JSON.stringify(entry)); } catch (ignored) {} };
}

AbuseControlService_.prototype.enforce = function (operation, policyName, scope) {
  var policy = this.policies[policyName];
  if (!policy) throw new VmosConfigurationError_('Unknown abuse-control policy.');
  var checks = [{ suffix: 'GLOBAL', limit: policy.globalLimit || policy.limit }];
  if (scope && policy.globalLimit) checks.push({ suffix: 'SCOPE:' + this.digest(String(scope)), limit: policy.limit });
  var lock = this.lockFactory(), acquired = false, now = this.clock(), self = this;
  try {
    acquired = typeof lock.tryLock === 'function' ? lock.tryLock(250) : (lock.waitLock(250), true);
    if (!acquired) throw new Error('ABUSE_CONTROL_LOCK_BUSY');
    var pending = checks.map(function (check) { return self.evaluate_(operation, policyName, policy, check, now); });
    pending.forEach(function (item) { self.cache.put(item.key, JSON.stringify(item.state), policy.windowSeconds + 5); });
    return { allowed: true, policy: policyName };
  } catch (error) {
    if (error && error.code === 'THROTTLED') throw error;
    this.logger({ type: 'ABUSE_CONTROL_UNAVAILABLE', operation: operation, policy: policyName, failureMode: policy.failureMode });
    if (policy.failureMode === 'CLOSED') throw new VmosThrottleError_('This operation is temporarily unavailable. Try again shortly.', 2);
    return { allowed: true, degraded: true, policy: policyName };
  } finally {
    if (acquired) lock.releaseLock();
  }
};

AbuseControlService_.prototype.evaluate_ = function (operation, policyName, policy, check, now) {
  var key = 'ABUSE:' + this.digest(operation + '|' + check.suffix), raw = this.cache.get(key), state;
  try { state = raw ? JSON.parse(raw) : null; } catch (ignored) { state = null; }
  if (!state || now - Number(state.startedAt) >= policy.windowSeconds * 1000) state = { count: 0, startedAt: now };
  if (state.count >= check.limit) {
    var retry = Math.max(1, Math.ceil((policy.windowSeconds * 1000 - (now - state.startedAt)) / 1000));
    this.logger({ type: 'REQUEST_THROTTLED', operation: operation, policy: policyName, bucket: key.slice(-12), retryAfterSeconds: retry });
    throw new VmosThrottleError_('Too many requests. Wait briefly, then try again.', retry);
  }
  state.count += 1;
  return { key: key, state: state };
};

function abuseDigest_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function (item) { var normalized = item < 0 ? item + 256 : item; return ('0' + normalized.toString(16)).slice(-2); }).join('').slice(0, 32);
}

function enforceAbuseControl_(operation, policyName, scope) {
  return new AbuseControlService_().enforce(operation, policyName, scope || '');
}
