/**
 * Read-only operational metrics for the shop floor. Financial values are
 * order values, invoices, and payments; none are represented as revenue.
 */
function ShopDashboardService_(dependencies) {
  dependencies = dependencies || {};
  this.jobs = dependencies.jobs || new MvpService_('Job');
  this.quotes = dependencies.quotes || new MvpService_('Quote');
  this.invoices = dependencies.invoices || new MvpService_('Invoice');
  this.qrTokens = dependencies.qrTokens || new JobQrTokenRepository_();
  this.events = dependencies.events || new JobEventRepository_();
  this.getWorkflow = dependencies.getWorkflow || getShopWorkflow_;
  this.getStatusCategories = dependencies.getStatusCategories || getShopDashboardStatusCategories_;
  this.now = dependencies.now || function () { return new Date(); };
}

ShopDashboardService_.prototype.getLiveWip = function () {
  return this.buildMetrics_(this.shopJobs_());
};

ShopDashboardService_.prototype.getOperatorWorkload = function (operator) {
  if (!operator) throw new VmosValidationError_('Operator is required.');
  var normalizedOperator = normalizeDashboardText_(operator);
  var jobs = this.shopJobs_().filter(function (item) {
    return normalizedOperator === 'UNASSIGNED' ? !String(item.job.operator || '').trim() : normalizeDashboardText_(item.job.operator) === normalizedOperator;
  });
  var metrics = this.buildMetrics_(jobs);
  metrics.operator = operator;
  return metrics;
};

ShopDashboardService_.prototype.listOperatorWorkloads = function () {
  var self = this, shopJobs = this.shopJobs_(), operators = {};
  shopJobs.forEach(function (item) {
    var operator = String(item.job.operator || '').trim() || 'Unassigned';
    operators[normalizeDashboardText_(operator)] = operator;
  });
  return Object.keys(operators).sort().map(function (key) {
    return self.getOperatorWorkload(operators[key]);
  });
};

/**
 * Limits operational metrics to jobs with active, non-revoked QR assignment.
 * A job without that assignment cannot safely be classified against a workflow.
 */
ShopDashboardService_.prototype.shopJobs_ = function () {
  var tokensByJob = {}, duplicateTokenCount = 0, jobs = this.jobs.list();
  this.qrTokens.list().forEach(function (token) {
    if (token.revokedAt || !token.jobId || !token.workflowId) return;
    if (tokensByJob[token.jobId]) { duplicateTokenCount += 1; return; }
    tokensByJob[token.jobId] = token;
  });
  var configured = jobs.filter(function (job) { return !!tokensByJob[job.id]; }).map(function (job) {
    var token = tokensByJob[job.id];
    return { job: job, token: token, workflow: this.getWorkflow(token.workflowId) };
  }, this);
  configured.unconfiguredJobCount = jobs.filter(function (job) { return !tokensByJob[job.id]; }).length;
  configured.duplicateTokenCount = duplicateTokenCount;
  return configured;
};

ShopDashboardService_.prototype.buildMetrics_ = function (shopJobs) {
  var self = this, active = shopJobs.filter(function (item) { return !self.isComplete_(item); });
  var eventsByJob = this.eventsByJob_();
  var result = {
    activeJobs: active.length,
    readyToWorkJobs: active.filter(function (item) { return self.isReady_(item); }).length,
    blockedJobs: active.filter(function (item) { return self.isBlocked_(item); }).length,
    dueTodayJobs: active.filter(function (item) { return isDueOn_(item.job.dueDate, self.now()); }).length,
    dueThisWeekJobs: active.filter(function (item) { return isDueThisWeek_(item.job.dueDate, self.now()); }).length,
    needsClassificationJobs: active.filter(function (item) { return !self.isKnownStatus_(item); }).length,
    asOf: self.now(),
    // Financial totals are only calculated for active shop-configured jobs.
    linkedQuotedValue: 0,
    linkedInvoiceTotal: 0,
    linkedPaidValue: 0,
    jobsWithLinkedQuoteValue: 0,
    jobsWithoutLinkedQuoteValue: 0,
    jobsWithInvoiceRecords: 0,
    financialAvailability: {
      openOrderValueAvailable: false,
      reason: 'Jobs do not have an authoritative order-value field. Quote totals are reported only as linked quoted values; invoice totals and payments remain separate.'
    },
    jobs: [],
    unconfiguredJobCount: shopJobs.unconfiguredJobCount || 0,
    duplicateTokenCount: shopJobs.duplicateTokenCount || 0
  };
  var quotes = indexDashboardRecords_(this.quotes.list()), invoicesByJob = groupDashboardInvoices_(this.invoices.list());
  active.forEach(function (item) {
    var job = item.job, quote = quotes[job.quoteId], orderValue = dashboardNumber_(quote && quote.total);
    var jobInvoices = invoicesByJob[job.id] || [], invoiced = sumDashboard_(jobInvoices, 'total'), paid = sumDashboard_(jobInvoices, 'amountPaid');
    if (orderValue === null) result.jobsWithoutLinkedQuoteValue += 1;
    else {
      result.jobsWithLinkedQuoteValue += 1;
      result.linkedQuotedValue += orderValue;
    }
    if (jobInvoices.length) result.jobsWithInvoiceRecords += 1;
    result.linkedInvoiceTotal += invoiced;
    result.linkedPaidValue += paid;
    result.jobs.push(serializeVmosValue_({
      id: job.id, customerId: job.customerId, operator: job.operator, status: job.status, dueDate: job.dueDate,
      workflowId: item.token.workflowId, readyToWork: self.isReady_(item), blocked: self.isBlocked_(item), needsClassification: !self.isKnownStatus_(item),
      linkedQuotedValue: orderValue, linkedInvoiceTotal: invoiced, linkedPaidValue: paid,
      lastEventAt: eventsByJob[job.id] || null
    }));
  });
  return serializeVmosValue_(result);
};

