const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'appscript', 'src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Reproduce the live NORMAL_READ failure through the real policy service.
const abuseContext = vm.createContext({ console, Date, JSON, String, Number, Math, Object, Array, Error });
['Utilities/Errors.gs', 'Services/AbuseControlService.gs'].forEach(file => vm.runInContext(read(file), abuseContext, { filename: file }));
assert.deepEqual(
  JSON.parse(JSON.stringify(abuseContext.ATLAS_ABUSE_POLICIES.NORMAL_READ)),
  { limit: 60, windowSeconds: 10, failureMode: 'OPEN' }
);

const values = new Map();
const normalRead = new abuseContext.AbuseControlService_({
  cache: {
    get(key) { return values.has(key) ? values.get(key) : null; },
    put(key, value) { values.set(key, value); }
  },
  lockFactory: () => ({ tryLock: () => true, releaseLock() {} }),
  clock: () => 1000,
  digest: value => String(value)
});
for (let count = 0; count < 60; count += 1) assert.equal(normalRead.enforce('getAtlasNavigation', 'NORMAL_READ').allowed, true);
assert.throws(
  () => normalRead.enforce('getAtlasNavigation', 'NORMAL_READ'),
  error => error.code === 'THROTTLED' && error.retryAfterSeconds === 10,
  'The routine navigation read remains bounded.'
);
assert.throws(() => normalRead.enforce('getAtlasNavigation', 'NOT_A_POLICY'), /Unknown abuse-control policy/);
assert.equal(abuseContext.ATLAS_ABUSE_POLICIES.NORMAL_WRITE.limit, 30);
assert.equal(abuseContext.ATLAS_ABUSE_POLICIES.EXPENSIVE_READ.limit, 20);
assert.equal(abuseContext.ATLAS_ABUSE_POLICIES.HIGH_RISK_WRITE.failureMode, 'CLOSED');

const code = read('UI/Code.gs');
function productionGs(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? productionGs(full) : entry.name.endsWith('.gs') ? [fs.readFileSync(full, 'utf8')] : [];
  });
}
const productionSource = productionGs(root).join('\n');
const referencedPolicies = Array.from(productionSource.matchAll(/callable_\('[^']+'\s*,\s*'([A-Z_]+)'/g), match => match[1]);
referencedPolicies.push(...Array.from(productionSource.matchAll(/enforceAbuseControl_\([^,]+\s*,\s*'([A-Z_]+)'/g), match => match[1]));
assert(referencedPolicies.includes('NORMAL_READ'));
referencedPolicies.forEach(policy => assert(abuseContext.ATLAS_ABUSE_POLICIES[policy], policy + ' is referenced but not registered'));

// Server route resolution owns the commercial template context.
const navigationContext = vm.createContext({ Object, Array, String, JSON, VmosConfigurationError_: Error, PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) } });
['ConfigNavigation.gs', 'Services/NavigationService.gs'].forEach(file => vm.runInContext(read(file), navigationContext, { filename: file }));
assert.equal(navigationContext.resolveAtlasCommercialRecordId_({ parameter: { route: 'quotes', id: 'VQT-26-0128' } }, 'quotes'), 'VQT-26-0128');
assert.equal(navigationContext.resolveAtlasCommercialRecordId_({ parameter: { route: 'quotes', id: '<script>' } }, 'quotes'), '');
assert.equal(navigationContext.resolveAtlasCommercialRecordId_({ parameter: { route: 'home', id: 'VQT-26-0128' } }, 'home'), '');
assert.equal(navigationContext.resolveAtlasCommercialRecordId_({ parameter: { route: 'quotes', id: 'X'.repeat(129) } }, 'quotes'), '');

let createdView;
const getContext = vm.createContext({
  Object, Array, String, Number, Math, Date, JSON, Error,
  resolveAtlasRoute_: navigationContext.resolveAtlasRoute_,
  resolveAtlasCommercialRecordId_: navigationContext.resolveAtlasCommercialRecordId_,
  atlasRouteAvailability_: () => ({ state: 'AVAILABLE', message: '' }),
  atlasRouteTemplate_: navigationContext.atlasRouteTemplate_,
  atlasRouteTitle_: navigationContext.atlasRouteTitle_,
  getAtlasDeploymentProfile_: () => ({ enabledModules: [] }),
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createTemplateFromFile(name) {
      createdView = { name, evaluate() { return { setTitle() { return this; }, setXFrameOptionsMode() { return this; } }; } };
      return createdView;
    }
  }
});
vm.runInContext(code, getContext, { filename: 'UI/Code.gs' });
getContext.doGet({ parameter: { route: 'invoices', id: 'INV-26-0042' } });
assert.equal(createdView.name, 'UI/CommercialWorkflow');
assert.equal(createdView.atlasRequestedRoute, 'invoices');
assert.equal(createdView.atlasRequestedRecordId, 'INV-26-0042');

