const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'appscript', 'src');
const server = fs.readFileSync(path.join(root, 'UI', 'Code.gs'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'Services', 'NavigationService.gs'), 'utf8');
const shop = fs.readFileSync(path.join(root, 'UI', 'ShopFloor.html'), 'utf8');
const traveler = fs.readFileSync(path.join(root, 'UI', 'Traveler.html'), 'utf8');

// The administration screen is still the default; shop mode is an explicit
// route so the existing MVP remains available.
assert.match(server, /createTemplateFromFile\('UI\/'\+template\)/);
assert.match(navigation, /home:'Index'/);
assert.match(navigation, /'shop-floor':'ShopFloor'/);
assert.match(server, /resolveShopJobByQr\s*\(/);
assert.match(server, /getShopFloorJob\s*\(/);
assert.match(server, /getShopFloorWorkspace\s*\(/);
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
  'getShopFloorWorkspace',
  'transitionShopFloorJob',
  'reportJobProblem',
  'resolveJobBlock'
].forEach((endpoint) => assert.match(shop, new RegExp('\\.' + endpoint + '\\s*\\(')));
assert.ok((shop.match(/withSuccessHandler/g) || []).length >= 4, 'Every shop-floor call needs a success handler.');
assert.ok((shop.match(/withFailureHandler/g) || []).length >= 4, 'Every shop-floor call needs a failure handler.');
assert.match(shop, /if\(shopState\.busy/, 'Shop-floor actions need a duplicate-submission guard.');
assert.match(shop, /setBusy\s*\(/, 'Shop-floor actions need visible saving state.');
assert.match(shop, /transitionShopFloorJob\([^\n]+shopState\.token\)/, 'Transitions must present the resolved QR token.');
assert.match(shop, /reportJobProblem\([^\n]+shopState\.token\)/, 'Problem reports must present the resolved QR token.');
assert.match(shop, /resolveJobBlock\([^\n]+shopState\.token\)/, 'Block resolution must present the resolved QR token.');
assert.match(shop, /meta name="referrer" content="no-referrer"/, 'QR routes must not leak tokens through referrers.');
assert.match(traveler, /meta name="referrer" content="no-referrer"/, 'Traveler routes must not leak tokens through referrers.');
assert.doesNotMatch(traveler, /model\.qrToken/, 'Traveler UI must not display raw QR tokens.');

// Critical Pass 1 controls and the audit timeline must remain discoverable in
// the touch UI.  This intentionally checks labels, not implementation details.
['Start work', 'Complete operation', 'Report problem', 'Resolve block', 'Tool failure', 'Machine alarm', 'Quality issue', 'Material issue', 'Program issue', 'Fixture issue', 'Waiting on customer', 'Recent Job history'].forEach((label) => {
  assert.ok(shop.includes(label), `Missing critical shop-floor control: ${label}`);
});

console.log('VMOS shop-floor UI safety contract tests passed');
