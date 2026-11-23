import { errors } from './errors.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ID = '[A-Za-z0-9][A-Za-z0-9._:-]{0,127}';
const decode = (value) => { try { return decodeURIComponent(value); } catch { throw errors.invalidInput(); } };
const limit = (value, fallback = 25) => { const result = Number(value ?? fallback); if (!Number.isInteger(result) || result < 1 || result > 100) throw errors.invalidInput(); return result; };
const header = (request, name, maximum = 256, required = false) => { const value = String(request.headers[name] || '').trim(); if ((required && !value) || value.length > maximum) throw errors.invalidInput(); return value; };

/** Fixed, allow-listed route table. It exposes service contracts, never SQL,
 * tenant selection, user selection, or client-provided capabilities. */
export class ToolingProtectedApi {
  constructor({ tooling, attachments = null, ai = null, reviews = null } = {}) {
    if (!tooling) throw new Error('Tooling API requires the canonical tooling service.');
    this.tooling = tooling; this.attachments = attachments; this.ai = ai; this.reviews = reviews;
  }
  match(method, url) {
    const path = url.pathname;
    if (method === 'POST' && path === '/api/tooling/tool-types') return mutation('TOOLING_TYPE_CREATE', 'TOOLING_WRITE', (c, b) => this.tooling.createToolType(c, b), 201);
    if (method === 'POST' && path === '/api/tooling/tools') return mutation('TOOLING_INSTANCE_CREATE', 'TOOLING_WRITE', (c, b) => this.tooling.registerToolInstance(c, b), 201);
    if (method === 'POST' && path === '/api/tooling/identifiers') return mutation('TOOLING_IDENTIFIER_CREATE', 'TOOLING_WRITE', (c, b) => this.tooling.issueIdentifier(c, b), 201);
    if (method === 'GET' && path === '/api/tooling/tools') return read('TOOLING_SEARCH', 'TOOLING_READ', (c) => this.tooling.search(c, String(url.searchParams.get('query') || ''), limit(url.searchParams.get('limit'))));
    let match = path.match(new RegExp(`^/api/tooling/tools/(${ID})$`));
    if (match && method === 'GET') return read('TOOLING_GET', 'TOOLING_READ', (c) => this.tooling.get(c, decode(match[1])));
    if (match && method === 'PATCH') return mutation('TOOLING_UPDATE', 'TOOLING_WRITE', (c, b) => this.tooling.updateToolInstance(c, { ...b, toolInstanceId: decode(match[1]) }));
    match = path.match(new RegExp(`^/api/tooling/tools/(${ID})/regrinds$`));
    if (match && method === 'POST') return mutation('TOOLING_REGRIND', 'TOOLING_WRITE', (c, b) => this.tooling.recordRegrind(c, { ...b, toolInstanceId: decode(match[1]) }), 201);
    match = path.match(new RegExp(`^/api/tooling/tools/(${ID})/conditions$`));
    if (match && method === 'POST') return mutation('TOOLING_CONDITION', 'TOOLING_WRITE', (c, b) => this.tooling.transitionCondition(c, { ...b, toolInstanceId: decode(match[1]) }));
    match = path.match(new RegExp(`^/api/tooling/tools/(${ID})/history$`));
    if (match && method === 'GET') return read('TOOLING_HISTORY', 'TOOLING_READ', (c) => this.tooling.history(c, decode(match[1]), limit(url.searchParams.get('limit'))));
    match = path.match(new RegExp(`^/api/tooling/tools/(${ID})/identifiers/replace$`));
    if (match && method === 'POST') return mutation('TOOLING_IDENTIFIER_REPLACE', 'TOOLING_WRITE', (c, b) => this.tooling.replacePhysicalIdentifier(c, decode(match[1]), b.opaqueToken));
    match = path.match(new RegExp(`^/api/tooling/identifiers/(${ID})/revoke$`));
    if (match && method === 'POST') return mutation('TOOLING_IDENTIFIER_REVOKE', 'TOOLING_WRITE', (c) => this.tooling.revokePhysicalIdentifier(c, decode(match[1])));
    if (method === 'GET' && path === '/api/tooling/locators/resolve') return read('TOOLING_IDENTIFIER_RESOLVE', 'TOOLING_READ', (c) => this.tooling.scan(c, String(url.searchParams.get('token') || '')));
    match = path.match(new RegExp(`^/api/tooling/tools/(${ID})/attachments$`));
    if (match && method === 'GET' && this.attachments) return read('TOOLING_ATTACHMENT_LIST', 'ATTACHMENT_READ', (c) => this.attachments.list(c, { parentType: 'TOOL_INSTANCE', parentId: decode(match[1]), limit: limit(url.searchParams.get('limit')), cursor: url.searchParams.get('cursor') || null }));
    if (match && method === 'POST' && this.attachments) return binaryMutation('TOOLING_ATTACHMENT_UPLOAD', 'ATTACHMENT_WRITE', (c, body, _url, request) => this.attachments.upload(c, { parentType: 'TOOL_INSTANCE', parentId: decode(match[1]), body, byteSize: body.byteLength, fileName: header(request, 'x-atlas-file-name', 240, true), mediaType: header(request, 'content-type', 160, true), category: header(request, 'x-atlas-attachment-category', 40) || 'GENERAL', description: header(request, 'x-atlas-description', 1000), idempotencyKey: header(request, 'x-atlas-idempotency-key', 256, true) }), 201);
    match = path.match(new RegExp(`^/api/tooling/attachments/(${ID})$`));
    if (match && method === 'PATCH' && this.attachments) return mutation('TOOLING_ATTACHMENT_UPDATE', 'ATTACHMENT_WRITE', (c, b) => this.attachments.updateMetadata(c, { ...b, attachmentId: decode(match[1]) }));
    if (match && method === 'DELETE' && this.attachments) return mutation('TOOLING_ATTACHMENT_ARCHIVE', 'ATTACHMENT_WRITE', (c, b) => this.attachments.archive(c, { ...b, attachmentId: decode(match[1]) }));
    if (method === 'POST' && path === '/api/tooling/ai/jobs' && this.ai) return mutation('TOOLING_AI_REQUEST', 'AI_PROCESS', (c, b) => this.ai.request(c, b), 202);
    match = path.match(new RegExp(`^/api/tooling/ai/jobs/(${ID})$`));
    if (match && method === 'GET' && this.ai) return read('TOOLING_AI_GET', 'AI_PROCESS_READ', (c) => this.ai.get(c, decode(match[1])));
    if (match && method === 'POST' && this.ai) return mutation('TOOLING_AI_RETRY', 'AI_PROCESS', (c) => this.ai.retry(c, decode(match[1])), 202);
    match = path.match(new RegExp(`^/api/tooling/ai/jobs/(${ID})/reviews$`));
    if (match && method === 'POST' && this.reviews) return mutation('TOOLING_AI_REVIEW_BEGIN', 'AI_PROCESS_READ', (c, b) => this.reviews.begin(c, { ...b, processingJobId: decode(match[1]) }), 201);
    match = path.match(new RegExp(`^/api/tooling/ai/reviews/(${ID})$`));
    if (match && method === 'GET' && this.reviews) return read('TOOLING_AI_REVIEW_GET', 'AI_PROCESS_READ', (c) => this.reviews.get(c, decode(match[1])));
    if (match && method === 'POST' && this.reviews) return mutation('TOOLING_AI_REVIEW_DECIDE', 'AI_PROCESS_READ', (c, b) => this.reviews.decide(c, { ...b, reviewSessionId: decode(match[1]) }));
    match = path.match(new RegExp(`^/api/tooling/ai/reviews/(${ID})/commit$`));
    if (match && method === 'POST' && this.reviews) return mutation('TOOLING_AI_REVIEW_COMMIT', 'TOOLING_WRITE', (c, b) => this.reviews.commitTooling(c, { ...b, reviewSessionId: decode(match[1]) }));
    return null;
  }
}

function read(operation, capability, execute) { return { operation, capability, mutation: false, body: false, execute }; }
function mutation(operation, capability, execute, status = 200) { return { operation, capability, mutation: true, status, execute }; }
function binaryMutation(operation, capability, execute, status = 200) { return { operation, capability, mutation: true, binary: true, maxBytes: MAX_UPLOAD_BYTES, status, execute }; }
