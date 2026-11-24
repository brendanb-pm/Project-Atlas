const byId = (id) => document.getElementById(id);
const status = (id, text) => { byId(id).textContent = text; };
const root = '/api/tooling';
const page = document.querySelector('main');
let tenant;
let current;
let selection = 0;
let evidence = [];
let nextCursor;
let busy = false;
let uploadAttempt;

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const messages = {
      400: 'Check the entered values.',
      401: 'Your session ended. Sign in again and reopen Tooling.',
      403: 'Access was denied. Check your permissions or reopen Tooling.',
      404: 'This record or service is unavailable.',
      409: 'The record changed. Review the latest details before retrying.',
      429: 'Too many requests. Wait a moment and try again.'
    };
    throw Error(messages[response.status] || 'The service is unavailable. Try again later.');
  }
  return response.json();
}

function item(text) {
  const li = document.createElement('li');
  li.textContent = text;
  return li;
}

function measure(value, units) {
  return value == null ? 'Not recorded' : [value, units].filter(Boolean).join(' ');
}

function toolPath(tool) { return root + '/tools/' + encodeURIComponent(tool.toolInstanceId); }

async function search(query) {
  byId('results').replaceChildren();
  status('search-status', 'Searching…');
  try {
    const { data } = await request(root + '/tools?' + new URLSearchParams({ query }));
    for (const tool of data) {
      const row = item('');
      const button = document.createElement('button');
      button.textContent = [tool.description, tool.toolInstanceId, tool.condition].join(' · ');
      button.addEventListener('click', () => { if (!busy) void select(tool, true); });
      row.append(button);
      byId('results').append(row);
    }
    status('search-status', data.length ? `${data.length} tools shown.` : 'No matching tools.');
  } catch (error) { status('search-status', error.message); }
}

function renderTool(tool) {
  const fields = [
    ['Tool ID', tool.toolInstanceId], ['Condition', tool.condition],
    ['Location', tool.storageLocation], ['Serial or lot', tool.serialLotIdentifier],
    ['Nominal diameter', measure(tool.nominalDiameter, tool.unitSystem)],
    ['Measured diameter', measure(tool.currentMeasurement?.measuredDiameter, tool.unitSystem)],
    ['Measurement evidence', tool.currentMeasurement?.evidenceAttachmentId], ['Notes', tool.notes]
  ];
  byId('details').replaceChildren(...fields.flatMap(([label, value]) => {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value || '—';
    return [term, description];
  }));
  status('tool-heading', tool.description || 'Tool details');
  status('units', '(' + tool.unitSystem + ')');
  byId('writes').hidden = page.dataset.toolingWrite !== 'true';
  byId('upload').hidden = page.dataset.attachmentWrite !== 'true';
}

async function loadEvidence(path, id, cursor) {
  status('evidence-status', 'Loading evidence…');
  byId('more-evidence').hidden = true;
  try {
    const query = cursor ? '?' + new URLSearchParams({ cursor }) : '';
    const { data } = await request(path + '/attachments' + query);
    if (selection !== id) return;
    evidence.push(...data.items);
    nextCursor = data.nextCursor;
    const choice = byId('attachment').value;
    byId('attachment').replaceChildren(new Option('No evidence linked', ''), ...evidence
      .filter((entry) => entry.upload_status === 'AVAILABLE')
      .map((entry) => new Option(entry.file_name, entry.attachment_id)));
    if (evidence.some((entry) => entry.attachment_id === choice)) byId('attachment').value = choice;
    byId('evidence').replaceChildren(...evidence.map((entry) => item(
      [entry.file_name, entry.category, entry.upload_status, entry.description].filter(Boolean).join(' · '))));
    status('evidence-status', evidence.length ? '' : 'No evidence attached.');
  } catch (error) {
    if (selection === id) status('evidence-status', error.message);
  } finally {
    if (selection === id) byId('more-evidence').hidden = !nextCursor;
  }
}

