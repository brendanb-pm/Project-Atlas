const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'appscript', 'src');
const server = fs.readFileSync(path.join(root, 'UI', 'Code.gs'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'Services', 'NavigationService.gs'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'UI', 'OperationsDashboard.html'), 'utf8');
const traveler = fs.readFileSync(path.join(root, 'UI', 'Traveler.html'), 'utf8');

assert.match(server, /createTemplateFromFile\('UI\/'\+template\)/);
assert.match(navigation, /home:'Index'/);
assert.match(navigation, /'operations-dashboard':'OperationsDashboard'/);
assert.match(navigation, /traveler:'traveler'/);
['getShopDashboard', 'getShopOperatorWorkloads', 'getTravelerPrintData'].forEach((endpoint) => assert.match(server, new RegExp(endpoint + '\\s*\\(')));

[dashboard, traveler].forEach((client) => {
  assert.doesNotMatch(client, /SpreadsheetApp|openById|getSheetByName|getRange\s*\(/);
  assert.match(client, /withSuccessHandler\s*\(/);
  assert.match(client, /withFailureHandler\s*\(/);
});

assert.match(dashboard, /not employee-surveillance reporting/i);
assert.match(dashboard, /not recognized revenue/i);
assert.match(dashboard, /readyToWorkJobs/);
assert.match(dashboard, /blockedJobs/);
assert.match(traveler, /SCAN FOR CURRENT WORK ORDER/);
assert.match(traveler, /window\.print\s*\(/);
assert.match(traveler, /getTravelerPrintData\s*\(/);

console.log('VMOS Pass 2 UI safety contract tests passed');
