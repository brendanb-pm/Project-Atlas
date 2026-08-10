/** Repository wrappers for append-only job events and opaque QR tokens. */
function createOperationalRepository_(entityName, mapping) {
  var config = getShopOperationalConfig_();
  return new SheetsRepository_(entityName, mapping, SpreadsheetApp.openById(config.spreadsheetId));
}

function JobEventRepository_() {
  this.repository = createOperationalRepository_('JobEvent', getShopOperationalConfig_().eventMapping);
}
JobEventRepository_.prototype.list = function () { return this.repository.list(); };
JobEventRepository_.prototype.findById = function (eventId) { return this.repository.findById(eventId); };
JobEventRepository_.prototype.append = function (event) {
  if (!event || !event.id) throw new VmosValidationError_('Job event ID is required.');
  return this.repository.insert(event);
};
JobEventRepository_.prototype.listByJobId = function (jobId) {
  return this.list().filter(function (event) { return String(event.jobId) === String(jobId); });
};

function JobQrTokenRepository_() {
  this.repository = createOperationalRepository_('JobQrToken', getShopOperationalConfig_().qrMapping);
}
JobQrTokenRepository_.prototype.list = function () { return this.repository.list(); };
JobQrTokenRepository_.prototype.findByToken = function (token) { return this.repository.findById(token); };
JobQrTokenRepository_.prototype.create = function (record) {
  if (!record || !record.id) throw new VmosValidationError_('QR token is required.');
  if (!record.jobId) throw new VmosValidationError_('Job ID is required for a QR token.');
  return this.repository.insert(record);
};
JobQrTokenRepository_.prototype.revoke = function (token, actor) {
  return this.repository.updateById(token, { revokedAt: new Date(), revokedBy: actor });
};
JobQrTokenRepository_.prototype.findActiveByJobId = function (jobId) {
  return this.list().filter(function (record) {
    return String(record.jobId) === String(jobId) && !record.revokedAt;
  });
};

/** A token contains no job/customer information and is safe to place in a QR URL. */
function generateOpaqueJobQrToken_() {
  return Utilities.getUuid().replace(/-/g, '').toLowerCase();
}
function isValidOpaqueJobQrToken_(token) { return /^[a-f0-9]{32}$/.test(String(token || '')); }