async function loadHistory(path, id) {
  status('history-status', 'Loading history…');
  try {
    const { data } = await request(path + '/history');
    if (selection !== id) return;
    byId('history').replaceChildren(...data.map((event) => {
      const details = event.details || {};
      return item([event.event_type.replaceAll('_', ' ').toLowerCase(),
        new Date(event.event_at).toLocaleString(), details.fileName, details.reason,
        details.diameter == null ? '' : measure(details.diameter, details.unitSystem)].filter(Boolean).join(' · '));
    }));
    status('history-status', data.length ? 'Latest ' + data.length + ' events.' : 'No history recorded.');
  } catch (error) { if (selection === id) status('history-status', error.message); }
}

async function select(tool, moveFocus = false) {
  const id = ++selection;
  const path = toolPath(tool);
  if (moveFocus) {
    uploadAttempt = undefined;
    for (const form of ['upload', 'regrind', 'rotate']) byId(form).reset();
    status('locator', '');
    status('tool-heading', 'Tool details');
    byId('tool-heading').focus();
  }
  current = undefined;
  byId('selected').hidden = true;
  for (const region of ['evidence', 'history']) byId(region).replaceChildren();
  evidence = [];
  nextCursor = null;
  status('status', 'Loading tool…');
  try {
    const { data } = await request(path);
    if (selection !== id) return;
    current = data;
    renderTool(data);
    byId('selected').hidden = false;
    status('status', '');
    await Promise.all([loadEvidence(path, id), loadHistory(path, id)]);
  } catch (error) { if (selection === id) status('status', error.message); }
}

function mutation(formId, action) {
  const form = byId(formId);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !current) return;
    const tool = current;
    const fields = new FormData(form);
    busy = true;
    const controls = [...document.querySelectorAll('#selected button, #results button')];
    for (const control of controls) control.disabled = true;
    status('status', 'Saving…');
    try {
      const session = await request('/session/status');
      if (session.activeTenant !== tenant) {
        location.reload();
        return;
      }
      await action(tool, fields, { 'x-atlas-csrf': session.csrfToken });
      form.reset();
      await select(tool);
      if (current) status('status', 'Saved.');
    } catch (error) {
      await select(tool);
      status('status', error.message + ' Review the current details and history before retrying.');
    } finally {
      busy = false;
      for (const control of controls) control.disabled = false;
      byId('status').focus();
    }
  });
}

function post(tool, suffix, headers, body) {
  return request(toolPath(tool) + suffix, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
}

mutation('regrind', (tool, fields, headers) => post(tool, '/regrinds', headers, {
  expectedVersion: tool.version,
  measuredDiameter: Number(fields.get('diameter')),
  unitSystem: tool.unitSystem,
  reason: fields.get('reason'),
  evidenceAttachmentId: fields.get('attachment') || null
}));

mutation('rotate', async (tool, _fields, headers) => {
  status('locator', '');
  const { data } = await post(tool, '/identifiers/replace', headers, {});
  status('locator', 'New locator. Copy it onto the replacement label now: ' + data.opaqueToken);
});

mutation('upload', async (tool, fields, headers) => {
  const file = fields.get('file');
  if (!file.name || /[^\x20-\x7e]/.test(file.name)) throw Error('Choose a file with a printable ASCII filename.');
  const selectedFile = byId('file').files[0];
  if (uploadAttempt?.file !== selectedFile) uploadAttempt = { file: selectedFile, key: crypto.randomUUID() };
  await request(toolPath(tool) + '/attachments', {
    method: 'POST',
    headers: { ...headers, 'content-type': file.type || 'application/octet-stream',
      'x-atlas-file-name': file.name, 'x-atlas-attachment-category': 'INSPECTION',
      'x-atlas-idempotency-key': uploadAttempt.key },
    body: file
  });
  uploadAttempt = undefined;
});

byId('more-evidence').addEventListener('click', () => {
  if (current && !busy && nextCursor) void loadEvidence(toolPath(current), selection, nextCursor);
});
byId('search').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = byId('query').value.trim();
  if (busy || !tenant || byId('search').ariaBusy === 'true') return;
  if (query.length === 1) return status('search-status', 'Enter at least two characters or clear the search.');
  void runSearch(query);
});

async function runSearch(query) {
  const form = byId('search');
  form.ariaBusy = 'true';
  try { await search(query); } finally { form.ariaBusy = 'false'; }
}

status('search-status', 'Checking your session…');
try {
  const session = await request('/session/status');
  tenant = session.activeTenant;
  await runSearch('');
} catch (error) { status('search-status', error.message); }
