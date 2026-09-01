const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'appscript', 'src', 'UI', 'ToolingWorkspace.html'), 'utf8');
const preview = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ui', 'tooling-preflight-preview.js'), 'utf8');

assert.match(html, /SCAN[\s\S]*SELECT[\s\S]*ASSIGN[\s\S]*PREFLIGHT[\s\S]*READY \/ BLOCKED[\s\S]*RUN/, 'operator workflow is explicit');
assert.match(html, /geometry-card actual[\s\S]*geometry-label">ACTUAL/, 'ACTUAL geometry is prominent and distinct');
assert.match(html, /geometry-label">NOMINAL/, 'nominal geometry remains visible');
assert.match(html, /aria-live="polite"/, 'state changes are announced');
assert.match(html, /:focus|focus-visible|atlas-button/, 'keyboard-operable controls use the Atlas control system');
assert.match(html, /min-height:46px/, 'machine/tablet controls have touch-friendly targets');
assert.match(html, /@media\(max-width:900px\)/, 'tablet layout is responsive');
assert.match(html, /@media\(max-width:560px\)/, 'narrow layout is responsive');
assert.match(html, /Loading current physical state/, 'loading state is visible');
assert.match(html, /No tooling found/, 'empty/not-found state is visible');
assert.match(html, /Tooling unavailable/, 'unavailable/error state is visible');
assert.match(html, /Retry/, 'retry is available');
assert.match(html, /if\(version!==requestVersion\)return/, 'stale async responses are discarded');
assert.match(html, /getToolingWorkspace\(String\(query\|\|''\),25\)/, 'routine search payload is bounded');
for (const state of ['nominal','regrind','unverified','blocked','holder','empty','quarantined','stale','unavailable']) assert.match(preview, new RegExp(state), `${state} preview state exists`);
assert.match(preview, /0\.4975/);
assert.match(preview, /0\.004/);

console.log('Atlas MOS-138 tooling workspace code-level tests passed');
