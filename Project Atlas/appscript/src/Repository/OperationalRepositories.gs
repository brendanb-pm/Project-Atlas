/** Repository wrappers for append-only job events and opaque QR tokens. */
function createOperationalRepository_(entityName, mapping) {
  var config = getShopOperationalConfig_();
  return new SheetsRepository(entityName, mapping, SpreadsheetApp.openById(config.spreadsheetId));
}

function JobEventRepository() {
  this.repository = createOperationalRepository_('JobEvent', getShopOperationalConfig_().eventMapping);
}
JobEventRepository.prototype.list = function () { return this.repository.list(); };
JobEventRepository.prototype.findById = function (eventId) { return this.repository.findById(eventId); };
JobEventRepository.prototype.append = function (event) {
  if (!event || !event.id) throw new VmosValidationError('Job event ID is required.');
  return this.repository.insert(event);
};
JobEventRepository.prototype.listByJobId = function (jobId) {
  return this.list().filter(function (event) { return String(event.jobId) === String(jobId); });
};

function JobQrTokenRepository() {
  this.repository = createOperationalRepository_('JobQrToken', getShopOperationalConfig_().qrMapping);
}
JobQrTokenRepository.prototype.list = function () { return this.repository.list(); };
JobQrTokenRepository.prototype.findByToken = function (token) { return this.repository.findById(token); };
JobQrTokenRepository.prototype.create = function (record) {
  if (!record || !record.id) throw new VmosValidationError('QR token is required.');
  if (!record.jobId) throw new VmosValidationError('Job ID is required for a QR token.');
  return this.repository.insert(record);
};
JobQrTokenRepository.prototype.findActiveByJobId = function (jobId) {
  return this.list().filter(function (record) {
    return String(record.jobId) === String(jobId) && !record.revokedAt;
  });
};

/** A token contains no job/customer information and is safe to place in a QR URL. */
function generateOpaqueJobQrToken_() {
  return Utilities.getUuid().replace(/-/g, '');
}
