const assert=require('assert');
const fs=require('fs');
const path=require('path');
const base=path.join(__dirname,'..','appscript','src');
const code=fs.readFileSync(path.join(base,'UI','Code.gs'),'utf8');
const registry=fs.readFileSync(path.join(base,'Services','EndpointAuthorizationRegistry.gs'),'utf8');
const callableNames=Array.from(code.matchAll(/^function\s+([A-Za-z0-9_]+)\(/gm)).map(match=>match[1]).filter(name=>!name.endsWith('_')&&name!=='doGet');
assert.ok(callableNames.length>30,'Expected the complete callable surface.');
callableNames.forEach(name=>{
  assert.match(registry,new RegExp('(?:^|\\s)'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*:'),name+' must be classified.');
  const line=code.split(/\r?\n/).find(candidate=>candidate.includes('function '+name+'('));
  assert.ok(line.includes("callable_('"+name+"'"),name+' must enter the universal callable boundary.');
});
const classified=Array.from(registry.matchAll(/([A-Za-z][A-Za-z0-9_]*):\{kind:/g)).map(match=>match[1]);
callableNames.forEach(name=>assert.ok(classified.includes(name),name+' must remain in the callable inventory.'));
['doGet','initializeIdeasPersistence','initializeShopOperationalPersistence'].forEach(name=>assert.ok(classified.includes(name),name+' must be classified across the complete source tree.'));
function sourceFiles(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(path.join(directory,entry.name)):entry.name.endsWith('.gs')?[path.join(directory,entry.name)]:[]);}
const wholeTreePublic=[];
sourceFiles(base).forEach(file=>{const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)){if(!match[1].endsWith('_'))wholeTreePublic.push(match[1]);}});
assert.deepEqual([...new Set(wholeTreePublic)].sort(),classified.sort(),'Every browser-callable top-level function must be explicitly classified; internal functions must end in underscore.');
assert.doesNotMatch(fs.readFileSync(path.join(base,'Services','IdentityAuthorizationService.gs'),'utf8'),/^function\s+(?:trustedSystemExecute|recoverSecurityOperation)\s*\(/m,'Trusted system execution must remain Apps Script-private.');
assert.match(registry,/enforceAbuseControl_[\s\S]*authorizedExecute_/,'Abuse screening must precede authorization.');
assert.doesNotMatch(code,/getVmosAuditUser_\(/,'Callable endpoints must not derive audit identity from deployment/session fallback.');
assert.doesNotMatch(code,/\.approve\(id,approver/,'Client approver must not reach purchase approval.');
assert.doesNotMatch(code,/recordReceipt\(id,reference,actor/,'Client receipt actor must not reach persistence.');
console.log('Atlas callable endpoint authorization coverage tests passed:',callableNames.length,'classified endpoints');
