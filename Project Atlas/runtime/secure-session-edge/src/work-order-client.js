const byId = (id) => document.getElementById(id);
const approval = byId('approve');
const status = byId('message');
let order;
let olderThan;
let busy = false;

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

const endpoint = (id) => `/api/work-orders/${encodeURIComponent(id)}`;
const labels = {
  APPROVAL_REQUIRED: 'Production scope needs approval.',
  OPERATIONS_INCOMPLETE: 'Complete all approved required operations before closing this job.',
  READY: 'Ready for production completion.',
  COMPLETE: 'Production complete.',
  COMPLETED: 'Production complete.',
  CANCELLED: 'Job cancelled.'
};

async function fetchData(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
  return result.data ?? result;
}

async function perform(action) {
  if (busy) return;
  busy = true;
  try {
    status.textContent = 'Working…';
    await action();
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    busy = false;
  }
}

function button(text, action) {
  const node = element('button', text);
  node.type = 'button';
  node.addEventListener('click', () => perform(action));
  return node;
}

function scopeDetails(scope) {
  const price = scope.approvedPrice;
  return {
    'Approved services': scope.services?.join(', '),
    'Finish or coating': scope.finish,
    'Required finish operation': scope.finishOperationCode,
    'Customer commitments': scope.customerCommitments,
    'Approved price': price && `${price.amount} ${price.currency}`,
    'Due': scope.dueAt,
    'Special instructions': scope.specialInstructions,
    'Handoffs': scope.handoffs?.join(', '),
    'Evidence': scope.evidenceReferences?.join(', ')
  };
}

function renderScope(target, scope) {
  target.replaceChildren();
  for (const [label, value] of Object.entries(scopeDetails(scope))) {
    const pair = element('div', '');
    pair.append(element('dt', label), element('dd', value || '—'));
    target.append(pair);
  }
}

async function load(id) {
  order = await fetchData(endpoint(id));
  const { job, approved, operations, readiness, bin, capabilities } = order;
  const scope = approved?.scope || {};
  byId('detail').hidden = false;
  byId('title').textContent = `${job.job_id}${job.title ? ' · ' + job.title : ''}`;
  byId('readiness').textContent = labels[readiness] || readiness;
  byId('bin').textContent = bin ? `WIP bin ${bin.bin_label} · ${bin.current_location}` : 'No active WIP bin';
  renderScope(byId('scope'), scope);
  const canOperate = capabilities.includes('WORK_ORDER_OPERATE');
  byId('complete').hidden = !canOperate || readiness !== 'READY';
  const approvedOps = new Map((scope.operations || []).map((item) => [item.jobOperationId, item]));
  byId('operations').replaceChildren(...operations.map((operation) => {
    const entry = approvedOps.get(operation.job_operation_id);
    const row = element('li', `${operation.operation_code} · ${operation.status}${entry?.instructions ? ' · ' + entry.instructions : ''}`);
    if (canOperate && entry && readiness === 'OPERATIONS_INCOMPLETE' && !['COMPLETE', 'COMPLETED', 'CANCELLED'].includes(operation.status)) {
      row.append(' ', button('Mark complete', () => mutate(`operations/${encodeURIComponent(operation.job_operation_id)}/complete`)));
    }
    return row;
  }));
  approval.hidden = !capabilities.includes('WORK_ORDER_APPROVE') || ['COMPLETE', 'COMPLETED', 'CANCELLED'].includes(job.status);
  approval.reset();
  for (const name of ['finish', 'finishOperationCode', 'customerCommitments', 'specialInstructions']) approval.elements[name].value = scope[name] || '';
  for (const name of ['services', 'handoffs', 'evidenceReferences']) approval.elements[name].value = scope[name]?.join('\n') || '';
  approval.elements.dueAt.value = scope.dueAt || job.due_at || '';
  approval.elements.amount.value = scope.approvedPrice?.amount || '';
  approval.elements.currency.value = scope.approvedPrice?.currency || '';
  byId('history').replaceChildren();
  olderThan = null;
  await loadHistory();
}

async function loadHistory() {
  const suffix = olderThan ? `?before=${olderThan}` : '';
  const history = await fetchData(endpoint(order.job.job_id) + '/history' + suffix);
  for (const record of history) {
    const row = element('li', '');
    const details = element('details', '');
    const scope = element('dl', '');
    renderScope(scope, record.scope);
    details.append(element('summary', `Revision ${record.revision} · ${record.change_summary}`),
      element('p', `Approved by ${record.approved_by_user_id} on ${new Date(record.approved_at).toLocaleString()}`),
      element('p', record.authorization_source), scope,
      element('p', record.scope.operations.map((item) => [item.code, item.instructions].filter(Boolean).join(' · ')).join(', ')));
    row.append(details);
    byId('history').append(row);
  }
  olderThan = history.at(-1)?.revision;
  byId('older').hidden = history.length < 50;
}

async function queue() {
  const jobs = await fetchData('/api/work-orders');
  byId('queue').replaceChildren(...jobs.map((entry) => {
    const row = element('li', '');
    row.append(button(entry.job_id, () => load(entry.job_id)), ` ${entry.operation_code} · ${entry.status}${entry.finish ? ' · ' + entry.finish : ''}`);
    return row;
  }));
  if (!jobs.length) byId('queue').append(element('li', 'No outstanding approved operations.'));
}

async function mutate(action, input = {}) {
  const { csrfToken } = await fetchData('/session/status');
  const id = order.job.job_id;
  await fetchData(endpoint(id) + '/' + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atlas-csrf': csrfToken },
    body: JSON.stringify({ ...input, expectedVersion: order.job.version })
  });
  await load(id);
  await queue();
}

byId('open').addEventListener('submit', (event) => {
  event.preventDefault();
  perform(() => load(new FormData(event.target).get('jobId').trim()));
});
byId('complete').addEventListener('click', () => perform(() => mutate('complete')));
byId('older').addEventListener('click', () => perform(loadHistory));
approval.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(approval));
  const lines = (name) => form[name].split('\n').map((line) => line.trim()).filter(Boolean);
  perform(() => mutate('approve', {
    ...form,
    services: lines('services'),
    handoffs: lines('handoffs'),
    evidenceReferences: lines('evidenceReferences'),
    approvedPrice: form.amount || form.currency ? { amount: form.amount, currency: form.currency } : null,
    operationsToAdd: form.operationCode ? [{ code: form.operationCode, instructions: form.operationInstructions }] : []
  }));
});
perform(async () => {
  await queue();
  const jobId = new URLSearchParams(location.search).get('job');
  if (jobId) await load(jobId);
});
