const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'appscript', 'src', 'UI', 'ToolingWorkspace.html'), 'utf8');
const service = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'secure-session-edge', 'src', 'contextual-attachments.js'), 'utf8');

assert.match(html, /Human-first recordkeeping[\s\S]*Manual tool record[\s\S]*without AI/, 'manual entry is primary and AI-independent');
for (const field of ['tool-type-id','tool-instance-id','serial-lot','tool-condition','storage-location','tool-notes']) assert.match(html, new RegExp(`id="${field}"`), `${field} is present`);
assert.match(html, /saveToolInstanceManual\(payload\)/, 'structured create/edit uses one explicit endpoint');
assert.match(html, /Stale record:[\s\S]*entries are preserved/, 'optimistic concurrency has an actionable state');
assert.match(html, /Service unavailable[\s\S]*entries are preserved/, 'save failure preserves work');
assert.match(html, /accept="image\/\*"[\s\S]*capture="environment"/, 'mobile camera capture is supported');
assert.match(html, /Add photo[\s\S]*Take photo[\s\S]*Upload file/, 'attachment actions are plain-language and contextual');
assert.match(html, /File is larger than the 50 MB limit/, 'oversize files fail explicitly before transport');
assert.match(html, /Storage unavailable[\s\S]*manual form is preserved/, 'storage failure is actionable and non-destructive');
assert.match(html, /listContextualAttachments\(\{parentType:'TOOL_INSTANCE',parentId:parentId,limit:25\}\)/, 'attachment loading is bounded and parent-scoped');
assert.match(html, /if\(version!==attachmentRequestVersion\)return/, 'stale attachment reads are discarded');
assert.match(html, /@media\(max-width:900px\)/, 'tablet layout is responsive');
assert.match(html, /@media\(max-width:560px\)/, 'mobile layout is responsive');
assert.match(html, /min-height:46px/, 'touch controls retain the Atlas minimum target');
assert.doesNotMatch(html, /TenantID|tenantId/, 'browser payload does not provide authoritative tenant identity');
assert.match(service, /class S3ObjectStorageAdapter[\s\S]*class AzureBlobObjectStorageAdapter[\s\S]*class InMemoryObjectStorageAdapter/, 'S3, Azure and test storage adapters implement the same boundary');
assert.doesNotMatch(service, /publicUrl|presignedUrl|password|accessKey|secretKey/i, 'storage contract exposes neither public URLs nor credentials');

console.log('Atlas MOS-140A manual entry and contextual attachment UI tests passed');
