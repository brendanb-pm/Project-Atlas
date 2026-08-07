const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'appscript', 'src');
const server = fs.readFileSync(path.join(root, 'UI', 'Code.gs'), 'utf8');
const shop = fs.readFileSync(path.join(root, 'UI', 'ShopFloor.html'), 'utf8');

// The administration screen is still the default; shop mode is an explicit
// route so the existing MVP remains available.
assert.match(server, /createTemplateFromFile\('UI\/Index'\)/);
assert.match(server, /createTemplateFromFile\('UI\/ShopFloor'\)/);
assert.match(server, /resolveShopJobByQr\s*\(/);
assert.match(server, /getShopFloorJob\s*\(/);
assert.match(server, /transitionShopFloorJob\s*\(/);
assert.match(server, /reportJobProblem\s*\(/);
assert.match(server, /resolveJobBlock\s*\(/);
assert.match(server, /listJobEvents\s*\(/);

// The browser remains a client only.  Spreadsheet access belongs behind the
// service/repository boundary in server-side Apps Script code.
assert.doesNotMatch(shop, /SpreadsheetApp|openById|getSheetByName|getRange\s*\(/);

// Every interactive request needs explicit success/failure handling, and the
// primary state-changing actions must be protected from double taps.
[
  'resolveShopJobByQr',
  'getShopFloorJob',
  'transitionShopFloorJob',
  'reportJobProblem',
  'resolveJobBlock',
  'listJobEvents'
].forEach((endpoint) => assert.match(shop, new RegExp('\\.' + endpoint + '\\s*\\(')));
assert.ok((shop.match(/withSuccessHandler/g) || []).length >= 6, 'Every shop-floor call needs a success handler.');
assert.ok((shop.match(/withFailureHandler/g) || []).length >= 6, 'Every shop-floor call needs a failure handler.');
assert.match(shop, /isPending\s*\(/, 'Shop-floor actions need a duplicate-submission guard.');
assert.match(shop, /setBusy\s*\(/, 'Shop-floor actions need visible saving state.');

// Critical Pass 1 controls and the audit timeline must remain discoverable in
// the touch UI.  This intentionally checks labels, not implementation details.
['START WORK', 'COMPLETE STEP', 'BLOCKED', 'STOP / PROBLEM', 'TOOL FAILURE', 'MACHINE ALARM', 'QUALITY ISSUE', 'MATERIAL ISSUE', 'PROGRAM ISSUE', 'FIXTURE ISSUE', 'WAITING ON CUSTOMER', 'OTHER', 'JOB HISTORY'].forEach((label) => {
  assert.ok(shop.includes(label), `Missing critical shop-floor control: ${label}`);
});

console.log('VMOS shop-floor UI safety contract tests passed');
