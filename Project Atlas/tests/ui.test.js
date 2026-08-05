const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'appscript', 'src');
const ui = fs.readFileSync(path.join(root, 'UI', 'Index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'UI', 'Code.gs'), 'utf8');

assert.match(server, /createTemplateFromFile\('UI\/Index'\)/);
assert.match(ui, /withSuccessHandler/g);
assert.match(ui, /withFailureHandler/g);
assert.ok((ui.match(/withSuccessHandler/g) || []).length >= 3, 'Every interactive server call needs a success handler.');
assert.ok((ui.match(/withFailureHandler/g) || []).length >= 3, 'Every interactive server call needs a failure handler.');
assert.match(ui, /if\(isPending\(key\)\|\|!form\.reportValidity\(\)\)return/);
assert.match(ui, /setBusy\(key,true,button\)/);
assert.match(ui, /setBusy\(key,false,button\)/);
assert.match(ui, /createMvpRecord\(entity,values\)/);
assert.match(ui, /updateMvpRecord\(entity,id,changes\)/);
assert.match(ui, /state\.showCreate=false/);
assert.match(ui, /state\.selected=\{entity:entity,id:id\}/);
assert.match(ui, /refreshData\(\)/);
assert.match(ui, /Save Changes/);
assert.match(ui, /Cancel/);

console.log('VMOS UI safety contract tests passed');