ShopDashboardService_.prototype.eventsByJob_ = function () {
  var latest = {};
  this.events.list().forEach(function (event) {
    if (!event.jobId || !event.occurredAt) return;
    if (!latest[event.jobId] || String(event.occurredAt) > String(latest[event.jobId])) latest[event.jobId] = event.occurredAt;
  });
  return latest;
};

ShopDashboardService_.prototype.isBlocked_ = function (item) {
  var categories = this.getStatusCategories(item.token.workflowId, item.workflow);
  return (categories.blockedStatuses || []).map(normalizeDashboardText_).indexOf(normalizeDashboardText_(item.job.status)) !== -1;
};

ShopDashboardService_.prototype.isComplete_ = function (item) {
  var categories = this.getStatusCategories(item.token.workflowId, item.workflow);
  return (categories.completedStatuses || []).map(normalizeDashboardText_).indexOf(normalizeDashboardText_(item.job.status)) !== -1;
};

ShopDashboardService_.prototype.isReady_ = function (item) {
  if (this.isBlocked_(item) || this.isComplete_(item)) return false;
  var categories = this.getStatusCategories(item.token.workflowId, item.workflow);
  return (categories.readyStatuses || []).map(normalizeDashboardText_).indexOf(normalizeDashboardText_(item.job.status)) !== -1;
};
ShopDashboardService_.prototype.isKnownStatus_ = function (item) {
  return this.isBlocked_(item) || this.isComplete_(item) || this.isReady_(item) || normalizeDashboardText_(item.job.status) === 'RUNNING';
};

function normalizeDashboardText_(value) { return String(value || '').trim().toUpperCase(); }

/**
 * Status categories come from VMOS_DASHBOARD_STATUS_CATEGORIES, keyed by
 * workflow ID. Unknown statuses are deliberately never classified as ready.
 */
function getShopDashboardStatusCategories_(workflowId) {
  var raw = PropertiesService.getScriptProperties().getProperty('VMOS_DASHBOARD_STATUS_CATEGORIES');
  var categories = raw ? JSON.parse(raw) : {};
  var workflowCategories = categories[workflowId] || {};
  return {
    readyStatuses: Array.isArray(workflowCategories.readyStatuses) ? workflowCategories.readyStatuses : [],
    blockedStatuses: Array.isArray(workflowCategories.blockedStatuses) ? workflowCategories.blockedStatuses : ['BLOCKED'],
    completedStatuses: Array.isArray(workflowCategories.completedStatuses) ? workflowCategories.completedStatuses : ['COMPLETE']
  };
}

function dashboardNumber_(value) {
  if (value === '' || value === null || value === undefined || isNaN(Number(value))) return null;
  return Number(value);
}
function sumDashboard_(records, field) {
  return records.reduce(function (total, record) { var value = dashboardNumber_(record[field]); return total + (value === null ? 0 : value); }, 0);
}
function indexDashboardRecords_(records) {
  return records.reduce(function (index, record) { if (record.id) index[record.id] = record; return index; }, {});
}
function groupDashboardInvoices_(invoices) {
  return invoices.reduce(function (groups, invoice) {
    if (!invoice.jobId) return groups;
    (groups[invoice.jobId] || (groups[invoice.jobId] = [])).push(invoice);
    return groups;
  }, {});
}
function dashboardDate_(value) {
  if (!value) return null;
  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}
/** Due-date comparison uses the Apps Script project timezone (set it to the shop's business timezone). */
function dashboardDateKey_(value) {
  var date = dashboardDate_(value);
  return date ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd') : null;
}
function isDueOn_(value, now) {
  var dateKey = dashboardDateKey_(value), todayKey = dashboardDateKey_(now);
  return !!dateKey && dateKey === todayKey;
}
function isDueThisWeek_(value, now) {
  var dateKey = dashboardDateKey_(value), todayKey = dashboardDateKey_(now);
  if (!dateKey || !todayKey) return false;
  var start = new Date(todayKey + 'T12:00:00');
  var end = new Date(start); end.setDate(start.getDate() + 7);
  var date = new Date(dateKey + 'T12:00:00');
  return date >= start && date < end;
}
