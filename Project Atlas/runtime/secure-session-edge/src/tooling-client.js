const byId = (id) => document.getElementById(id);
const status = (id, text) => { byId(id).textContent = text; };
const root = '/api/tooling';
const page = document.querySelector('main');
const tenant = page.dataset.tenant;
let current;
let selectedId;
let selection = 0;
let searchGeneration = 0;
let evidence = [];
let nextCursor;
let busy = false;
let uploadAttempt;
let regrindVersion;
let uncertainRotation = false;
let staleSession = false;

function clearLocator() {
  status('locator', '');
  byId('locator-result').hidden = true;
}

function endSession(message) {
  staleSession = true;
  current = undefined;
  selection++;
  searchGeneration++;
  clearLocator();
  byId('selected').hidden = true;
  byId('results').replaceChildren();
  status('search-status', message);
  status('status', message);
}

async function request(path, options) {
  let response;
  try {
    response = await fetch(path, {
      ...options, headers: { ...options?.headers, 'x-atlas-tooling-tenant': tenant }
    });
  } catch {
    throw Error('The service could not be reached.');
  }
  if (!response.ok) {
    const messages = {
      400: 'Check the entered values.',
      401: 'Your session ended. Sign in again and reopen Tooling.',
      403: 'Access was denied. Check your permissions or reopen Tooling.',
      404: 'This record or service is unavailable.',
      409: 'The record changed. Review the latest details before retrying.',
      412: 'The active tenant changed. Reopen Tooling.',
      429: 'Too many requests. Wait a moment and try again.'
    };
    const message = messages[response.status] || 'The service is unavailable. Try again later.';
    if (response.status === 401 || response.status === 412) endSession(message);
    throw Object.assign(Error(message), { status: response.status });
  }
  try { return await response.json(); } catch { throw Error('The service returned an unreadable response.'); }
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

async function search(query, generation) {
  byId('results').replaceChildren();
  status('search-status', 'Searching…');
  try {
    const { data } = await request(root + '/tools?' + new URLSearchParams({ query }));
    if (generation !== searchGeneration) return;
    for (const tool of data) {
      const row = item('');
      const button = document.createElement('button');
      button.textContent = [tool.description, tool.toolInstanceId, tool.condition].join(' · ');
      button.addEventListener('click', () => {
        if (busy || staleSession) return;
        if (!byId('locator-result').hidden) {
          status('status', 'Acknowledge the replacement locator before selecting a tool.');
          byId('acknowledge-locator').focus();
          return;
        }
        const different = selectedId !== tool.toolInstanceId;
        if (different && (regrindVersion !== undefined || uploadAttempt)) {
          status('status', 'Resolve the pending save for this tool before selecting another.');
          byId('status').focus();
          return;
        }
        void select(tool, different);
      });
      row.append(button);
      byId('results').append(row);
    }
    status('search-status', data.length ? `${data.length} tools shown.` : 'No matching tools.');
  } catch (error) { if (generation === searchGeneration) status('search-status', error.message); }
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
    const selectedOption = byId('attachment').selectedOptions[0];
    const choice = selectedOption?.value;
    byId('attachment').replaceChildren(new Option('No evidence linked', ''), ...evidence
      .filter((entry) => entry.upload_status === 'AVAILABLE')
      .map((entry) => new Option(entry.file_name, entry.attachment_id)));
    if (choice) {
      if (![...byId('attachment').options].some((option) => option.value === choice)) {
        byId('attachment').append(new Option(selectedOption.text, choice));
      }
      byId('attachment').value = choice;
    }
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
  selectedId = tool.toolInstanceId;
  const path = toolPath(tool);
  if (moveFocus) {
    uploadAttempt = undefined;
    regrindVersion = undefined;
    byId('review-regrind').hidden = true;
    for (const form of ['upload', 'regrind', 'rotate']) byId(form).reset();
    byId('attachment').replaceChildren();
    clearLocator();
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
    if (busy || staleSession || !current) return;
    if (formId === 'rotate' && (uncertainRotation || !byId('locator-result').hidden)) {
      status('status', 'Capture and acknowledge the locator, or review history and reopen Tooling if rotation was interrupted.');
      return;
    }
    if (formId === 'regrind' && regrindVersion !== undefined && current.version !== regrindVersion) {
      status('status', 'Review the recorded measurement and history, then discard the reviewed draft before starting another regrind.');
      return;
    }
    const tool = current;
    const fields = new FormData(form);
    busy = true;
    const controls = [...document.querySelectorAll('#selected button, #selected input, #selected select, #results button')];
    for (const control of controls) control.disabled = true;
    status('status', 'Saving…');
    let sent = false;
    try {
      const session = await request('/session/status');
      if (encodeURIComponent(session.activeTenant) !== tenant) {
        endSession('The active tenant changed. Reopen Tooling.');
        return;
      }
      sent = true;
      await action(tool, fields, { 'x-atlas-csrf': session.csrfToken });
      if (staleSession) return;
      form.reset();
      if (formId === 'regrind') {
        regrindVersion = undefined;
        byId('review-regrind').hidden = true;
      }
      await select(tool);
      if (current) status('status', 'Saved.');
    } catch (error) {
      if (staleSession) return;
      const ambiguous = sent && (!error.status || error.status >= 500);
      if (ambiguous && formId === 'rotate') uncertainRotation = true;
      if ((ambiguous || error.status === 409) && formId === 'regrind') regrindVersion ??= tool.version;
      if (formId === 'upload' && !ambiguous) uploadAttempt = undefined;
      await select(tool);
      if (staleSession) return;
      byId('review-regrind').hidden = regrindVersion === undefined || !current;
      const message = ambiguous
        ? 'The save result is uncertain. ' + (formId === 'rotate'
          ? 'Review locator history before reopening Tooling. Rotation is paused.'
          : 'Review the updated details and history before retrying.')
        : error.message;
      status('status', message);
    } finally {
      busy = false;
      for (const control of controls) control.disabled = false;
      byId('file').disabled = Boolean(uploadAttempt);
      byId(byId('locator-result').hidden ? 'status' : 'locator').focus();
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
  const { data } = await post(tool, '/identifiers/replace', headers, {});
  if (staleSession) return;
  status('locator', 'New locator. Copy it onto the replacement label now: ' + data.opaqueToken);
  byId('locator-result').hidden = false;
});

mutation('upload', async (tool, _fields, headers) => {
  const file = byId('file').files[0];
  if (!file?.name || /[^\x20-\x7e]/.test(file.name)) {
    throw Object.assign(Error('Choose a file with a printable ASCII filename.'), { status: 400 });
  }
  uploadAttempt ??= { key: crypto.randomUUID() };
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
byId('acknowledge-locator').addEventListener('click', () => {
  clearLocator();
  byId('rotate').querySelector('button').focus();
});
byId('review-regrind').addEventListener('click', () => {
  byId('regrind').reset();
  regrindVersion = undefined;
  byId('review-regrind').hidden = true;
  byId('diameter').focus();
});
window.addEventListener('pagehide', clearLocator);
byId('search').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = byId('query').value.trim();
  if (busy || staleSession) return;
  if (query.length === 1) return status('search-status', 'Enter at least two characters or clear the search.');
  void runSearch(query);
});

async function runSearch(query) {
  const form = byId('search');
  const generation = ++searchGeneration;
  form.ariaBusy = 'true';
  try { await search(query, generation); } finally {
    if (generation === searchGeneration) form.ariaBusy = 'false';
  }
}

status('search-status', 'Checking your session…');
try {
  const session = await request('/session/status');
  if (encodeURIComponent(session.activeTenant) !== tenant) {
    endSession('The active tenant changed. Reopen Tooling.');
  } else {
    await runSearch('');
  }
} catch (error) { status('search-status', error.message); }