// Exercise the embedded workspace with no URLSearchParams implementation. If it
// reads its iframe URL again, this harness fails before it can request Quotes.
const commercialHtml = read('UI/CommercialWorkflow.html');
const commercialScript = commercialHtml.match(/<script>([\s\S]*)<\/script>/)[1];
function commercialHarness(initialRoute, initialId) {
  const source = commercialScript
    .replace("'<?= atlasRequestedRoute ?>'", JSON.stringify(initialRoute))
    .replace("'<?= atlasRequestedRecordId ?>'", JSON.stringify(initialId || ''));
  const elements = {};
  ['title', 'search', 'search-button', 'directory', 'detail', 'crumbs', 'notice'].forEach(id => {
    elements[id] = { id, textContent: '', value: '', innerHTML: '', hidden: false, className: '', addEventListener() {}, focus() {} };
  });
  const requests = [], rendered = [], redirects = [];
  let success, failure;
  const runner = {
    withSuccessHandler(handler) { success = handler; return this; },
    withFailureHandler(handler) { failure = handler; return this; },
    getCommercialWorkflowWorkspace(request) {
      requests.push({ request: JSON.parse(JSON.stringify(request)), success, failure });
      success = null; failure = null;
    }
  };
  const context = vm.createContext({
    Object, Array, String, Number, Math, Date, JSON, Error, encodeURIComponent,
    location: { href: '', replace(value) { redirects.push(value); } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      getElementById: id => elements[id] || (elements[id] = { textContent: '', value: '', innerHTML: '', hidden: false, className: '', addEventListener() {}, focus() {} }),
      querySelectorAll: () => [],
      querySelector: () => ({ focus() {} })
    },
    window: { crypto: null },
    google: { script: { run: runner } },
    rendered
  });
  vm.runInContext(source, context, { filename: 'UI/CommercialWorkflow.html' });
  vm.runInContext('render=function(){rendered.push(model.route);}', context);
  return { context, elements, requests, rendered, redirects };
}

['customers', 'quotes', 'invoices'].forEach(route => {
  const harness = commercialHarness(route, '');
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].request.route, route);
  assert.equal(harness.elements.title.textContent, { customers: 'Customers', quotes: 'Quotes', invoices: 'Invoices' }[route]);
  harness.requests[0].success({ ok: true, data: { route, directory: { items: [] }, actions: {} } });
  assert.deepEqual(harness.rendered, [route]);
});

const quoteDeepLink = commercialHarness('quotes', 'VQT-26-0128');
assert.deepEqual(quoteDeepLink.redirects, ['?route=quote-builder&quoteId=VQT-26-0128']);
assert.equal(quoteDeepLink.requests.length, 0);

const race = commercialHarness('customers', '');
vm.runInContext("route='quotes';load();route='invoices';load();", race.context);
assert.equal(race.requests.length, 3);
race.requests[1].success({ ok: true, data: { route: 'quotes', directory: { items: [] }, actions: {} } });
race.requests[0].failure(new Error('late customer failure'));
assert.deepEqual(race.rendered, [], 'Stale success and failure cannot replace the newest route.');
race.requests[2].success({ ok: true, data: { route: 'invoices', directory: { items: [] }, actions: {} } });
assert.deepEqual(race.rendered, ['invoices']);
assert.equal(race.elements.title.textContent, 'Invoices');
assert.equal(race.elements.notice.textContent, '');

assert.doesNotMatch(commercialScript, /URLSearchParams\(location\.search\)/, 'Commercial route state must not come from the embedded URL.');
assert.doesNotMatch(commercialScript, /getMvpBootstrap|setInterval\s*\(/);
const navigationFrame = read('UI/NavigationFrame.html');
assert.match(navigationFrame, /window\.atlasServerRoute/);
assert.match(navigationFrame, /setTimeout\(function\(\)\{google\.script\.run/);

console.log('ACTIVATION-V1-R3-R1 routine-read and commercial route-context tests passed');
