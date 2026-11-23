import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [origin, playwrightModule, editorState, readerState] = process.argv.slice(2);
const url = new URL(origin);
assert.equal(url.origin, origin);
assert.equal(url.protocol, 'https:');
assert(process.env.MOS140C_ACCEPTANCE_HOST === url.hostname, 'Explicit acceptance hostname required');
const { request } = await import(pathToFileURL(playwrightModule).href);
const contexts = [];
async function client(storageState) {
  const context = await request.newContext({ baseURL: origin, storageState, maxRedirects: 0, timeout: 15000 });
  contexts.push(context);
  return context;
}
async function success(response, code) {
  assert.equal(response.status(), code);
  return response.json();
}

try {
  const [guest, editor, reader] = await Promise.all([client(), client(editorState), client(readerState)]);
  await success(await guest.get('/ready'), 200);
  assert.equal((await guest.get('/api/tooling/tools')).status(), 401);
  const editSession = await success(await editor.get('/session/status'), 200);
  const readSession = await success(await reader.get('/session/status'), 200);
  assert.equal(editSession.activeTenant, 'ACCEPTANCE-A');
  assert.equal(readSession.activeTenant, 'ACCEPTANCE-B');
  const headers = { origin, 'x-atlas-csrf': editSession.csrfToken };
  const type = { toolTypeId: 'TOOL-TYPE-' + randomUUID(), description: 'Synthetic acceptance end mill',
    toolClass: 'END_MILL', unitSystem: 'INCH', nominalDiameter: 0.5 };
  assert.equal((await reader.post('/api/tooling/tool-types', {
    headers: { origin, 'x-atlas-csrf': readSession.csrfToken }, data: type
  })).status(), 403);
  await success(await editor.post('/api/tooling/tool-types', { headers, data: type }), 201);
  const tool = 'TOOL-' + randomUUID();
  await success(await editor.post('/api/tooling/tools', {
    headers, data: { toolInstanceId: tool, toolTypeId: type.toolTypeId, condition: 'NEW', storageLocation: 'ACCEPTANCE-CRIB' }
  }), 201);
  const path = '/api/tooling/tools/' + tool;
  assert.equal((await reader.get(path, { headers: { 'x-atlas-tenant': 'ACCEPTANCE-A' } })).status(), 404);
  const attachment = await success(await editor.post(path + '/attachments', {
    headers: { ...headers, 'content-type': 'text/plain', 'x-atlas-file-name': 'inspection.txt',
      'x-atlas-attachment-category': 'INSPECTION', 'x-atlas-idempotency-key': randomUUID() },
    data: Buffer.from('Synthetic measurement 0.4875 in')
  }), 201);
  await success(await editor.post(path + '/regrinds', {
    headers, data: { expectedVersion: 1, measuredDiameter: 0.4875, unitSystem: 'INCH',
      reason: 'Synthetic acceptance', evidenceAttachmentId: attachment.data.attachment_id }
  }), 201);
  const measurements = [];
  for (let index = 0; index < 25; index += 1) {
    const start = performance.now();
    const result = await success(await editor.get(path), 200);
    assert.equal(result.data.currentMeasurement.measuredDiameter, 0.4875);
    measurements.push(performance.now() - start);
  }
  measurements.sort((a, b) => a - b);
  console.log(JSON.stringify({ samples: measurements.length, p95Ms: Math.round(measurements[23]) }));
} finally {
  await Promise.all(contexts.map((context) => context.dispose()));
}
