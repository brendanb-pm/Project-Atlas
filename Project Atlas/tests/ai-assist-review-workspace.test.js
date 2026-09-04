const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'appscript', 'src', 'UI', 'ToolingWorkspace.html'), 'utf8');
const preview = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ui', 'tooling-preflight-preview.js'), 'utf8');

assert.match(html, /Optional acceleration[\s\S]*AI Assist[\s\S]*nothing is saved automatically/i, 'AI Assist is explicit and non-authoritative');
assert.match(html, /Current authoritative value[\s\S]*AI suggestion — not saved/, 'current and suggested values are semantically distinguished');
assert.match(html, /Accept suggestion[\s\S]*Use reviewed value[\s\S]*Reject/, 'field-level accept, edit-and-accept, and reject are available');
assert.match(html, /REQUIRES_HUMAN_INPUT[\s\S]*Requires manual measurement/, 'missing physical facts stay explicit');
for (const state of ['NOT_FOUND', 'AMBIGUOUS', 'CONFLICTING', 'INVALID']) assert.match(html, new RegExp(state), `${state} has honest review copy`);
assert.match(html, /startToolingAiAssist\(/, 'processing starts only from explicit operator action');
assert.doesNotMatch(html, /loadAttachments\([\s\S]{0,80}startToolingAiAssist\(/, 'attachment loading does not automatically invoke AI');
assert.match(html, /if\(version!==aiRequestVersion\)return/, 'stale AI responses cannot replace newer review state');
assert.match(html, /Your manual values and attachments are preserved/, 'provider failure leaves manual work intact');
assert.match(html, /FAILED_RETRYABLE/, 'retryable processing failures are represented');
assert.match(html, /FAILED_TERMINAL/, 'terminal processing failures are represented');
assert.match(html, /Retry AI Assist/, 'retryable processing failures expose an explicit retry action');
assert.match(html, /PROVIDER_NOT_CONFIGURED[\s\S]*RATE_LIMITED[\s\S]*UNSUPPORTED_MEDIA[\s\S]*MALFORMED_PROVIDER_OUTPUT/, 'safe provider failure classifications have operator guidance');
assert.match(html, /tool or evidence changed[\s\S]*review is preserved/i, 'stale/conflict recovery is explicit');
assert.match(html, /role="group" aria-label="Current and suggested/, 'comparison is accessible without color');
assert.match(html, /role="status" aria-live="polite"/, 'processing and decision states are announced');
assert.match(html, /min-height:46px/, 'touch targets retain the Atlas minimum');
assert.match(html, /@media\(max-width:560px\)[\s\S]*proposal-comparison\{grid-template-columns:1fr\}/, 'field comparison stacks on mobile');
assert.match(html, /Save reviewed values/, 'final authoritative boundary names the values being saved');
assert.match(preview, /ActualMeasuredDiameter[\s\S]*REQUIRES_HUMAN_INPUT/, 'render fixture exercises manual actual-diameter entry');
assert.match(preview, /startToolingAiAssist[\s\S]*reviewToolingAiProposal[\s\S]*commitToolingAiReview/, 'preview supports the complete review interaction');

console.log('Atlas MOS-140B-2 AI Assist review workspace tests passed');
